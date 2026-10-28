import { describe, expect, it } from 'vitest';
import { ACTION_LABEL, dayStartUtc, diffRows, ENTITY_LABEL, nextDayStartUtc, parseAuditFilters, shortId } from '@/lib/audit';

describe('فلاتر سجل التعديلات', () => {
  it('تقبل القيم الصحيحة', () => {
    const f = parseAuditFilters({ actor: 'عماد', entity: 'order', action: 'status_change', branch: 'eeeeeeee-0000-0000-0000-000000000001', from: '2026-10-01', to: '2026-10-28', sensitive: '1', page: '3' });
    expect(f).toEqual({ actor: 'عماد', entity: 'order', action: 'status_change', branch: 'eeeeeeee-0000-0000-0000-000000000001', from: '2026-10-01', to: '2026-10-28', sensitive: true, page: 3 });
  });
  it('تهمل القيم المزوّرة أو غير المعروفة', () => {
    const f = parseAuditFilters({ entity: 'users;drop', action: 'x', branch: "1' or '1'='1", from: '2026-13-45', to: 'yesterday', sensitive: 'yes', page: '-5' });
    expect(f).toMatchObject({ entity: '', action: '', branch: '', from: '', to: '', sensitive: false, page: 1 });
  });
  it('تنظّف نص المستخدم من محارف فلتر PostgREST ولا تتجاوز 60', () => {
    expect(parseAuditFilters({ actor: 'a%,b(c)*\\d' }).actor).toBe('abcd');
    expect(parseAuditFilters({ actor: 'x'.repeat(200) }).actor).toHaveLength(60);
  });
  it('رقم الصفحة محدود', () => {
    expect(parseAuditFilters({ page: '99999999' }).page).toBe(10_000);
    expect(parseAuditFilters({}).page).toBe(1);
  });
});

describe('حدود الأيام بتوقيت المنطقة المعروضة', () => {
  it('UTC بلا إزاحة', () => expect(dayStartUtc('2026-01-15', 'UTC')).toBe('2026-01-15T00:00:00.000Z'));
  it('غزة شتاءً (+2) وصيفاً (+3)', () => {
    expect(dayStartUtc('2026-01-15', 'Asia/Gaza')).toBe('2026-01-14T22:00:00.000Z');
    expect(dayStartUtc('2026-07-15', 'Asia/Gaza')).toBe('2026-07-14T21:00:00.000Z');
  });
  it('نهاية اليوم = بداية اليوم التالي (يشمل اليوم كاملاً)', () => {
    expect(nextDayStartUtc('2026-01-15', 'UTC')).toBe('2026-01-16T00:00:00.000Z');
    expect(nextDayStartUtc('2026-12-31', 'UTC')).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('عرض الفروقات', () => {
  it('تعديل: القديم والجديد للأعمدة المتغيّرة، وتُخفى الأعمدة الداخلية', () => {
    const rows = diffRows({ base_price: 100, search: "'a':1", updated_at: 'x' }, { base_price: 120, search: "'a':2", updated_at: 'y' });
    expect(rows).toEqual([{ key: 'base_price', old: '100', new: '120' }]);
  });
  it('إضافة: القديم فارغ، وحذف: الجديد فارغ', () => {
    expect(diffRows(null, { name: 'كنب' })).toEqual([{ key: 'name', old: '—', new: 'كنب' }]);
    expect(diffRows({ name: 'كنب' }, null)).toEqual([{ key: 'name', old: 'كنب', new: '—' }]);
  });
  it('تقتطع القيم الطويلة وتعرض null كشرطة', () => {
    const [r] = diffRows({ a: 'x'.repeat(500) }, { a: null });
    expect(r.old.length).toBeLessThanOrEqual(120);
    expect(r.new).toBe('—');
  });
  it('تسميات عربية لكل الأنواع والإجراءات وshortId', () => {
    expect(Object.keys(ENTITY_LABEL)).toEqual(expect.arrayContaining(['product', 'order', 'payment', 'user', 'custom_order']));
    expect(ACTION_LABEL.price_change).toBe('تغيير سعر');
    expect(shortId('aaaaaaaa-0000-0000-0000-000000000001')).toBe('aaaaaaaa');
    expect(shortId(null)).toBe('—');
  });
});
