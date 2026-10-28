import { describe, expect, it } from 'vitest';
import { customerCanCancel, isClosed, nextStatuses, orderErrorMessage, ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/orderStatus';
import { addLine, cartCount, cartPayload, cartSubtotal, normalizeCart, removeLine, setLineQty, MAX_QTY, type CartLine } from '@/lib/cartCore';
import { intlDigits, messengerLink } from '@/lib/format';
import { canRequote, customErrorMessage, customerCanCancelCustom, CUSTOM_STATUS_LABEL, nextCustomStatuses, sniffImageExt } from '@/lib/customOrder';

const V1 = 'dddddddd-0000-0000-0000-000000000001';
const V2 = 'dddddddd-0000-0000-0000-000000000002';
const line = (over: Partial<CartLine> = {}): CartLine => ({ variantId: V1, slug: 's', name: 'كنب', options: 'بيج', price: 100, qty: 1, image: null, ...over });

describe('انتقالات حالة الطلب (مرآة القاعدة)', () => {
  it('الحالات النهائية لا ينتقل منها', () => {
    for (const s of ['cancelled', 'delivered', 'picked_up'] as OrderStatus[]) expect(nextStatuses(s, 'delivery')).toEqual([]);
  });
  it('استلام: in_preparation → ready_for_pickup → picked_up', () => {
    expect(nextStatuses('in_preparation', 'pickup')).toEqual(['ready_for_pickup', 'cancelled']);
    expect(nextStatuses('ready_for_pickup', 'pickup')).toEqual(['picked_up']);
  });
  it('توصيل: in_preparation → out_for_delivery → delivered (ولا ready_for_pickup)', () => {
    expect(nextStatuses('in_preparation', 'delivery')).toEqual(['out_for_delivery', 'cancelled']);
    expect(nextStatuses('out_for_delivery', 'delivery')).toEqual(['delivered']);
    expect(nextStatuses('confirmed', 'delivery')).not.toContain('ready_for_pickup');
  });
  it('لكل حالة اسم عربي، والإلغاء متاح قبل التحضير فقط للزبون', () => {
    expect(Object.keys(ORDER_STATUS_LABEL)).toHaveLength(9);
    expect(customerCanCancel('new')).toBe(true);
    expect(customerCanCancel('confirmed')).toBe(false);
    expect(isClosed('cancelled') && isClosed('delivered') && !isClosed('new')).toBe(true);
  });
  it('رسائل الأخطاء بالعربية وتذكر اسم المنتج عند نقص المخزون', () => {
    expect(orderErrorMessage('policy_not_accepted')).toMatch(/سياسة الاستبدال/);
    expect(orderErrorMessage('insufficient_stock', 'كنب 3 مقاعد')).toContain('كنب 3 مقاعد');
    expect(orderErrorMessage('xyz')).toMatch(/حاول مرة أخرى/);
  });
});

describe('السلة', () => {
  it('تدمج المتكرر وتحدّ الكمية بـ 99', () => {
    const c = addLine(addLine([], line({ qty: 60 })), line({ qty: 60 }));
    expect(c).toHaveLength(1);
    expect(c[0].qty).toBe(MAX_QTY);
  });
  it('تتجاهل البيانات التالفة أو المعدّلة يدوياً', () => {
    expect(normalizeCart('x')).toEqual([]);
    expect(normalizeCart([null, 5, { variantId: 'not-uuid', price: 1 }, { variantId: V1, price: -5 }, { variantId: V1, price: 'abc' }])).toEqual([]);
    expect(normalizeCart([{ variantId: V1, price: 10, qty: -3, name: 'x' }])[0].qty).toBe(1);
    expect(normalizeCart([{ variantId: V1, price: 10, qty: 1e9 }])[0].qty).toBe(MAX_QTY);
  });
  it('تحدّ عدد السطور بـ 50', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ variantId: `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, '0')}`, price: 1, qty: 1 }));
    expect(normalizeCart(many)).toHaveLength(50);
  });
  it('الكمية والحذف والمجموع', () => {
    let c = [line({ qty: 2 }), line({ variantId: V2, price: 250, qty: 1 })];
    expect(cartCount(c)).toBe(3);
    expect(cartSubtotal(c)).toBe(450);
    c = setLineQty(c, V1, 5);
    expect(cartSubtotal(c)).toBe(750);
    expect(setLineQty(c, V1, 0)[0].qty).toBe(1);
    expect(removeLine(c, V1)).toHaveLength(1);
  });
  it('الحمولة المرسلة للخادم بلا أسعار', () => {
    const p = cartPayload([line({ qty: 2, price: 1 })]);
    expect(p).toEqual([{ variant_id: V1, quantity: 2 }]);
    expect(JSON.stringify(p)).not.toMatch(/price/);
  });
});

describe('رابط ماسنجر', () => {
  it('من رابط صفحة فيسبوك', () => {
    expect(messengerLink('https://www.facebook.com/alassar.furniture')).toBe('https://m.me/alassar.furniture');
    expect(messengerLink('https://facebook.com/alassar/')).toBe('https://m.me/alassar');
    expect(messengerLink('https://m.facebook.com/profile.php?id=100012345678901')).toBe('https://m.me/100012345678901');
  });
  it('يرفض الروابط الأخرى والقيم الوهمية', () => {
    expect(messengerLink('https://evil.com/facebook.com/page')).toBeNull();
    expect(messengerLink('[رابط صفحة فيسبوك]')).toBeNull();
    expect(messengerLink(undefined)).toBeNull();
    expect(messengerLink('https://facebook.com/')).toBeNull();
  });
});

describe('أرقام الجوال الدولية لروابط واتساب', () => {
  it('يحوّل المحلي والدولي لصيغة واحدة', () => {
    for (const x of ['0599123456', '599123456', '+970599123456', '00970599123456', '970 599-123456']) expect(intlDigits(x)).toBe('970599123456');
  });
  it('يرفض غير الصالح', () => {
    for (const x of ['', 'abc', '123', null, undefined]) expect(intlDigits(x)).toBeNull();
  });
});

describe('طلب التفصيل', () => {
  it('مسار الحالات (مرآة القاعدة)', () => {
    expect(nextCustomStatuses('new')).toEqual(['cancelled']);
    expect(nextCustomStatuses('quoted')).toEqual(['deposit_pending', 'in_progress', 'cancelled']);
    expect(nextCustomStatuses('in_progress')).toEqual(['ready', 'cancelled']);
    expect(nextCustomStatuses('ready')).toEqual(['delivered']);
    expect(nextCustomStatuses('delivered')).toEqual([]);
    expect(nextCustomStatuses('cancelled')).toEqual([]);
    expect(Object.keys(CUSTOM_STATUS_LABEL)).toHaveLength(7);
  });
  it('التسعير والإلغاء ضمن الحالات الصحيحة', () => {
    expect(canRequote('new') && canRequote('quoted') && !canRequote('in_progress')).toBe(true);
    expect(customerCanCancelCustom('quoted') && !customerCanCancelCustom('in_progress')).toBe(true);
  });
  it('نوع الصورة من المحتوى: JPG/PNG/WebP فقط', () => {
    expect(sniffImageExt(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('jpg');
    expect(sniffImageExt(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(sniffImageExt(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe('webp');
  });
  it('يرفض SVG وHTML وPDF وأي محتوى آخر حتى لو كان الاسم صورة', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(sniffImageExt(enc('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageExt(enc('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageExt(enc('%PDF-1.7'))).toBeNull();
    expect(sniffImageExt(new Uint8Array(0))).toBeNull();
    expect(sniffImageExt(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull();   // WAV لا WebP
  });
  it('رسائل الأخطاء بالعربية', () => {
    expect(customErrorMessage('too_many_requests')).toMatch(/كثيرة/);
    expect(customErrorMessage('???')).toMatch(/حاول مرة أخرى/);
  });
});
