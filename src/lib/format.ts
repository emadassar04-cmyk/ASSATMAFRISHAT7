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

/**
 * رابط ماسنجر من رابط صفحة فيسبوك (facebook.com/اسم-الصفحة أو profile.php?id=رقم). يعيد null لأي رابط آخر.
 * ملاحظة: ماسنجر لا يدعم نصاً جاهزاً في الرابط، لذلك يُعرض رقم الطلب للنسخ.
 */
export function messengerLink(pageUrl: string | undefined): string | null {
  const u = httpUrl(pageUrl);
  if (!u) return null;
  try {
    const url = new URL(u);
    if (!/^(www\.|m\.|web\.)?facebook\.com$/i.test(url.hostname) && url.hostname.toLowerCase() !== 'fb.com') return null;
    const id = url.searchParams.get('id');
    if (url.pathname.replace(/\/+$/, '') === '/profile.php' && id && /^\d{5,20}$/.test(id)) return `https://m.me/${id}`;
    const name = url.pathname.split('/').filter(Boolean)[0];
    return name && /^[A-Za-z0-9.\-_]{3,}$/.test(name) && name !== 'profile.php' ? `https://m.me/${name}` : null;
  } catch {
    return null;
  }
}

/** رمز الدولة الافتراضي لأرقام الجوال المحلية (للروابط wa.me)؛ فلسطين */
export const DEFAULT_COUNTRY_CODE = '970';

/** أرقام دولية بلا + لاستخدامها في wa.me، من رقم محلي (05XXXXXXXX) أو دولي. يعيد null إن لم يكن رقماً صالحاً. */
export function intlDigits(phone: string | null | undefined, cc = DEFAULT_COUNTRY_CODE): string | null {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = cc + d.slice(1);
  else if (d.length <= 9) d = cc + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}
