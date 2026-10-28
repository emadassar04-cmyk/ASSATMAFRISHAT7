'use client';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { cartCount } from '@/lib/cartCore';

/** أيقونة السلة في الترويسة مع عدد القطع */
export function CartLink() {
  const n = cartCount(useCart());
  return (
    <Link href="/cart" aria-label={n ? `السلة، ${n} قطعة` : 'السلة'} className="btn btn-outline btn-sm relative">
      <span aria-hidden>🛒</span>
      {n > 0 && (
        <span className="absolute -top-1.5 -end-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-5 text-primary-fg">{n}</span>
      )}
    </Link>
  );
}
