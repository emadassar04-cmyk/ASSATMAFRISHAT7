// حالات الطلب وتسمياتها وانتقالاتها (مرآة لدالة private.order_transition_ok في قاعدة البيانات؛ القاعدة هي المرجع).

export type OrderStatus =
  | 'new' | 'awaiting_payment_confirmation' | 'confirmed' | 'in_preparation'
  | 'ready_for_pickup' | 'out_for_delivery' | 'picked_up' | 'delivered' | 'cancelled';
export type Fulfillment = 'pickup' | 'delivery';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'طلب جديد',
  awaiting_payment_confirmation: 'بانتظار تأكيد الدفع',
  confirmed: 'مؤكَّد',
  in_preparation: 'قيد التجهيز',
  ready_for_pickup: 'جاهز للاستلام',
  out_for_delivery: 'خرج للتوصيل',
  picked_up: 'تم الاستلام',
  delivered: 'تم التوصيل',
  cancelled: 'ملغى',
};

export const ORDER_STATUS_CLASS: Record<OrderStatus, string> = {
  new: 'bg-primary/10 text-primary',
  awaiting_payment_confirmation: 'bg-accent/20 text-fg',
  confirmed: 'bg-ok/10 text-ok',
  in_preparation: 'bg-primary/10 text-primary',
  ready_for_pickup: 'bg-ok/10 text-ok',
  out_for_delivery: 'bg-primary/10 text-primary',
  picked_up: 'bg-ok/10 text-ok',
  delivered: 'bg-ok/10 text-ok',
  cancelled: 'bg-danger/10 text-danger',
};

export const isOrderStatus = (s: string): s is OrderStatus => s in ORDER_STATUS_LABEL;

/** الحالات التالية المسموحة من حالة معينة */
export function nextStatuses(from: OrderStatus, fulfillment: Fulfillment): OrderStatus[] {
  switch (from) {
    case 'new': return ['awaiting_payment_confirmation', 'confirmed', 'cancelled'];
    case 'awaiting_payment_confirmation': return ['confirmed', 'new', 'cancelled'];
    case 'confirmed': return ['in_preparation', 'cancelled'];
    case 'in_preparation': return [fulfillment === 'delivery' ? 'out_for_delivery' : 'ready_for_pickup', 'cancelled'];
    case 'ready_for_pickup': return ['picked_up'];
    case 'out_for_delivery': return ['delivered'];
    default: return [];
  }
}

/** يستطيع الزبون إلغاء طلبه فقط قبل التأكيد */
export const customerCanCancel = (s: OrderStatus) => s === 'new' || s === 'awaiting_payment_confirmation';
export const isClosed = (s: OrderStatus) => s === 'cancelled' || s === 'delivered' || s === 'picked_up';

/** رسائل أخطاء create_order وغيرها (الأكواد من RAISE EXCEPTION في القاعدة) */
const ERRORS: Record<string, string> = {
  policy_not_accepted: 'يجب الموافقة على سياسة الاستبدال لإتمام الطلب',
  invalid_items: 'محتوى السلة غير صالح',
  item_unavailable: 'أحد المنتجات لم يعد متاحاً',
  insufficient_stock: 'الكمية المطلوبة غير متوفرة في هذا الفرع',
  invalid_branch: 'الفرع المختار غير متاح',
  invalid_fulfillment: 'طريقة الاستلام غير صالحة',
  delivery_disabled: 'التوصيل غير متاح حالياً',
  invalid_zone: 'منطقة التوصيل غير متاحة',
  invalid_address: 'اكتب عنواناً واضحاً للتوصيل',
  invalid_phone: 'رقم الجوال غير صالح',
  invalid_payment_method: 'طريقة الدفع غير متاحة',
  invalid_contact_preference: 'وسيلة التواصل غير صالحة',
  note_too_long: 'الملاحظة طويلة جداً',
  not_authenticated: 'سجّل الدخول أولاً',
  order_not_found: 'الطلب غير موجود',
  invalid_transition: 'لا يمكن تنفيذ هذا التغيير على حالة الطلب الحالية',
  cancel_reason_required: 'اكتب سبب الإلغاء',
  invalid_fee: 'رسوم التوصيل غير صالحة',
  not_delivery_order: 'هذا الطلب ليس طلب توصيل',
  order_closed: 'الطلب منتهٍ ولا يمكن تعديله',
  not_allowed: 'غير مسموح',
  payment_already_reviewed: 'الدفعة روجعت مسبقاً',
  reject_reason_required: 'اكتب سبب الرفض',
};

export function orderErrorMessage(raw: string | undefined | null, detail?: string | null): string {
  const code = Object.keys(ERRORS).find((c) => (raw ?? '').includes(c));
  if (!code) return 'تعذّر تنفيذ العملية، حاول مرة أخرى';
  return code === 'insufficient_stock' && detail ? `الكمية المطلوبة من «${detail}» غير متوفرة في هذا الفرع` : ERRORS[code];
}
