import { createClient } from '@supabase/supabase-js';

/**
 * عميل قراءة عامة (anon) بدون كوكيز، لصفحات الواجهة العامة القابلة للكاش (ISR).
 * يخضع لسياسات RLS الخاصة بالزائر.
 */
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
