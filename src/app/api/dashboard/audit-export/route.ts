import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ACTION_LABEL, AUDIT_EXPORT_MAX, ENTITY_LABEL, parseAuditFilters } from '@/lib/audit';
import { toCsv } from '@/lib/importExport';
import { applyAuditFilters } from '@/app/dashboard/audit/query';

/** تصدير سجل التعديلات (CSV) بنفس فلاتر الصفحة — للإداري والمدقق (مع 2FA). RLS هو خط الدفاع الأخير. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).single();
  if (!me?.is_active || !['admin', 'auditor'].includes(me.role)) return new NextResponse('Forbidden', { status: 403 });
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return new NextResponse('MFA required', { status: 403 });

  const f = parseAuditFilters(Object.fromEntries(new URL(req.url).searchParams));
  const { data, error } = await applyAuditFilters(supabase.from('audit_log').select('*'), f)
    .order('id', { ascending: false }).limit(AUDIT_EXPORT_MAX);
  if (error) return new NextResponse('Export failed', { status: 500 });

  const rows: string[][] = [['id', 'occurred_at_utc', 'actor', 'role', 'branch_id', 'entity', 'entity_id', 'action', 'sensitive', 'old_values', 'new_values']];
  for (const r of data ?? []) {
    rows.push([String(r.id), r.occurred_at, r.actor_name ?? '', r.actor_role ?? '', r.branch_id ?? '', ENTITY_LABEL[r.entity_type] ?? r.entity_type,
      r.entity_id ?? '', ACTION_LABEL[r.action] ?? r.action, r.is_sensitive ? '1' : '0',
      r.old_values ? JSON.stringify(r.old_values) : '', r.new_values ? JSON.stringify(r.new_values) : '']);
  }
  return new NextResponse(toCsv(rows), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' },
  });
}
