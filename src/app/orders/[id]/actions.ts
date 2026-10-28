'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { orderErrorMessage } from '@/lib/orderStatus';

/** إلغاء الزبون لطلبه قبل التأكيد (القاعدة تتحقق من الملكية والحالة وتعيد المخزون) */
export async function cancelOrder(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect('/account');
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_my_order', { p_order: id, p_reason: String(formData.get('reason') ?? '').slice(0, 300) });
  const q = error ? `error=${encodeURIComponent(orderErrorMessage(error.message))}` : `ok=${encodeURIComponent('تم إلغاء الطلب')}`;
  redirect(`/orders/${id}?${q}`);
}
