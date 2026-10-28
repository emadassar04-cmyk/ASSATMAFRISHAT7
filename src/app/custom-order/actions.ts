'use server';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CONTENT_TYPE, customErrorMessage, MAX_IMAGES, MAX_IMAGE_BYTES, sniffImageExt } from '@/lib/customOrder';

export interface CustomState { error?: string }
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** طلب تفصيل: الصور تُرفع من الخادم إلى مخزن خاص بعد فحص محتواها، ثم تُنشأ السجلات عبر RPC */
export async function createCustomOrder(_prev: CustomState, formData: FormData): Promise<CustomState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/custom-order');
  if (s(formData, 'policy') !== 'on') return { error: customErrorMessage('policy_not_accepted') };

  const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_IMAGES) return { error: customErrorMessage('too_many_images') };

  const { data: customer } = await supabase.from('customers').select('id').eq('profile_id', user.id).maybeSingle();
  if (!customer) return { error: customErrorMessage('not_authenticated') };

  // فحص الصور قبل أي رفع: الحجم والنوع من المحتوى الفعلي
  const prepared: { path: string; bytes: Uint8Array; type: string }[] = [];
  for (const f of files) {
    if (f.size > MAX_IMAGE_BYTES) return { error: 'حجم الصورة أكبر من 5MB' };
    const bytes = new Uint8Array(await f.arrayBuffer());
    const ext = sniffImageExt(bytes);
    if (!ext) return { error: 'الصور المسموحة JPG أو PNG أو WebP فقط' };
    prepared.push({ path: `customers/${customer.id}/${randomUUID()}.${ext}`, bytes, type: CONTENT_TYPE[ext] });
  }

  const uploaded: string[] = [];
  if (prepared.length) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'رفع الصور غير متاح حالياً، أرسل الطلب بدون صور أو حاول لاحقاً' };
    const admin = createAdminClient();
    for (const p of prepared) {
      const { error } = await admin.storage.from('custom-refs').upload(p.path, p.bytes, { contentType: p.type, cacheControl: '3600' });
      if (error) {
        if (uploaded.length) await admin.storage.from('custom-refs').remove(uploaded);
        return { error: 'تعذّر رفع الصورة، حاول مرة أخرى' };
      }
      uploaded.push(p.path);
    }
  }

  const { data: id, error } = await supabase.rpc('create_custom_order', {
    p: {
      description: s(formData, 'description'), dimensions: s(formData, 'dimensions'), material: s(formData, 'material'), color: s(formData, 'color'),
      branch_id: s(formData, 'branch_id') || null, contact_phone: s(formData, 'phone'), contact_preference: s(formData, 'contact') || null,
      policy_accepted: true, reference_image_paths: uploaded,
    },
  });
  if (error || !id) {
    // لا نترك صوراً يتيمة إذا رفضت القاعدة الطلب
    if (uploaded.length && process.env.SUPABASE_SERVICE_ROLE_KEY) await createAdminClient().storage.from('custom-refs').remove(uploaded);
    return { error: customErrorMessage(error?.message) };
  }
  redirect(`/custom-orders/${id}?placed=1`);
}
