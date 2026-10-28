// منطق السلة النقي (بلا متصفح): تطبيع وحدود. السلة محلية (localStorage)؛ الأسعار هنا للعرض فقط،
// والسعر الحقيقي يُحسب في قاعدة البيانات عند create_order.

export interface CartLine {
  variantId: string; slug: string; name: string; options: string; price: number; qty: number; image: string | null;
}
export const MAX_QTY = 99;
export const MAX_LINES = 50;
const UUID = /^[0-9a-f-]{36}$/i;

const clampQty = (n: unknown) => Math.min(MAX_QTY, Math.max(1, Math.floor(Number(n) || 1)));

/** يقبل أي قيمة قادمة من التخزين (قد تكون تالفة أو معدّلة يدوياً) ويعيد سلة صالحة فقط */
export function normalizeCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, CartLine>();
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.variantId !== 'string' || !UUID.test(o.variantId)) continue;
    const price = Number(o.price);
    if (!Number.isFinite(price) || price < 0) continue;
    const prev = out.get(o.variantId);
    out.set(o.variantId, {
      variantId: o.variantId,
      slug: String(o.slug ?? '').slice(0, 200),
      name: String(o.name ?? '').slice(0, 200),
      options: String(o.options ?? '').slice(0, 200),
      price,
      qty: clampQty((prev?.qty ?? 0) + clampQty(o.qty)),
      image: typeof o.image === 'string' ? o.image.slice(0, 300) : null,
    });
    if (out.size >= MAX_LINES) break;
  }
  return [...out.values()];
}

export function addLine(cart: CartLine[], line: CartLine): CartLine[] {
  return normalizeCart([...cart, line]);
}
export const setLineQty = (cart: CartLine[], variantId: string, qty: number): CartLine[] =>
  cart.map((l) => (l.variantId === variantId ? { ...l, qty: clampQty(qty) } : l));
export const removeLine = (cart: CartLine[], variantId: string): CartLine[] => cart.filter((l) => l.variantId !== variantId);
export const cartCount = (cart: CartLine[]) => cart.reduce((n, l) => n + l.qty, 0);
export const cartSubtotal = (cart: CartLine[]) => cart.reduce((s, l) => s + l.price * l.qty, 0);
/** الحمولة المرسلة للخادم: المعرّف والكمية فقط (لا أسعار) */
export const cartPayload = (cart: CartLine[]) => cart.map((l) => ({ variant_id: l.variantId, quantity: l.qty }));
