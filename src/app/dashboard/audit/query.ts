import { dayStartUtc, nextDayStartUtc, type AuditFilters } from '@/lib/audit';

/** يطبّق الفلاتر على استعلام audit_log (مشترك بين الصفحة والتصدير). الصلاحية تُفرض بـ RLS لا هنا. */
export function applyAuditFilters<T extends { eq: any; ilike: any; gte: any; lt: any }>(q: T, f: AuditFilters): T {
  let r = q;
  if (f.actor) r = r.ilike('actor_name', `%${f.actor}%`);
  if (f.entity) r = r.eq('entity_type', f.entity);
  if (f.action) r = r.eq('action', f.action);
  if (f.branch) r = r.eq('branch_id', f.branch);
  if (f.sensitive) r = r.eq('is_sensitive', true);
  if (f.from) r = r.gte('occurred_at', dayStartUtc(f.from));
  if (f.to) r = r.lt('occurred_at', nextDayStartUtc(f.to));
  return r;
}
