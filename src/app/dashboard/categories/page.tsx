import { requireStaff } from '@/lib/auth';
import { publicUrl } from '@/lib/format';
import type { Category } from '@/types';
import { Check, Field, Flash, PageHeader, type SP } from '../_ui';
import { SortableList } from '../SortableList';
import { deleteCategory, reorderCategories, saveCategory, toggleCategory } from './actions';

export const metadata = { title: 'الأقسام' };

function CategoryForm({ cat, all }: { cat?: Category; all: Category[] }) {
  return (
    <form action={saveCategory} className="grid gap-3 sm:grid-cols-2">
      {cat && <input type="hidden" name="id" value={cat.id} />}
      <Field label="الاسم"><input name="name" className="input" defaultValue={cat?.name} required /></Field>
      <Field label="الرابط (slug) — اختياري"><input name="slug" className="input" dir="ltr" defaultValue={cat?.slug} /></Field>
      <Field label="القسم الأب">
        <select name="parent_id" className="input" defaultValue={cat?.parent_id ?? ''}>
          <option value="">— قسم رئيسي —</option>
          {all.filter((c) => c.id !== cat?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="أيقونة (إيموجي)"><input name="icon" className="input" defaultValue={cat?.icon ?? ''} maxLength={4} /></Field>
      <Field label="وصف" className="sm:col-span-2"><input name="description" className="input" defaultValue={cat?.description ?? ''} /></Field>
      <Field label="صورة القسم (JPG/PNG/WebP ≤ 5MB)"><input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="input" /></Field>
      <div className="flex items-end justify-between gap-2">
        <Check name="is_visible" label="ظاهر في الموقع" defaultChecked={cat ? cat.is_visible : true} />
        <button className="btn btn-primary">{cat ? 'حفظ' : 'إضافة'}</button>
      </div>
    </form>
  );
}

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff('/dashboard/categories');
  const { data } = await supabase.from('categories').select('*').order('sort_order');
  const all = (data ?? []) as Category[];

  const level = (parent: string | null) => {
    const kids = all.filter((c) => c.parent_id === parent);
    if (!kids.length) return null;
    return (
      <SortableList onReorder={reorderCategories} items={kids.map((c) => ({
        id: c.id,
        node: (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {c.image_path && <img src={publicUrl('category-images', c.image_path)!} alt="" className="size-10 rounded object-cover" />}
                <span className="font-medium">{c.icon} {c.name}</span>
                {!c.is_visible && <span className="badge bg-border">مخفي</span>}
              </div>
              <div className="flex gap-1">
                <form action={toggleCategory}>
                  <input type="hidden" name="id" value={c.id} /><input type="hidden" name="to" value={c.is_visible ? '0' : '1'} />
                  <button className="btn btn-outline btn-sm">{c.is_visible ? 'إخفاء' : 'إظهار'}</button>
                </form>
                <form action={deleteCategory}><input type="hidden" name="id" value={c.id} /><button className="btn btn-danger btn-sm">حذف</button></form>
              </div>
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-primary">تعديل</summary>
              <div className="pt-3"><CategoryForm cat={c} all={all} /></div>
            </details>
            {level(c.id) && <div className="ms-4 border-s-2 border-border ps-3">{level(c.id)}</div>}
          </div>
        ),
      }))} />
    );
  };

  return (
    <>
      <PageHeader title="الأقسام" />
      <Flash sp={sp} />
      <details className="card mb-5 p-4" open={!all.length}>
        <summary className="cursor-pointer font-medium">+ إضافة قسم</summary>
        <div className="pt-3"><CategoryForm all={all} /></div>
      </details>
      {level(null) ?? <p className="text-muted">لا توجد أقسام بعد.</p>}
    </>
  );
}
