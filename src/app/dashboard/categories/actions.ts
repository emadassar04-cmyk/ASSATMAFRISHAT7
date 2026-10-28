'use server';
import { requireStaff } from '@/lib/auth';
import { slugify } from '@/lib/format';
import { uploadImage } from '@/lib/storage';
import { bool, file, go, isUuid, refreshStorefront, str, strOrNull } from '../actions-util';

const BACK = '/dashboard/categories';

async function uniqueSlug(sb: Awaited<ReturnType<typeof requireStaff>>['supabase'], base: string, exceptId?: string) {
  let slug = base; let n = 1;
  for (;;) {
    const { data } = await sb.from('categories').select('id').eq('slug', slug).maybeSingle();
    if (!data || data.id === exceptId) return slug;
    slug = `${base}-${++n}`;
  }
}

export async function saveCategory(formData: FormData) {
  const { supabase } = await requireStaff(BACK);
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (!name) go(BACK, { error: 'اسم القسم مطلوب' });
  const parent = strOrNull(formData, 'parent_id');
  if (parent && (!isUuid(parent) || parent === id)) go(BACK, { error: 'القسم الأب غير صالح' });

  const row: Record<string, unknown> = {
    name, description: strOrNull(formData, 'description'), icon: strOrNull(formData, 'icon'),
    parent_id: parent, is_visible: bool(formData, 'is_visible'),
  };
  const img = file(formData, 'image');
  if (img) {
    const up = await uploadImage(supabase, 'category-images', 'categories', img);
    if ('error' in up) go(BACK, { error: up.error });
    row.image_path = up.path;
  }
  const slugInput = str(formData, 'slug');
  if (id) {
    row.slug = await uniqueSlug(supabase, slugify(slugInput || name), id);
    const { error } = await supabase.from('categories').update(row).eq('id', id);
    if (error) go(BACK, { error: 'تعذّر الحفظ' });
  } else {
    row.slug = await uniqueSlug(supabase, slugify(slugInput || name));
    // يوضع القسم الجديد في آخر قائمة أشقائه
    const sib = supabase.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const { data: last } = await (parent ? sib.eq('parent_id', parent) : sib.is('parent_id', null));
    row.sort_order = (last?.[0]?.sort_order ?? -1) + 1;
    const { error } = await supabase.from('categories').insert(row);
    if (error) go(BACK, { error: 'تعذّر الإضافة' });
  }
  refreshStorefront();
  go(BACK, { ok: 'تم الحفظ' });
}

export async function toggleCategory(formData: FormData) {
  const { supabase } = await requireStaff(BACK);
  const id = str(formData, 'id');
  if (!isUuid(id)) go(BACK, { error: 'معرّف غير صالح' });
  await supabase.from('categories').update({ is_visible: formData.get('to') === '1' }).eq('id', id);
  refreshStorefront();
  go(BACK, { ok: 'تم التحديث' });
}

export async function deleteCategory(formData: FormData) {
  const { supabase } = await requireStaff(BACK);
  const id = str(formData, 'id');
  if (!isUuid(id)) go(BACK, { error: 'معرّف غير صالح' });
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) go(BACK, { error: 'لا يمكن حذف قسم يحتوي أقساماً فرعية. احذفها أو انقلها أولاً.' });
  refreshStorefront();
  go(BACK, { ok: 'تم حذف القسم' });
}

/** ترتيب الأشقاء: يُحفظ الترتيب الجديد كما وصل */
export async function reorderCategories(ids: string[]) {
  const { supabase } = await requireStaff(BACK);
  const clean = ids.filter(isUuid);
  await Promise.all(clean.map((id, i) => supabase.from('categories').update({ sort_order: i }).eq('id', id)));
  refreshStorefront();
}
