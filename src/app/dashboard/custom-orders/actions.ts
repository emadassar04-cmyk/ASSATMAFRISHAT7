'use server';
import { requireStaff } from '@/lib/auth';
import { customErrorMessage, isCustomStatus } from '@/lib/customOrder';
import { go, isUuid, str } from '../actions-util';

const back = (id: string) => `/dashboard/custom-orders/${id}`;

/** الدوال في القاعدة تتحقق من الدور (مشرف/إداري مع 2FA) ومن مخطط الانتقالات */
export async function quoteOrder(formData: FormData) {
  const id = str(formData, 'id');
  const { supabase } = await requireStaff(back(id));
  const price = Number(str(formData, 'price'));
  if (!isUuid(id) || !Number.isFinite(price)) go('/dashboard/custom-orders', { error: 'بيانات غير صالحة' });
  const { error } = await supabase.rpc('quote_custom_order', { p_id: id, p_price: price, p_note: str(formData, 'note') || null });
  if (error) go(back(id), { error: customErrorMessage(error.message) });
  go(back(id), { ok: 'تم التسعير وحساب العربون' });
}

export async function changeCustomStatus(formData: FormData) {
  const id = str(formData, 'id'); const to = str(formData, 'to');
  const { supabase } = await requireStaff(back(id));
  if (!isUuid(id) || !isCustomStatus(to)) go('/dashboard/custom-orders', { error: 'بيانات غير صالحة' });
  const { error } = await supabase.rpc('set_custom_order_status', { p_id: id, p_to: to, p_reason: str(formData, 'note') || null });
  if (error) go(back(id), { error: customErrorMessage(error.message) });
  go(back(id), { ok: 'تم تحديث الحالة' });
}
