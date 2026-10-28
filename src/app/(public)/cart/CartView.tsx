'use client';
import Link from 'next/link';
import { useCart, writeCart } from '@/lib/cart';
import { cartCount, cartSubtotal, removeLine, setLineQty, MAX_QTY } from '@/lib/cartCore';
import { formatPrice, publicUrl } from '@/lib/format';

export function CartView() {
  const cart = useCart();
  if (!cart.length) {
    return (
      <div className="card space-y-3 p-8 text-center">
        <p className="text-muted">سلتك فارغة.</p>
        <Link href="/products" className="btn btn-primary">تصفّح المنتجات</Link>
      </div>
    );
  }
  return (
    <>
      <ul className="space-y-3">
        {cart.map((l) => {
          const img = publicUrl('product-images', l.image);
          return (
            <li key={l.variantId} className="card flex gap-3 p-3">
              <div className="size-20 shrink-0 overflow-hidden rounded bg-border/40">
                {img ? <img src={img} alt="" loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-2xl text-muted/50" aria-hidden>🛋️</div>}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Link href={`/products/${encodeURIComponent(l.slug)}`} className="line-clamp-2 font-medium hover:text-primary">{l.name}</Link>
                {l.options && <p className="text-xs text-muted">{l.options}</p>}
                <p className="text-sm font-bold text-primary"><bdi>{formatPrice(l.price)}</bdi></p>
                <div className="flex items-center gap-2">
                  <button type="button" className="btn btn-outline btn-sm" aria-label="إنقاص" onClick={() => writeCart(setLineQty(cart, l.variantId, l.qty - 1))} disabled={l.qty <= 1}>−</button>
                  <span className="min-w-6 text-center" aria-live="polite"><bdi>{l.qty}</bdi></span>
                  <button type="button" className="btn btn-outline btn-sm" aria-label="زيادة" onClick={() => writeCart(setLineQty(cart, l.variantId, l.qty + 1))} disabled={l.qty >= MAX_QTY}>+</button>
                  <button type="button" className="ms-auto text-sm text-danger" onClick={() => writeCart(removeLine(cart, l.variantId))}>حذف</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="card space-y-3 p-4">
        <div className="flex items-center justify-between"><span>عدد القطع</span><bdi>{cartCount(cart)}</bdi></div>
        <div className="flex items-center justify-between text-lg font-bold"><span>المجموع</span><bdi className="text-primary">{formatPrice(cartSubtotal(cart))}</bdi></div>
        <p className="text-xs text-muted">السعر النهائي يُحسب عند تأكيد الطلب. الدفع والتوصيل يتم الاتفاق عليهما عبر واتساب أو فيسبوك بعد تقديم الطلب.</p>
        <Link href="/checkout" className="btn btn-primary w-full">متابعة إلى إتمام الطلب</Link>
      </div>
    </>
  );
}
