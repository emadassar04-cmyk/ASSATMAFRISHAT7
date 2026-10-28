'use client';
import { useSyncExternalStore } from 'react';
import { addLine, normalizeCart, type CartLine } from './cartCore';

const KEY = 'cart:v1';
const EVENT = 'cart:change';
let cache: { raw: string | null; lines: CartLine[] } = { raw: null, lines: [] };
const EMPTY: CartLine[] = [];

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cache.raw) return cache.lines;
    cache = { raw, lines: raw ? normalizeCart(JSON.parse(raw)) : EMPTY };
    return cache.lines;
  } catch {
    return EMPTY;
  }
}

export function writeCart(lines: CartLine[]) {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* التخزين غير متاح: تبقى السلة في الذاكرة فقط */ }
  window.dispatchEvent(new Event(EVENT));
}
export const addToCart = (line: CartLine) => writeCart(addLine(read(), line));
export const clearCart = () => writeCart([]);

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb); };
}

/** السلة الحالية (تتحدّث بين التبويبات والمكوّنات) */
export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
