'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export function LoginForm() {
  const next = useSearchParams().get('next');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'telegram'>('whatsapp');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: object) {
    setBusy(true); setErr('');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? 'حدث خطأ'); return null; }
      return j;
    } catch { setErr('تعذّر الاتصال، تحقق من الإنترنت'); return null; }
    finally { setBusy(false); }
  }

  return step === 'phone' ? (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await post('/api/auth/otp/request', { phone, channel })) setStep('code'); }}>
      <div>
        <label className="label" htmlFor="phone">رقم الجوال</label>
        <input id="phone" className="input" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX"
          value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <fieldset className="flex gap-4 text-sm">
        <legend className="label">إرسال الرمز عبر</legend>
        {(['whatsapp', 'telegram'] as const).map((c) => (
          <label key={c} className="flex items-center gap-1.5">
            <input type="radio" name="channel" checked={channel === c} onChange={() => setChannel(c)} />
            {c === 'whatsapp' ? 'واتساب' : 'تلجرام'}
          </label>
        ))}
      </fieldset>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? '...' : 'إرسال الرمز'}</button>
    </form>
  ) : (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const j = await post('/api/auth/otp/verify', { phone, code });
      if (j) window.location.assign(next && next.startsWith('/') && !next.startsWith('//') ? next : j.redirect);
    }}>
      <div>
        <label className="label" htmlFor="code">رمز التحقق (6 أرقام)</label>
        <input id="code" className="input text-center tracking-widest" dir="ltr" inputMode="numeric" autoComplete="one-time-code"
          maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
      </div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button className="btn btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? '...' : 'دخول'}</button>
      <button type="button" className="btn btn-outline w-full" onClick={() => { setStep('phone'); setCode(''); setErr(''); }}>تغيير الرقم</button>
    </form>
  );
}
