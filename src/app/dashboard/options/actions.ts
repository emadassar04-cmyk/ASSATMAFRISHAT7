'use server';
import { requireStaff } from '@/lib/auth';
import { go, isUuid, refreshStorefront, str, strOrNull } from '../actions-util';

const BACK = '/dashboard/options';

export async function addOptionType(formData: FormData) {
  const { supabase } = await requireStaff(BACK);
  const name = str(formData, 'name');
  if (!name) go(BACK, { error: 'الاسم مطلوب' });
  const { error } = await supabase.from('option_types').insert({ name });
  if (error) go(BACK, { error: error.code === '23505' ? 'هذه الخاصية موجودة' : 'تعذّرت الإضافة' });
  refreshStorefront();
  go(BACK, { ok: 'تمت إضافة الخاصية' });
}

export async function deleteOptionType(formData: FormData) {
  const { supabase } = await requireStaff(BACK);
  const id = str(formData, 'id');
  if (!isUuid(id)) go(BACK, { error: 'معرّف غير صالح' });
  const { error } = await supabase.from('option_types').delete().eq('id', id);
  if (error) go(BACK, { error: 'لا يمكن الحذف: قيمها مستخدمة في منتجات' });
  refreshStorefront();
  go(BACK, { ok: 'تم الحذف' });
}

export async function addOptionValue(formData: FormData) {
  const { supabase } = await requireStaff(BACK);
  const type_id = str(formData, 'type_id');
  const value = str(formData, 'value');
  const swatch = strOrNull(formData, 'swatch');
  if (!isUuid(type_id) || !value) go(BACK, { error: 'القيمة مطلوبة' });
  if (swatch && !/^#[0-9a-fA-F]{3,8}$/.test(swatch)) go(BACK, { error: 'كود اللون غير صالح' });
  const { error } = await supabase.from('option_values').insert({ type_id, value, swatch });
  if (error) go(BACK, { error: error.code === '23505' ? 'القيمة موجودة' : 'تعذّرت الإضافة' });
  refreshStorefront();
  go(BACK, { ok: 'تمت إضافة القيمة' });
}

export async function deleteOptionValue(formData: FormData) {
  const { supabase } = await requireStaff(BACK);
  const id = str(formData, 'id');
  if (!isUuid(id)) go(BACK, { error: 'معرّف غير صالح' });
  const { error } = await supabase.from('option_values').delete().eq('id', id);
  if (error) go(BACK, { error: 'لا يمكن الحذف: القيمة مستخدمة في منتجات' });
  refreshStorefront();
  go(BACK, { ok: 'تم الحذف' });
}
