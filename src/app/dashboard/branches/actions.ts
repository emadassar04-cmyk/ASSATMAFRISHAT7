'use server';
import { requireAdmin } from '@/lib/auth';
import { slugify } from '@/lib/format';
import { bool, go, isUuid, numOr, refreshStorefront, str, strOrNull } from '../actions-util';

const BACK = '/dashboard/branches';

export async function saveBranch(formData: FormData) {
  const { supabase } = await requireAdmin(BACK);
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (!name) go(BACK, { error: 'اسم الفرع مطلوب' });
  const row = {
    name, slug: slugify(str(formData, 'slug') || name), address: strOrNull(formData, 'address'), phone: strOrNull(formData, 'phone'),
    whatsapp: strOrNull(formData, 'whatsapp'), map_url: strOrNull(formData, 'map_url'), is_active: bool(formData, 'is_active'),
    sort_order: numOr(formData, 'sort_order'),
  };
  const q = isUuid(id) ? supabase.from('branches').update(row).eq('id', id) : supabase.from('branches').insert(row);
  const { error } = await q;
  if (error) go(BACK, { error: error.code === '23505' ? 'الرابط (slug) مستخدم' : 'تعذّر الحفظ' });
  refreshStorefront();
  go(BACK, { ok: 'تم حفظ الفرع' });
}

/** ساعات الدوام: فترة واحدة لكل يوم (فارغ = مغلق) */
export async function saveHours(formData: FormData) {
  const { supabase } = await requireAdmin(BACK);
  const id = str(formData, 'branch_id');
  if (!isUuid(id)) go(BACK, { error: 'معرّف غير صالح' });
  const rows: { branch_id: string; weekday: number; opens_at: string; closes_at: string }[] = [];
  for (let d = 0; d < 7; d++) {
    const o = str(formData, `open_${d}`); const c = str(formData, `close_${d}`);
    if (!o && !c) continue;
    if (!/^\d{2}:\d{2}$/.test(o) || !/^\d{2}:\d{2}$/.test(c) || o >= c) go(BACK, { error: 'وقت غير صالح (يجب أن يكون الفتح قبل الإغلاق)' });
    rows.push({ branch_id: id, weekday: d, opens_at: o, closes_at: c });
  }
  await supabase.from('branch_hours').delete().eq('branch_id', id);
  if (rows.length) await supabase.from('branch_hours').insert(rows);
  refreshStorefront();
  go(BACK, { ok: 'تم حفظ ساعات الدوام' });
}

export async function addHoliday(formData: FormData) {
  const { supabase } = await requireAdmin(BACK);
  const date = str(formData, 'on_date'); const bid = str(formData, 'branch_id');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) go(BACK, { error: 'تاريخ غير صالح' });
  await supabase.from('branch_holidays').insert({ on_date: date, branch_id: isUuid(bid) ? bid : null, reason: strOrNull(formData, 'reason') });
  refreshStorefront();
  go(BACK, { ok: 'تمت إضافة العطلة' });
}

export async function deleteHoliday(formData: FormData) {
  const { supabase } = await requireAdmin(BACK);
  const id = str(formData, 'id');
  if (isUuid(id)) await supabase.from('branch_holidays').delete().eq('id', id);
  refreshStorefront();
  go(BACK, { ok: 'تم حذف العطلة' });
}
