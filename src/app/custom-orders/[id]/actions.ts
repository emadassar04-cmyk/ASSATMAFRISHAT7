'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { customErrorMessage } from '@/lib/customOrder';

export async function cancelCustomOrder(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect('/account');
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_my_custom_order', { p_id: id, p_reason: String(formData.get('reason') ?? '').slice(0, 300) });
  redirect(`/custom-orders/${id}?${error ? `error=${encodeURIComponent(customErrorMessage(error.message))}` : `ok=${encodeURIComponent('تم إلغاء الطلب')}`}`);
}
