import { requireStaff } from '@/lib/auth';
import type { Category } from '@/types';
import { Check, Field, Flash, PageHeader, type SP } from '../../_ui';
import { createProduct } from '../actions';

export const metadata = { title: 'منتج جديد' };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff('/dashboard/products/new');
  const { data: cats } = await supabase.from('categories').select('id,name').order('sort_order');
  return (
    <>
      <PageHeader title="منتج جديد" />
      <Flash sp={sp} />
      <form action={createProduct} className="card grid gap-3 p-4 sm:grid-cols-2">
        <Field label="اسم المنتج"><input name="name" className="input" required /></Field>
        <Field label="القسم">
          <select name="category_id" className="input">
            <option value="">— بدون —</option>
            {((cats ?? []) as Pick<Category, 'id' | 'name'>[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="السعر الأساسي (₪)"><input name="base_price" type="number" step="0.01" min="0" className="input" required /></Field>
        <Field label="الرابط (slug) — اختياري"><input name="slug" className="input" dir="ltr" /></Field>
        <Field label="الوصف" className="sm:col-span-2"><textarea name="description" rows={4} className="input" /></Field>
        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <Check name="is_visible" label="ظاهر في الموقع" defaultChecked />
          <Check name="is_featured" label="منتج مميز" />
          <Check name="is_custom_orderable" label="يقبل التفصيل" />
        </div>
        <button className="btn btn-primary sm:col-span-2">إنشاء ومتابعة</button>
      </form>
    </>
  );
}
