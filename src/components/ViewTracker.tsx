'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/** تسجيل مشاهدة منتج مرة لكل جلسة */
export function ViewTracker({ productId }: { productId: string }) {
  useEffect(() => {
    try {
      const k = `viewed:${productId}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch { /* التخزين غير متاح */ }
    createClient().rpc('track_product_view', { p_product_id: productId }).then(() => {});
  }, [productId]);
  return null;
}
