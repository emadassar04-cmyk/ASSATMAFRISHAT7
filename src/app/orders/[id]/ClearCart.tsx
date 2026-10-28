'use client';
import { useEffect } from 'react';
import { clearCart } from '@/lib/cart';

/** يفرّغ السلة بعد نجاح تقديم الطلب (يُعرض فقط عند ?placed=1) */
export function ClearCart() {
  useEffect(() => { clearCart(); }, []);
  return null;
}
