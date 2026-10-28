import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** يستلم رمز Google من Supabase ويفتح الجلسة ثم يوجّه حسب الدور */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  const fail = () => NextResponse.redirect(new URL('/login?error=1', url.origin));
  if (!code) return fail();

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role, is_active').eq('id', user.id).single()
    : { data: null };
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return fail();
  }
  const staff = profile.role === 'admin' || profile.role === 'moderator' || profile.role === 'auditor';
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : staff ? '/dashboard' : '/account';
  return NextResponse.redirect(new URL(dest, url.origin));
}
