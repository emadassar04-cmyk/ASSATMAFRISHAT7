import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { publicUrl } from '@/lib/format';
import type { Branch, Category, OptionType, OptionValue, Product } from '@/types';
import { Check, Field, Flash, PageHeader, type SP } from '../../_ui';
import { addImages, deleteImage, deleteProduct, deleteVariant, makePrimaryImage, saveVariant, updateProduct } from '../actions';

export const metadata = { title: 'تعديل منتج' };

interface VariantRow {
  id: string; sku: string | null; price: number; compare_at_price: number | null; is_active: boolean;
  variant_options: { value_id: string }[]; branch_stock: { branch_id: string; quantity: number; status: string }[];
}

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireStaff(`/dashboard/products/${id}`);

  const [prod, cats, imgs, variants, types, values, branches] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).maybeSingle(),
    supabase.from('categories').select('id,name').order('sort_order'),
    supabase.from('product_images').select('*').eq('product_id', id).order('sort_order'),
    supabase.from('product_variants').select('*, variant_options(value_id), branch_stock(branch_id, quantity, status)').eq('product_id', id).order('sort_order').order('id'),
    supabase.from('option_types').select('*').order('sort_order'),
    supabase.from('option_values').select('*').order('sort_order'),
    supabase.from('branches').select('id,name').order('sort_order'),
  ]);
  const p = prod.data as Product | null;
  if (!p) notFound();
  const typeList = (types.data ?? []) as OptionType[];
  const valueList = (values.data ?? []) as OptionValue[];
  const branchList = (branches.data ?? []) as Pick<Branch, 'id' | 'name'>[];

  const variantForm = (v?: VariantRow) => (
    <form action={saveVariant} className="grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="product_id" value={p.id} />
      {v && <input type="hidden" name="id" value={v.id} />}
      <Field label="السعر (₪)"><input name="price" type="number" step="0.01" min="0" defaultValue={v?.price} className="input" required /></Field>
      <Field label="السعر قبل الخصم"><input name="compare_at_price" type="number" step="0.01" min="0" defaultValue={v?.compare_at_price ?? ''} className="input" /></Field>
      <Field label="SKU"><input name="sku" dir="ltr" defaultValue={v?.sku ?? ''} className="input" /></Field>
      <div className="flex items-end"><Check name="is_active" label="فعّال" defaultChecked={v ? v.is_active : true} /></div>
      {typeList.map((t) => (
        <Field key={t.id} label={t.name}>
          <select name={`option_${t.id}`} className="input" defaultValue={valueList.find((o) => o.type_id === t.id && v?.variant_options.some((x) => x.value_id === o.id))?.id ?? ''}>
            <option value="">—</option>
            {valueList.filter((o) => o.type_id === t.id).map((o) => <option key={o.id} value={o.id}>{o.value}</option>)}
          </select>
        </Field>
      ))}
      <div className="sm:col-span-4">
        <p className="label">المخزون في كل فرع</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {branchList.map((b) => {
            const s = v?.branch_stock.find((x) => x.branch_id === b.id);
            return (
              <div key={b.id} className="flex items-center gap-2 rounded-card border border-border p-2">
                <span className="w-28 shrink-0 text-sm">{b.name}</span>
                <input name={`stock_${b.id}`} type="number" min="0" defaultValue={s?.quantity ?? 0} className="input !min-h-9 w-24" aria-label={`كمية ${b.name}`} />
                <Check name={`mto_${b.id}`} label="حسب الطلب" defaultChecked={s?.status === 'made_to_order'} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2 sm:col-span-4">
        <button className="btn btn-primary">{v ? 'حفظ الخيار' : 'إضافة خيار'}</button>
      </div>
    </form>
  );

  return (
    <>
      <PageHeader title={p.name}>
        <a href={`/products/${encodeURIComponent(p.slug)}`} target="_blank" className="btn btn-outline btn-sm">عرض في الموقع</a>
      </PageHeader>
      <Flash sp={sp} />

      <section className="card mb-6 p-4">
        <h2 className="mb-3 font-bold">بيانات المنتج</h2>
        <form action={updateProduct} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={p.id} />
          <Field label="الاسم"><input name="name" defaultValue={p.name} className="input" required /></Field>
          <Field label="القسم">
            <select name="category_id" defaultValue={p.category_id ?? ''} className="input">
              <option value="">— بدون —</option>
              {((cats.data ?? []) as Pick<Category, 'id' | 'name'>[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="السعر الأساسي (₪)"><input name="base_price" type="number" step="0.01" min="0" defaultValue={p.base_price} className="input" required /></Field>
          <Field label="الرابط (slug)"><input name="slug" dir="ltr" defaultValue={p.slug} className="input" /></Field>
          <Field label="الوصف" className="sm:col-span-2"><textarea name="description" rows={4} defaultValue={p.description ?? ''} className="input" /></Field>
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            <Check name="is_visible" label="ظاهر" defaultChecked={p.is_visible} />
            <Check name="is_featured" label="مميز" defaultChecked={p.is_featured} />
            <Check name="is_custom_orderable" label="يقبل التفصيل" defaultChecked={p.is_custom_orderable} />
          </div>
          <button className="btn btn-primary sm:col-span-2">حفظ</button>
        </form>
      </section>

      <section className="card mb-6 p-4">
        <h2 className="mb-3 font-bold">الصور</h2>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(imgs.data ?? []).map((im: { id: string; path: string }, i: number) => (
            <div key={im.id} className="space-y-1">
              <img src={publicUrl('product-images', im.path)!} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-card object-cover" />
              <div className="flex gap-1">
                {i > 0 && <form action={makePrimaryImage}><input type="hidden" name="id" value={im.id} /><input type="hidden" name="product_id" value={p.id} /><button className="btn btn-outline btn-sm">رئيسية</button></form>}
                <form action={deleteImage}><input type="hidden" name="id" value={im.id} /><input type="hidden" name="product_id" value={p.id} /><button className="btn btn-danger btn-sm">حذف</button></form>
              </div>
            </div>
          ))}
        </div>
        <form action={addImages} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="product_id" value={p.id} />
          <Field label="إضافة صور (حتى 10، كل صورة ≤ 5MB)" className="min-w-60 flex-1">
            <input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" className="input" required />
          </Field>
          <button className="btn btn-primary">رفع</button>
        </form>
      </section>

      <section className="card mb-6 p-4">
        <h2 className="mb-1 font-bold">الخيارات والأسعار والمخزون</h2>
        <p className="mb-4 text-xs text-muted">كل خيار (Variant) له سعر وتوفر خاص. الحالة تُحسب تلقائياً من الكمية، أو اختر «حسب الطلب».</p>
        <div className="space-y-4">
          {((variants.data ?? []) as unknown as VariantRow[]).map((v) => (
            <details key={v.id} className="rounded-card border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {v.sku ?? 'خيار'} — {Number(v.price)} ₪ {!v.is_active && '(غير فعّال)'}
                <span className="text-muted"> · {valueList.filter((o) => v.variant_options.some((x) => x.value_id === o.id)).map((o) => o.value).join(' / ')}</span>
              </summary>
              <div className="space-y-3 pt-3">
                {variantForm(v)}
                <form action={deleteVariant}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="product_id" value={p.id} /><button className="btn btn-danger btn-sm">حذف الخيار</button></form>
              </div>
            </details>
          ))}
          <details className="rounded-card border border-dashed border-primary/50 p-3" open={!variants.data?.length}>
            <summary className="cursor-pointer text-sm font-medium text-primary">+ إضافة خيار جديد</summary>
            <div className="pt-3">{variantForm()}</div>
          </details>
        </div>
      </section>

      <section className="card border-danger/40 p-4">
        <h2 className="mb-2 font-bold text-danger">حذف المنتج</h2>
        <form action={deleteProduct}><input type="hidden" name="id" value={p.id} /><button className="btn btn-danger">حذف المنتج نهائياً</button></form>
      </section>
    </>
  );
}
