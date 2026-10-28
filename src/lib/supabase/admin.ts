import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * عميل service_role: يتجاوز RLS. للخادم فقط وللعمليات الموثوقة (إنشاء مستخدم).
 * ممنوع استيراده في أي Client Component (server-only يمنع ذلك عند البناء).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY غير مضبوط');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
