import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ImageBucket = 'product-images' | 'category-images' | 'branding';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * مسار رفع الصور الموحّد (نقطة التمديد الوحيدة).
 * اليوم: يرفع الأصل كما هو. المرحلة 4: تُضاف هنا خطوة ضغط WebP + لوجو المتجر
 * دون تعديل أي مكان آخر في النظام.
 */
export async function uploadImage(
  sb: SupabaseClient, bucket: ImageBucket, folder: string, file: File,
): Promise<{ path: string } | { error: string }> {
  if (!ALLOWED.has(file.type)) return { error: 'نوع الصورة غير مدعوم (JPG/PNG/WebP فقط)' };
  if (file.size > MAX_BYTES) return { error: 'حجم الصورة أكبر من 5MB' };
  const path = `${folder}/${randomUUID()}.${EXT[file.type]}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  return error ? { error: 'تعذّر رفع الصورة' } : { path };
}
