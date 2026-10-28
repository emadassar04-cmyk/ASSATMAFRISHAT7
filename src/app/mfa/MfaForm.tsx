'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** إعداد (Enroll) أو إدخال (Challenge) رمز تطبيق المصادقة TOTP — إلزامي للإداري */
export function MfaForm() {
  const next = useSearchParams().get('next');
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: list } = await sb.auth.mfa.listFactors();
      const verified = list?.totp?.find((f) => f.status === 'verified');
      if (verified) { setFactorId(verified.id); return; }
      // أي محاولة تسجيل غير مكتملة تُحذف قبل البدء من جديد
      for (const f of list?.all ?? []) if (f.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' });
      if (error || !data) { setErr('تعذّر بدء الإعداد'); return; }
      setFactorId(data.id);
      setEnroll({ qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true); setErr('');
    const sb = createClient();
    const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId });
    if (e1 || !ch) { setErr('تعذّر بدء التحقق'); setBusy(false); return; }
    const { error: e2 } = await sb.auth.mfa.verify({ factorId, challengeId: ch.id, code });
    if (e2) { setErr('الرمز غير صحيح'); setBusy(false); return; }
    window.location.assign(dest);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {enroll ? (
        <>
          <p className="text-sm text-muted">امسح الرمز بتطبيق المصادقة (Google Authenticator / Microsoft Authenticator) ثم أدخل الرمز المكوّن من 6 أرقام.</p>
          <img src={enroll.qr} alt="رمز QR للمصادقة" className="mx-auto size-48 rounded bg-white p-2" />
          <p className="break-all text-center text-xs text-muted" dir="ltr">{enroll.secret}</p>
        </>
      ) : (
        <p className="text-sm text-muted">أدخل الرمز الحالي من تطبيق المصادقة.</p>
      )}
      <input className="input text-center tracking-widest" dir="ltr" inputMode="numeric" maxLength={6} autoComplete="one-time-code"
        value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="رمز التحقق" required />
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button className="btn btn-primary w-full" disabled={busy || code.length !== 6 || !factorId}>تأكيد</button>
    </form>
  );
}
