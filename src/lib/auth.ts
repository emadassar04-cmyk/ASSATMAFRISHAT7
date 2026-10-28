import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AppRole } from '@/types';

export interface AuthCtx {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  profile: { id: string; email: string | null; full_name: string | null; role: AppRole; branch_id: string | null };
}

/**
 * يتحقق من الجلسة والدور (من قاعدة البيانات لا من الـ JWT).
 * الإداري يتطلب 2FA (aal2)؛ بدونه يُحوَّل إلى /mfa.
 * RLS يبقى خط الدفاع الأخير حتى لو أُسيء استخدام هذه الدالة.
 */
export async function requireRole(roles: AppRole[], nextPath = '/dashboard'): Promise<AuthCtx> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const { data: profile } = await supabase.from('profiles')
    .select('id, email, full_name, role, branch_id, is_active').eq('id', user.id).single();
  if (!profile || !profile.is_active || !roles.includes(profile.role)) redirect('/');
  if (profile.role === 'admin' || profile.role === 'auditor') {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== 'aal2') redirect(`/mfa?next=${encodeURIComponent(nextPath)}`);
  }
  return { supabase, userId: user.id, profile };
}

export const requireStaff = (nextPath?: string) => requireRole(['moderator', 'admin'], nextPath);
export const requireAdmin = (nextPath?: string) => requireRole(['admin'], nextPath);
