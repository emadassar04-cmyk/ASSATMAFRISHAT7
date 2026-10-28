// منطق نقي (بدون قاعدة بيانات) لاستيراد/تصدير المنتجات — قابل للاختبار.
// صيغة الملف: صف لكل Variant. أعمدة المخزون: stock:<branch_slug>

export const BASE_COLS = [
  'product_slug', 'name', 'category', 'description', 'base_price', 'visible', 'featured',
  'sku', 'variant_price', 'compare_at_price', 'options',
] as const;

export const STOCK_PREFIX = 'stock:';

/** قارئ CSV (RFC4180): يدعم الاقتباس والأسطر المتعددة وBOM */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/** حماية من حقن الصيغ في Excel عند التصدير */
const guard = (s: string) => (/^[=+@]/.test(s) ? `'${s}` : s);
export const unguard = (s: string) => (/^'[=+@]/.test(s) ? s.slice(1) : s);

export function toCsv(rows: string[][]): string {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return '﻿' + rows.map((r) => r.map((c) => esc(guard(c))).join(',')).join('\r\n') + '\r\n';
}

/** "اللون=بيج;الخامة=قطن" <-> [["اللون","بيج"],["الخامة","قطن"]] */
export function parseOptions(s: string): [string, string][] {
  return s.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    return i > 0 ? ([p.slice(0, i).trim(), p.slice(i + 1).trim()] as [string, string]) : null;
  }).filter((x): x is [string, string] => !!x && !!x[0] && !!x[1]);
}
export const formatOptions = (o: [string, string][]) => o.map(([t, v]) => `${t}=${v}`).join(';');

export type ImportRecord = Record<string, string>;

/** يحوّل مصفوفة الصفوف (الصف الأول رؤوس) إلى سجلات */
export function rowsToRecords(rows: string[][]): { records: ImportRecord[]; stockCols: string[]; missing: string[] } {
  if (!rows.length) return { records: [], stockCols: [], missing: ['name'] };
  const header = rows[0].map((h) => h.trim());
  const missing = ['name'].filter((c) => !header.includes(c));
  const stockCols = header.filter((h) => h.startsWith(STOCK_PREFIX));
  const records = rows.slice(1).map((r) => {
    const rec: ImportRecord = {};
    header.forEach((h, i) => { rec[h] = unguard((r[i] ?? '').trim()); });
    return rec;
  });
  return { records, stockCols, missing };
}

export const parseBool = (s: string | undefined, d: boolean) => {
  const v = (s ?? '').trim().toLowerCase();
  if (!v) return d;
  return ['1', 'true', 'yes', 'y', 'نعم', 'ظاهر', 'x'].includes(v);
};

/** كمية المخزون: رقم، أو "mto"/"حسب الطلب" */
export function parseStock(s: string): { quantity: number; mto: boolean } | null {
  const v = s.trim().toLowerCase();
  if (!v) return null;
  if (v === 'mto' || v === 'حسب الطلب') return { quantity: 0, mto: true };
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? { quantity: Math.floor(n), mto: false } : null;
}
