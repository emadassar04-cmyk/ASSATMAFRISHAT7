'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const sp = useSearchParams();
  const next = sp.get('next');
  const [err, setErr] = useState(sp.get('error') ? 'تعذّر تسجيل الدخول، حاول مرة أخرى' : '');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true); setErr('');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? `?next=${encodeURIComponent(next)}` : '';
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback${safeNext}` },
    });
    if (error) { setErr('تعذّر بدء تسجيل الدخول'); setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={signIn}>
        {busy ? '...' : 'الدخول بحساب Google'}
      </button>
    </div>
  );
}
