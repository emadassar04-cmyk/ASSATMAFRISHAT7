import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { ACTION_LABEL, AUDIT_PAGE_SIZE, DISPLAY_TZ, diffRows, ENTITY_LABEL, parseAuditFilters, ROLE_LABEL, shortId } from '@/lib/audit';
import { PageHeader, type SP } from '../_ui';
import { applyAuditFilters } from './query';

export const metadata = { title: 'سجل التعديلات' };

interface Row {
  id: number; occurred_at: string; actor_name: string | null; actor_role: string | null; branch_id: string | null; entity_type: string;
  entity_id: string | null; action: string; old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null;
  is_sensitive: boolean; source: string;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = parseAuditFilters(sp);
  const { supabase, profile } = await requireRole(['admin', 'auditor'], '/dashboard/audit');

  const from = (f.page - 1) * AUDIT_PAGE_SIZE;
  const [{ data, count }, { data: branches }] = await Promise.all([
    applyAuditFilters(supabase.from('audit_log').select('*', { count: 'exact' }), f)
      .order('id', { ascending: false }).range(from, from + AUDIT_PAGE_SIZE - 1),
    supabase.from('branches').select('id, name').order('sort_order'),
  ]);
  const rows = (data ?? []) as Row[];
  const branchName = new Map((branches ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / AUDIT_PAGE_SIZE));

  const qs = (over: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ actor: f.actor, entity: f.entity, action: f.action, branch: f.branch, from: f.from, to: f.to, sensitive: f.sensitive ? '1' : '', ...over })) if (v) u.set(k, v);
    return u.toString();
  };
  const when = (iso: string) => new Date(iso).toLocaleString('ar', { timeZone: DISPLAY_TZ, dateStyle: 'short', timeStyle: 'medium' });

  return (
    <>
      <PageHeader title="سجل التعديلات">
        <a href={`/api/dashboard/audit-export?${qs({})}`} className="btn btn-outline btn-sm">تصدير CSV</a>
      </PageHeader>
      <p className="mb-3 text-xs text-muted">
        {profile.role === 'auditor' ? 'عرض للقراءة فقط. ' : ''}السجل لا يمكن تعديله أو حذفه من أي دور. التوقيت: <bdi>{DISPLAY_TZ}</bdi>.
      </p>

      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input name="actor" defaultValue={f.actor} placeholder="اسم المستخدم" className="input" aria-label="المستخدم" />
        <select name="entity" defaultValue={f.entity} className="input" aria-label="النوع">
          <option value="">كل الأنواع</option>{Object.entries(ENTITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select name="action" defaultValue={f.action} className="input" aria-label="الإجراء">
          <option value="">كل الإجراءات</option>{Object.entries(ACTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select name="branch" defaultValue={f.branch} className="input" aria-label="الفرع">
          <option value="">كل الفروع</option>{(branches ?? []).map((b: { id: string; name: string }) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><span className="shrink-0 text-muted">من</span><input name="from" type="date" defaultValue={f.from} className="input" dir="ltr" /></label>
        <label className="flex items-center gap-2 text-sm"><span className="shrink-0 text-muted">إلى</span><input name="to" type="date" defaultValue={f.to} className="input" dir="ltr" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sensitive" value="1" defaultChecked={f.sensitive} className="size-4 accent-[var(--primary)]" /> الحساسة فقط</label>
        <button className="btn btn-primary">تصفية</button>
      </form>

      <p className="mb-2 text-sm text-muted">النتائج: <bdi>{count ?? 0}</bdi></p>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r) => {
            const diff = diffRows(r.old_values, r.new_values);
            return (
              <li key={r.id}>
                <details className={`card p-3 ${r.is_sensitive ? 'border-danger/40' : ''}`}>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <b>{ACTION_LABEL[r.action] ?? r.action}</b> {ENTITY_LABEL[r.entity_type] ?? r.entity_type}
                      <bdi className="text-muted"> #{shortId(r.entity_id)}</bdi>
                      <span className="text-muted"> — {r.actor_name ?? (r.source === 'system' ? 'النظام' : 'غير معروف')}{r.actor_role && ` (${ROLE_LABEL[r.actor_role] ?? r.actor_role})`}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {r.is_sensitive && <span className="badge bg-danger/10 text-danger">حساس</span>}
                      {r.branch_id && branchName.get(r.branch_id) && <span>{branchName.get(r.branch_id)}</span>}
                      <bdi>{when(r.occurred_at)}</bdi>
                    </span>
                  </summary>
                  {diff.length ? (
                    <table className="mt-3 w-full text-start text-xs">
                      <thead><tr className="text-muted"><th className="py-1 text-start font-medium">الحقل</th><th className="text-start font-medium">قبل</th><th className="text-start font-medium">بعد</th></tr></thead>
                      <tbody>{diff.map((d) => (
                        <tr key={d.key} className="border-t border-border align-top">
                          <td className="py-1 pe-2"><bdi>{d.key}</bdi></td><td className="pe-2 text-danger"><bdi className="break-all">{d.old}</bdi></td><td className="text-ok"><bdi className="break-all">{d.new}</bdi></td>
                        </tr>))}</tbody>
                    </table>
                  ) : <p className="mt-2 text-xs text-muted">لا تفاصيل.</p>}
                </details>
              </li>
            );
          })}
        </ul>
      ) : <p className="card p-6 text-center text-muted">لا توجد سجلات مطابقة.</p>}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="الصفحات">
          {f.page > 1 ? <Link className="btn btn-outline btn-sm" href={`?${qs({ page: String(f.page - 1) })}`}>→ السابق</Link> : <span />}
          <span className="text-muted"><bdi>{f.page}</bdi> / <bdi>{pages}</bdi></span>
          {f.page < pages ? <Link className="btn btn-outline btn-sm" href={`?${qs({ page: String(f.page + 1) })}`}>التالي ←</Link> : <span />}
        </nav>
      )}
    </>
  );
}
