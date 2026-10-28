import { requireStaff } from '@/lib/auth';
import type { OptionType, OptionValue } from '@/types';
import { Field, Flash, PageHeader, type SP } from '../_ui';
import { addOptionType, addOptionValue, deleteOptionType, deleteOptionValue } from './actions';

export const metadata = { title: 'الخصائص' };

export default async function OptionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff('/dashboard/options');
  const [{ data: types }, { data: values }] = await Promise.all([
    supabase.from('option_types').select('*').order('sort_order'),
    supabase.from('option_values').select('*').order('sort_order'),
  ]);
  return (
    <>
      <PageHeader title="الخصائص (ألوان، خامات، مقاسات)" />
      <Flash sp={sp} />
      <form action={addOptionType} className="card mb-5 flex flex-wrap items-end gap-2 p-4">
        <Field label="خاصية جديدة (مثل: اللون)" className="min-w-52 flex-1"><input name="name" className="input" required /></Field>
        <button className="btn btn-primary">إضافة</button>
      </form>
      <div className="space-y-4">
        {((types ?? []) as OptionType[]).map((t) => (
          <section key={t.id} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">{t.name}</h2>
              <form action={deleteOptionType}><input type="hidden" name="id" value={t.id} /><button className="btn btn-danger btn-sm">حذف الخاصية</button></form>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {((values ?? []) as OptionValue[]).filter((v) => v.type_id === t.id).map((v) => (
                <form key={v.id} action={deleteOptionValue} className="badge gap-1.5 border border-border bg-bg py-1">
                  {v.swatch && <span className="size-3 rounded-full border border-border" style={{ background: v.swatch }} />}
                  {v.value}
                  <input type="hidden" name="id" value={v.id} />
                  <button aria-label={`حذف ${v.value}`} className="text-danger">×</button>
                </form>
              ))}
            </div>
            <form action={addOptionValue} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="type_id" value={t.id} />
              <Field label="قيمة جديدة" className="min-w-40 flex-1"><input name="value" className="input" required /></Field>
              <Field label="لون (اختياري)"><input name="swatch" type="text" dir="ltr" placeholder="#d9c7a5" className="input w-32" /></Field>
              <button className="btn btn-outline">إضافة</button>
            </form>
          </section>
        ))}
        {!types?.length && <p className="text-muted">لا توجد خصائص بعد.</p>}
      </div>
    </>
  );
}
