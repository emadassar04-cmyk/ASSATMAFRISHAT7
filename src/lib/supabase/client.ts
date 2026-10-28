import { createBrowserClient } from '@supabase/ssr';

/** عميل المتصفح (anon + جلسة المستخدم). */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
