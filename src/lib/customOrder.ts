// منطق طلب التفصيل النقي: الحالات والتسميات والتحقق من الصور المرجعية.

export type CustomStatus = 'new' | 'quoted' | 'deposit_pending' | 'in_progress' | 'ready' | 'delivered' | 'cancelled';

export const CUSTOM_STATUS_LABEL: Record<CustomStatus, string> = {
  new: 'بانتظار التسعير',
  quoted: 'تم التسعير',
  deposit_pending: 'بانتظار العربون',
  in_progress: 'قيد التنفيذ',
  ready: 'جاهز',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
};
export const CUSTOM_STATUS_CLASS: Record<CustomStatus, string> = {
  new: 'bg-primary/10 text-primary',
  quoted: 'bg-accent/20 text-fg',
  deposit_pending: 'bg-accent/20 text-fg',
  in_progress: 'bg-primary/10 text-primary',
  ready: 'bg-ok/10 text-ok',
  delivered: 'bg-ok/10 text-ok',
  cancelled: 'bg-danger/10 text-danger',
};
export const isCustomStatus = (s: string): s is CustomStatus => s in CUSTOM_STATUS_LABEL;

/** الحالات التالية (مرآة private.custom_transition_ok؛ القاعدة هي المرجع). التسعير يتم عبر نموذج مستقل. */
export function nextCustomStatuses(from: CustomStatus): CustomStatus[] {
  switch (from) {
    case 'new': return ['cancelled'];
    case 'quoted': return ['deposit_pending', 'in_progress', 'cancelled'];
    case 'deposit_pending': return ['in_progress', 'cancelled'];
    case 'in_progress': return ['ready', 'cancelled'];
    case 'ready': return ['delivered'];
    default: return [];
  }
}
export const canRequote = (s: CustomStatus) => s === 'new' || s === 'quoted' || s === 'deposit_pending';
export const customerCanCancelCustom = (s: CustomStatus) => s === 'new' || s === 'quoted';

export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** نوع الصورة من محتواها (الـ magic bytes) لا من اسمها أو نوعها المُعلَن، ويعيد الامتداد أو null */
export function sniffImageExt(b: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}
export const CONTENT_TYPE: Record<'jpg' | 'png' | 'webp', string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const ERRORS: Record<string, string> = {
  policy_not_accepted: 'يجب الموافقة على شروط الطلبات المفصّلة',
  invalid_description: 'اكتب وصفاً واضحاً للقطعة (10 أحرف على الأقل)',
  invalid_phone: 'رقم الجوال غير صالح',
  invalid_contact_preference: 'وسيلة التواصل غير صالحة',
  invalid_field: 'أحد الحقول طويل جداً',
  invalid_branch: 'الفرع المختار غير متاح',
  too_many_images: 'الحد الأقصى 3 صور مرجعية',
  invalid_image_path: 'الصورة غير صالحة',
  too_many_requests: 'أرسلت طلبات كثيرة اليوم، انتظر ردّنا أولاً',
  not_authenticated: 'سجّل الدخول أولاً',
  order_not_found: 'الطلب غير موجود',
  invalid_transition: 'لا يمكن تنفيذ هذا التغيير على حالة الطلب الحالية',
  cancel_reason_required: 'اكتب سبب الإلغاء',
  invalid_price: 'السعر غير صالح',
  quote_required: 'سعّر الطلب أولاً',
  not_allowed: 'غير مسموح',
};
export function customErrorMessage(raw: string | null | undefined): string {
  const code = Object.keys(ERRORS).find((c) => (raw ?? '').includes(c));
  return code ? ERRORS[code] : 'تعذّر تنفيذ العملية، حاول مرة أخرى';
}
