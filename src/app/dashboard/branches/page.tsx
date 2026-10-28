import { requireAdmin } from '@/lib/auth';
import { WEEKDAYS, hhmm } from '@/lib/format';
import type { Branch, BranchHour } from '@/types';
import { Check, Field, Flash, PageHeader, type SP } from '../_ui';
import { addHoliday, deleteHoliday, saveBranch, saveHours } from './actions';

export const metadata = { title: 'الفروع والدوام' };

export default async function BranchesAdminPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin('/dashboard/branches');
  const [{ data: branches }, { data: hours }, { data: holidays }] = await Promise.all([
    supabase.from('branches').select('*').order('sort_order'),
    supabase.from('branch_hours').select('*'),
    supabase.from('branch_holidays').select('*').order('on_date', { ascending: false }).limit(50),
  ]);
  const list = (branches ?? []) as Branch[];

  const branchForm = (b?: Branch) => (
    <form action={saveBranch} className="grid gap-3 sm:grid-cols-2">
      {b && <input type="hidden" name="id" value={b.id} />}
      <Field label="اسم الفرع"><input name="name" defaultValue={b?.name} className="input" required /></Field>
      <Field label="الرابط (slug)"><input name="slug" defaultValue={b?.slug} dir="ltr" className="input" /></Field>
      <Field label="العنوان" className="sm:col-span-2"><input name="address" defaultValue={b?.address ?? ''} className="input" /></Field>
      <Field label="هاتف"><input name="phone" defaultValue={b?.phone ?? ''} dir="ltr" className="input" /></Field>
      <Field label="واتساب الفرع"><input name="whatsapp" defaultValue={b?.whatsapp ?? ''} dir="ltr" className="input" /></Field>
      <Field label="رابط الخريطة (لعرضها داخل الصفحة استخدم رابط embed)" className="sm:col-span-2"><input name="map_url" defaultValue={b?.map_url ?? ''} dir="ltr" className="input" /></Field>
      <Field label="الترتيب"><input name="sort_order" type="number" defaultValue={b?.sort_order ?? list.length + 1} className="input" /></Field>
      <div className="flex items-end justify-between">
        <Check name="is_active" label="فعّال" defaultChecked={b ? b.is_active : true} />
        <button className="btn btn-primary">{b ? 'حفظ' : 'إضافة الفرع'}</button>
      </div>
    </form>
  );

  return (
    <>
      <PageHeader title="الفروع وساعات الدوام" />
      <Flash sp={sp} />
      <details className="card mb-4 p-4"><summary className="cursor-pointer font-medium">+ فرع جديد</summary><div className="pt-3">{branchForm()}</div></details>
      <div className="space-y-4">
        {list.map((b) => {
          const bh = ((hours ?? []) as BranchHour[]).filter((h) => h.branch_id === b.id);
          return (
            <section key={b.id} className="card space-y-4 p-4">
              <h2 className="font-bold">{b.name} {!b.is_active && <span className="badge bg-border">متوقف</span>}</h2>
              <details><summary className="cursor-pointer text-sm text-primary">بيانات الفرع</summary><div className="pt-3">{branchForm(b)}</div></details>
              <form action={saveHours} className="space-y-2">
                <input type="hidden" name="branch_id" value={b.id} />
                <p className="label">ساعات الدوام (اترك اليوم فارغاً = مغلق)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {WEEKDAYS.map((d, i) => {
                    const h = bh.find((x) => x.weekday === i);
                    return (
                      <div key={d} className="flex items-center gap-2 text-sm">
                        <span className="w-20">{d}</span>
                        <input type="time" name={`open_${i}`} defaultValue={h ? hhmm(h.opens_at) : ''} className="input !min-h-9" aria-label={`فتح ${d}`} />
                        <span>–</span>
                        <input type="time" name={`close_${i}`} defaultValue={h ? hhmm(h.closes_at) : ''} className="input !min-h-9" aria-label={`إغلاق ${d}`} />
                      </div>
                    );
                  })}
                </div>
                <button className="btn btn-outline btn-sm">حفظ الدوام</button>
              </form>
            </section>
          );
        })}
      </div>

      <section className="card mt-6 space-y-3 p-4">
        <h2 className="font-bold">العطل والإغلاقات</h2>
        <form action={addHoliday} className="flex flex-wrap items-end gap-2">
          <Field label="التاريخ"><input type="date" name="on_date" className="input" required /></Field>
          <Field label="الفرع">
            <select name="branch_id" className="input"><option value="">كل الفروع</option>{list.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </Field>
          <Field label="السبب" className="min-w-40 flex-1"><input name="reason" className="input" /></Field>
          <button className="btn btn-outline">إضافة</button>
        </form>
        <ul className="divide-y divide-border text-sm">
          {(holidays ?? []).map((h: { id: string; on_date: string; branch_id: string | null; reason: string | null }) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <span>{h.on_date} — {list.find((b) => b.id === h.branch_id)?.name ?? 'كل الفروع'} {h.reason && `(${h.reason})`}</span>
              <form action={deleteHoliday}><input type="hidden" name="id" value={h.id} /><button className="btn btn-danger btn-sm">حذف</button></form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
