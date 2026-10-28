'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_LINES } from '@/lib/cartCore';
import { orderErrorMessage } from '@/lib/orderStatus';

export interface CheckoutState { error?: string }
const UUID = /^[0-9a-f-]{36}$/i;
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** تقديم الطلب: الخادم يرسل المعرّفات والكميات فقط؛ السعر والمخزون والتوصيل تُحسب في قاعدة البيانات */
export async function placeOrder(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/checkout');

  let items: { variant_id: string; quantity: number }[] = [];
  try {
    const parsed = JSON.parse(s(formData, 'cart'));
    if (Array.isArray(parsed)) {
      items = parsed.slice(0, MAX_LINES).map((x) => ({ variant_id: String(x?.variant_id ?? ''), quantity: Number(x?.quantity) }));
    }
  } catch { /* سلة تالفة */ }
  if (!items.length || items.some((i) => !UUID.test(i.variant_id) || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99)) {
    return { error: 'سلتك فارغة أو غير صالحة. أضف منتجاً ثم حاول مرة أخرى.' };
  }
  if (s(formData, 'policy') !== 'on') return { error: orderErrorMessage('policy_not_accepted') };

  // حد المحاولات: 5 طلبات لكل 10 دقائق للمستخدم (يُتجاوز محلياً إن غاب مفتاح الخادم)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data: ok } = await createAdminClient().rpc('check_rate_limit', { p_key: `order:${user.id}`, p_limit: 5, p_window_seconds: 600 });
    if (ok === false) return { error: 'محاولات كثيرة، انتظر قليلاً ثم حاول مرة أخرى.' };
  }

  const fulfillment = s(formData, 'fulfillment') === 'delivery' ? 'delivery' : 'pickup';
  const { data, error } = await supabase.rpc('create_order', {
    p: {
      branch_id: s(formData, 'branch_id'),
      fulfillment,
      delivery_zone_id: fulfillment === 'delivery' ? s(formData, 'zone_id') : null,
      delivery_address: fulfillment === 'delivery' ? s(formData, 'address') : null,
      contact_phone: s(formData, 'phone'),
      contact_preference: s(formData, 'contact') || null,
      customer_note: s(formData, 'note') || null,
      exchange_policy_accepted: true,
      items,
    },
  });
  if (error || !data?.order_id) return { error: orderErrorMessage(error?.message, error?.details) };
  redirect(`/orders/${data.order_id}?placed=1`);
}
