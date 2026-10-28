import { requireAdmin } from '@/lib/auth';
import type { AppRole, Branch } from '@/types';
import { Check, Field, Flash, PageHeader, type SP, first } from '../_ui';
import { addStaff, updateUser } from './actions';

export const metadata = { title: 'المستخدمون' };

const ROLE_LABEL: Record<AppRole, string> = { customer: 'زبون', moderator: 'مشرف صفحات', admin: 'إداري', auditor: 'مشرف متابعة' };

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, userId } = await requireAdmin('/dashboard/users');
  const q = first(sp.q).trim();
  const role = first(sp.role);
  let query = supabase.from('profiles').select('id, email, full_name, role, is_active, branch_id').order('created_at', { ascending: false }).limit(100);
  if (q) query = query.ilike('email', `%${q.replace(/[%,]/g, '')}%`);
  if (role in ROLE_LABEL) query = query.eq('role', role);
  const [{ data: users }, { data: branches }] = await Promise.all([query, supabase.from('branches').select('id,name').order('sort_order')]);
  type U = { id: string; email: string | null; full_name: string | null; role: AppRole; is_active: boolean; branch_id: string | null };

  return (
    <>
      <PageHeader title="المستخدمون والصلاحيات" />
      <Flash sp={sp} />
      <form action={addStaff} className="card mb-4 grid gap-2 p-4 sm:grid-cols-[1fr_1fr_auto_auto]">
        <Field label="Gmail الموظف"><input name="email" type="email" dir="ltr" placeholder="name@gmail.com" className="input" required /></Field>
        <Field label="الاسم"><input name="full_name" className="input" /></Field>
        <Field label="الدور">
          <select name="role" className="input"><option value="moderator">مشرف صفحات</option><option value="admin">إداري</option><option value="auditor">مشرف متابعة</option></select>
        </Field>
        <div className="flex items-end"><button className="btn btn-primary w-full">+ إضافة</button></div>
      </form>
      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_auto_auto]">
        <input name="q" defaultValue={q} dir="ltr" placeholder="بحث بالبريد" className="input" aria-label="بحث" />
        <select name="role" defaultValue={role} className="input" aria-label="الدور">
          <option value="">كل الأدوار</option>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn btn-outline">بحث</button>
      </form>
      <div className="space-y-2">
        {((users ?? []) as U[]).map((u) => (
          <details key={u.id} className="card p-3">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
              <span><bdi>{u.email}</bdi> {u.full_name && `— ${u.full_name}`}</span>
              <span className="flex gap-1">
                <span className="badge bg-primary/10 text-primary">{ROLE_LABEL[u.role]}</span>
                {!u.is_active && <span className="badge bg-danger/10 text-danger">موقوف</span>}
              </span>
            </summary>
            <form action={updateUser} className="grid gap-3 pt-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={u.id} />
              <Field label="الاسم"><input name="full_name" defaultValue={u.full_name ?? ''} className="input" /></Field>
              <Field label="الدور">
                <select name="role" defaultValue={u.role} className="input" disabled={u.id === userId}>
                  {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {u.id === userId && <input type="hidden" name="role" value={u.role} />}
              </Field>
              <Field label="الفرع">
                <select name="branch_id" defaultValue={u.branch_id ?? ''} className="input">
                  <option value="">—</option>{((branches ?? []) as Pick<Branch, 'id' | 'name'>[]).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <div className="flex items-end justify-between gap-2">
                {u.id === userId ? <input type="hidden" name="is_active" value="on" /> : <Check name="is_active" label="فعّال" defaultChecked={u.is_active} />}
                <button className="btn btn-primary btn-sm">حفظ</button>
              </div>
            </form>
          </details>
        ))}
      </div>
    </>
  );
}
