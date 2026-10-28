import type { Availability } from '@/types';

/** سعر بالشيكل بأرقام لاتينية. */
export function formatPrice(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ₪`;
}

export function priceRange(from: number, to: number): string {
  return Number(from) === Number(to) ? formatPrice(from) : `${formatPrice(from)} - ${formatPrice(to)}`;
}

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'متوفر',
  limited: 'كمية محدودة',
  out_of_stock: 'نفذ',
  made_to_order: 'حسب الطلب',
};

export const AVAILABILITY_CLASS: Record<Availability, string> = {
  available: 'bg-ok/10 text-ok',
  limited: 'bg-accent/20 text-fg',
  out_of_stock: 'bg-danger/10 text-danger',
  made_to_order: 'bg-primary/10 text-primary',
};

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const hhmm = (t: string) => t.slice(0, 5);

/** رابط ملف عام من Supabase Storage. */
export function publicUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
}

/** سلاج عربي صديق للروابط: يحافظ على الحروف العربية ويستبدل الفراغات بشرطة. */
export function slugify(input: string): string {
  const s = input
    .trim()
    .replace(/[ً-ْـ]/g, '') // التشكيل والتطويل
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return s || `item-${Math.random().toString(36).slice(2, 8)}`;
}

export function decodeSlug(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** رابط واتساب/تلجرام فقط إذا كانت القيمة رقماً/معرّفاً حقيقياً (وليس placeholder). */
export function waLink(number: string | undefined, text?: string): string | null {
  const digits = (number ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
export function tgLink(handle: string | undefined, text?: string): string | null {
  const h = (handle ?? '').replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_]{4,}$/.test(h)) return null;
  return `https://t.me/${h}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
export function httpUrl(u: string | undefined): string | null {
  return u && /^https?:\/\//.test(u) ? u : null;
}
