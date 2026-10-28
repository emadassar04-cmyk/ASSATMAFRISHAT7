'use server';
import { requireAdmin } from '@/lib/auth';
import { isOrderStatus, orderErrorMessage } from '@/lib/orderStatus';
import { go, isUuid, str } from '../actions-util';

const back = (id: string) => `/dashboard/orders/${id}`;

/** كل الإجراءات عبر RPC تتحقق في القاعدة من الإداري + 2FA ومن مخطط الانتقالات */
export async function changeStatus(formData: FormData) {
  const id = str(formData, 'id'); const to = str(formData, 'to');
  const { supabase } = await requireAdmin(back(id));
  if (!isUuid(id) || !isOrderStatus(to)) go('/dashboard/orders', { error: 'بيانات غير صالحة' });
  const { error } = await supabase.rpc('set_order_status', { p_order: id, p_to: to, p_note: str(formData, 'note') || null });
  if (error) go(back(id), { error: orderErrorMessage(error.message) });
  go(back(id), { ok: 'تم تحديث حالة الطلب' });
}

export async function setFee(formData: FormData) {
  const id = str(formData, 'id');
  const { supabase } = await requireAdmin(back(id));
  const fee = Number(str(formData, 'fee'));
  if (!isUuid(id) || !Number.isFinite(fee)) go('/dashboard/orders', { error: 'بيانات غير صالحة' });
  const { error } = await supabase.rpc('set_delivery_fee', { p_order: id, p_fee: fee, p_note: str(formData, 'note') || null });
  if (error) go(back(id), { error: orderErrorMessage(error.message) });
  go(back(id), { ok: 'تم تحديد رسوم التوصيل وتحديث الإجمالي' });
}

export async function reviewPayment(formData: FormData) {
  const id = str(formData, 'order_id'); const pay = str(formData, 'payment_id'); const decision = str(formData, 'decision');
  const { supabase } = await requireAdmin(back(id));
  if (!isUuid(id) || !isUuid(pay) || !['confirmed', 'rejected'].includes(decision)) go('/dashboard/orders', { error: 'بيانات غير صالحة' });
  const { error } = await supabase.rpc('review_payment', { p_payment: pay, p_decision: decision, p_reason: str(formData, 'reason') || null });
  if (error) go(back(id), { error: orderErrorMessage(error.message) });
  go(back(id), { ok: decision === 'confirmed' ? 'تم تأكيد الدفعة' : 'تم رفض الدفعة' });
}
