'use server';
import { requireStaff } from '@/lib/auth';
import { uploadImage } from '@/lib/storage';
import { bool, file, go, isUuid, numOr, refreshStorefront, str, strOrNull } from '../actions-util';

const BACK = '/dashboard/offers';

export async function saveOffer(formData: FormData) {
  const { supabase } = await requireStaff(BACK);
  const id = str(formData, 'id');
  const title = str(formData, 'title');
  if (!title) go(BACK, { error: 'عنوان العرض مطلوب' });
  const dtype = str(formData, 'discount_type');
  const date = (k: string) => { const v = str(formData, k); return v ? new Date(v).toISOString() : null; };
  const row: Record<string, unknown> = {
    title, description: strOrNull(formData, 'description'),
    discount_type: dtype === 'percent' || dtype === 'fixed' ? dtype : null,
    discount_value: dtype ? numOr(formData, 'discount_value') : null,
    starts_at: date('starts_at'), ends_at: date('ends_at'), is_visible: bool(formData, 'is_visible'),
  };
  const img = file(formData, 'image');
  if (img) {
    const up = await uploadImage(supabase, 'product-images', 'offers', img);
    if ('error' in up) go(BACK, { error: up.error });
    row.image_path = up.path;
  }
  let offerId = id;
  if (isUuid(id)) {
    const { error } = await supabase.from('offers').update(row).eq('id', id);
    if (error) go(BACK, { error: 'تعذّر الحفظ' });
  } else {
    const { data, error } = await supabase.from('offers').insert(row).select('id').single();
    if (error || !data) go(BACK, { error: 'تعذّرت الإضافة' });
    offerId = data.id;
  }
  const productIds = formData.getAll('product_ids').map(String).filter(isUuid);
  await supabase.from('offer_products').delete().eq('offer_id', offerId);
  if (productIds.length) await supabase.from('offer_products').insert(productIds.map((product_id) => ({ offer_id: offerId, product_id })));
  refreshStorefront();
  go(BACK, { ok: 'تم حفظ العرض' });
}

export async function deleteOffer(formData: FormData) {
  const { supabase } = await requireStaff(BACK);
  const id = str(formData, 'id');
  if (!isUuid(id)) go(BACK, { error: 'معرّف غير صالح' });
  await supabase.from('offers').delete().eq('id', id);
  refreshStorefront();
  go(BACK, { ok: 'تم حذف العرض' });
}
