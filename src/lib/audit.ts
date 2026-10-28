// سجل التعديلات (Audit Log): تسميات وتحليل الفلاتر وعرض الفروقات. منطق نقي قابل للاختبار.

/** المنطقة الزمنية للعرض (التخزين UTC) */
export const DISPLAY_TZ = 'Asia/Gaza';
export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_EXPORT_MAX = 5000;

export const ENTITY_LABEL: Record<string, string> = {
  product: 'منتج', variant: 'خيار منتج', category: 'قسم', offer: 'عرض', setting: 'إعداد', branch: 'فرع',
  payment_method: 'طريقة دفع', delivery_zone: 'منطقة توصيل', user: 'مستخدم', order: 'طلب', payment: 'دفعة',
  custom_order: 'طلب تفصيل', integration: 'ربط', bot_message: 'نص البوت', kb_document: 'قاعدة المعرفة',
};
export const ACTION_LABEL: Record<string, string> = {
  insert: 'إضافة', update: 'تعديل', delete: 'حذف', status_change: 'تغيير حالة', price_change: 'تغيير سعر', role_change: 'تغيير دور',
};
export const ROLE_LABEL: Record<string, string> = { customer: 'زبون', moderator: 'مشرف صفحات', admin: 'إداري', auditor: 'مشرف متابعة' };

export interface AuditFilters {
  actor: string; entity: string; action: string; branch: string; from: string; to: string; sensitive: boolean; page: number;
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** يحوّل معاملات الرابط إلى فلاتر آمنة (أي قيمة غير معروفة تُهمَل) */
export function parseAuditFilters(sp: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (k: string) => String((Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? '').trim();
  const valid = (d: string) => DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  const entity = one('entity'); const action = one('action'); const branch = one('branch');
  return {
    actor: one('actor').replace(/[%,()*\\]/g, '').slice(0, 60),
    entity: entity in ENTITY_LABEL ? entity : '',
    action: action in ACTION_LABEL ? action : '',
    branch: UUID.test(branch) ? branch : '',
    from: valid(one('from')) ? one('from') : '',
    to: valid(one('to')) ? one('to') : '',
    sensitive: one('sensitive') === '1',
    page: Math.min(10_000, Math.max(1, Math.floor(Number(one('page'))) || 1)),
  };
}

/** بداية يوم (بتوقيت المنطقة المعروضة) بصيغة ISO UTC، لاستخدامها في الفلترة */
export function dayStartUtc(date: string, tz = DISPLAY_TZ): string {
  const utcMidnight = new Date(`${date}T00:00:00Z`);
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(utcMidnight).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = part.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  const offMin = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  return new Date(utcMidnight.getTime() - offMin * 60_000).toISOString();
}
export function nextDayStartUtc(date: string, tz = DISPLAY_TZ): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return dayStartUtc(d.toISOString().slice(0, 10), tz);
}

export interface DiffRow { key: string; old: string; new: string }
const HIDDEN_KEYS = new Set(['search', 'updated_at']);
const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
};

/** صفوف القيمة القديمة/الجديدة لعرضها (يُخفي الأعمدة الداخلية المُولَّدة) */
export function diffRows(oldV: Record<string, unknown> | null, newV: Record<string, unknown> | null): DiffRow[] {
  const keys = [...new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})])].filter((k) => !HIDDEN_KEYS.has(k)).sort();
  return keys.map((key) => ({ key, old: oldV && key in oldV ? fmt(oldV[key]) : '—', new: newV && key in newV ? fmt(newV[key]) : '—' }));
}

export const shortId = (id: string | null) => (id ? (id.length > 8 ? id.slice(0, 8) : id) : '—');
