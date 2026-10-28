'use server';
import { requireStaff } from '@/lib/auth';
import { slugify } from '@/lib/format';
import { uploadImage } from '@/lib/storage';
import { bool, file, go, isUuid, numOr, refreshStorefront, str, strOrNull } from '../actions-util';

const LIST = '/dashboard/products';
type Ctx = Awaited<ReturnType<typeof requireStaff>>;

async function uniqueProductSlug(sb: Ctx['supabase'], base: string, exceptId?: string) {
  let slug = base; let n = 1;
  for (;;) {
    const { data } = await sb.from('products').select('id').eq('slug', slug).maybeSingle();
    if (!data || data.id === exceptId) return slug;
    slug = `${base}-${++n}`;
  }
}

function productFields(f: FormData) {
  const cat = str(f, 'category_id');
  return {
    name: str(f, 'name'),
    description: strOrNull(f, 'description'),
    category_id: isUuid(cat) ? cat : null,
    base_price: Math.max(0, numOr(f, 'base_price')),
    is_visible: bool(f, 'is_visible'),
    is_featured: bool(f, 'is_featured'),
    is_custom_orderable: bool(f, 'is_custom_orderable'),
  };
}

export async function createProduct(formData: FormData) {
  const { supabase, userId } = await requireStaff(LIST);
  const row = productFields(formData);
  if (!row.name) go(`${LIST}/new`, { error: 'اسم المنتج مطلوب' });
  const slug = await uniqueProductSlug(supabase, slugify(str(formData, 'slug') || row.name));
  const { data, error } = await supabase.from('products').insert({ ...row, slug, created_by: userId }).select('id').single();
  if (error || !data) go(`${LIST}/new`, { error: 'تعذّر إنشاء المنتج' });
  refreshStorefront();
  go(`${LIST}/${data.id}`, { ok: 'تم إنشاء المنتج. أضف الصور والخيارات الآن.' });
}

export async function updateProduct(formData: FormData) {
  const { supabase } = await requireStaff(LIST);
  const id = str(formData, 'id');
  if (!isUuid(id)) go(LIST, { error: 'معرّف غير صالح' });
  const row = productFields(formData);
  if (!row.name) go(`${LIST}/${id}`, { error: 'اسم المنتج مطلوب' });
  const slug = await uniqueProductSlug(supabase, slugify(str(formData, 'slug') || row.name), id);
  const { error } = await supabase.from('products').update({ ...row, slug }).eq('id', id);
  if (error) go(`${LIST}/${id}`, { error: 'تعذّر الحفظ' });
  refreshStorefront();
  go(`${LIST}/${id}`, { ok: 'تم حفظ المنتج' });
}

export async function deleteProduct(formData: FormData) {
  const { supabase } = await requireStaff(LIST);
  const id = str(formData, 'id');
  if (!isUuid(id)) go(LIST, { error: 'معرّف غير صالح' });
  const { data: imgs } = await supabase.from('product_images').select('path').eq('product_id', id);
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) go(`${LIST}/${id}`, { error: 'تعذّر الحذف' });
  if (imgs?.length) await supabase.storage.from('product-images').remove(imgs.map((i: { path: string }) => i.path));
  refreshStorefront();
  go(LIST, { ok: 'تم حذف المنتج' });
}

export async function addImages(formData: FormData) {
  const { supabase } = await requireStaff(LIST);
  const id = str(formData, 'product_id');
  if (!isUuid(id)) go(LIST, { error: 'معرّف غير صالح' });
  const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) go(`${LIST}/${id}`, { error: 'اختر صورة واحدة على الأقل' });
  const { data: last } = await supabase.from('product_images').select('sort_order').eq('product_id', id).order('sort_order', { ascending: false }).limit(1);
  let order = (last?.[0]?.sort_order ?? -1) + 1;
  for (const f of files.slice(0, 10)) {
    const up = await uploadImage(supabase, 'product-images', `products/${id}`, f);
    if ('error' in up) go(`${LIST}/${id}`, { error: up.error });
    await supabase.from('product_images').insert({ product_id: id, path: up.path, alt: strOrNull(formData, 'alt'), sort_order: order++ });
  }
  refreshStorefront();
  go(`${LIST}/${id}`, { ok: 'تم رفع الصور' });
}

export async function deleteImage(formData: FormData) {
  const { supabase } = await requireStaff(LIST);
  const id = str(formData, 'id'); const pid = str(formData, 'product_id');
  if (!isUuid(id) || !isUuid(pid)) go(LIST, { error: 'معرّف غير صالح' });
  const { data } = await supabase.from('product_images').select('path').eq('id', id).maybeSingle();
  await supabase.from('product_images').delete().eq('id', id);
  if (data?.path) await supabase.storage.from('product-images').remove([data.path]);
  refreshStorefront();
  go(`${LIST}/${pid}`, { ok: 'تم حذف الصورة' });
}

export async function makePrimaryImage(formData: FormData) {
  const { supabase } = await requireStaff(LIST);
  const id = str(formData, 'id'); const pid = str(formData, 'product_id');
  if (!isUuid(id) || !isUuid(pid)) go(LIST, { error: 'معرّف غير صالح' });
  const { data: first } = await supabase.from('product_images').select('sort_order').eq('product_id', pid).order('sort_order').limit(1);
  await supabase.from('product_images').update({ sort_order: (first?.[0]?.sort_order ?? 0) - 1 }).eq('id', id);
  refreshStorefront();
  go(`${LIST}/${pid}`, { ok: 'تم تعيين الصورة الرئيسية' });
}

/** حفظ Variant: السعر + الخيارات + مخزون كل فرع */
export async function saveVariant(formData: FormData) {
  const { supabase } = await requireStaff(LIST);
  const pid = str(formData, 'product_id');
  const vid = str(formData, 'id');
  if (!isUuid(pid)) go(LIST, { error: 'معرّف غير صالح' });
  const back = `${LIST}/${pid}`;
  const price = numOr(formData, 'price', -1);
  if (price < 0) go(back, { error: 'السعر مطلوب' });

  const row = {
    product_id: pid, sku: strOrNull(formData, 'sku'), price,
    compare_at_price: formData.get('compare_at_price') ? numOr(formData, 'compare_at_price') : null,
    is_active: bool(formData, 'is_active'),
  };
  let variantId = vid;
  if (isUuid(vid)) {
    const { error } = await supabase.from('product_variants').update(row).eq('id', vid);
    if (error) go(back, { error: error.code === '23505' ? 'رمز SKU مستخدم لمنتج آخر' : 'تعذّر الحفظ' });
  } else {
    const { data, error } = await supabase.from('product_variants').insert(row).select('id').single();
    if (error || !data) go(back, { error: error?.code === '23505' ? 'رمز SKU مستخدم لمنتج آخر' : 'تعذّر الإضافة' });
    variantId = data.id;
  }

  // الخيارات: حقل option_<typeId> يحمل valueId
  const valueIds: string[] = [];
  for (const [k, v] of formData.entries()) if (k.startsWith('option_') && isUuid(String(v))) valueIds.push(String(v));
  await supabase.from('variant_options').delete().eq('variant_id', variantId);
  if (valueIds.length) await supabase.from('variant_options').insert(valueIds.map((value_id) => ({ variant_id: variantId, value_id })));

  // مخزون كل فرع: stock_<branchId> = الكمية، mto_<branchId> = حسب الطلب
  const stockRows: { variant_id: string; branch_id: string; quantity: number; status: string }[] = [];
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith('stock_')) continue;
    const branchId = k.slice(6);
    if (!isUuid(branchId)) continue;
    stockRows.push({
      variant_id: variantId, branch_id: branchId, quantity: Math.max(0, Math.floor(Number(v) || 0)),
      status: formData.get(`mto_${branchId}`) === 'on' ? 'made_to_order' : 'available', // يُعاد حسابها بالـ trigger
    });
  }
  if (stockRows.length) await supabase.from('branch_stock').upsert(stockRows, { onConflict: 'variant_id,branch_id' });

  refreshStorefront();
  go(back, { ok: 'تم حفظ الخيار' });
}

export async function deleteVariant(formData: FormData) {
  const { supabase } = await requireStaff(LIST);
  const id = str(formData, 'id'); const pid = str(formData, 'product_id');
  if (!isUuid(id) || !isUuid(pid)) go(LIST, { error: 'معرّف غير صالح' });
  await supabase.from('product_variants').delete().eq('id', id);
  refreshStorefront();
  go(`${LIST}/${pid}`, { ok: 'تم حذف الخيار' });
}
