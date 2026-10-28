import { describe, expect, it } from 'vitest';
import { formatOptions, parseBool, parseCsv, parseOptions, parseStock, rowsToRecords, toCsv, unguard } from '@/lib/importExport';
import { normalizePhone } from '@/lib/phone';
import { slugify, waLink, tgLink } from '@/lib/format';
import { themeToCss } from '@/lib/settings';

describe('CSV', () => {
  it('round-trip مع فواصل وأسطر واقتباس وعربي', () => {
    const rows = [['name', 'description'], ['كنب "ركنة"', 'سطر1\nسطر2, فاصلة'], ['=SUM(A1)', '+1']];
    const csv = toCsv(rows);
    const back = parseCsv(csv).map((r) => r.map(unguard));
    expect(back).toEqual(rows);
  });
  it('يتجاهل BOM والأسطر الفارغة', () => {
    expect(parseCsv('﻿a,b\r\n\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('options/stock', () => {
  it('parseOptions/formatOptions', () => {
    const o = parseOptions('اللون=بيج; الخامة = قطن;خطأ');
    expect(o).toEqual([['اللون', 'بيج'], ['الخامة', 'قطن']]);
    expect(formatOptions(o)).toBe('اللون=بيج;الخامة=قطن');
  });
  it('parseStock', () => {
    expect(parseStock('5')).toEqual({ quantity: 5, mto: false });
    expect(parseStock('حسب الطلب')).toEqual({ quantity: 0, mto: true });
    expect(parseStock('')).toBeNull();
    expect(parseStock('-1')).toBeNull();
  });
  it('parseBool', () => {
    expect(parseBool('نعم', false)).toBe(true);
    expect(parseBool('0', true)).toBe(false);
    expect(parseBool('', true)).toBe(true);
  });
  it('rowsToRecords يكتشف أعمدة المخزون والناقص', () => {
    const r = rowsToRecords([['name', 'stock:النصيرات'], ['كنب', '3']]);
    expect(r.stockCols).toEqual(['stock:النصيرات']);
    expect(r.records[0].name).toBe('كنب');
    expect(rowsToRecords([['x'], ['1']]).missing).toEqual(['name']);
  });
});

describe('phone', () => {
  it.each([['0599123456', '+970599123456'], ['599123456', '+970599123456'], ['+970599123456', '+970599123456'],
    ['00972599123456', '+970599123456'], ['059-912 3456', '+970599123456']])('%s', (i, o) => expect(normalizePhone(i)).toBe(o));
  it.each(['0123', 'abc', '0699123456', ''])('يرفض %s', (i) => expect(normalizePhone(i)).toBeNull());
});

describe('format', () => {
  it('slugify يحافظ على العربية', () => {
    expect(slugify('كنب  ركنة، كلاسيك!')).toBe('كنب-ركنة-كلاسيك');
  });
  it('روابط التواصل تتجاهل الـ placeholders', () => {
    expect(waLink('[رقم واتساب]')).toBeNull();
    expect(waLink('970599123456', 'مرحبا')).toContain('wa.me/970599123456');
    expect(tgLink('[معرّف تلجرام]')).toBeNull();
    expect(tgLink('@alassar_store')).toContain('t.me/alassar_store');
  });
  it('themeToCss يرفض القيم الخطرة', () => {
    expect(themeToCss({ colors: { primary: '#112233', bg: 'red;}body{display:none' } })).toBe(':root{--primary:#112233}');
  });
});
