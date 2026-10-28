'use client';
import { useEffect } from 'react';

/** تسجيل Service Worker (PWA + كاش الصفحات الأساسية) في الإنتاج فقط */
export function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
