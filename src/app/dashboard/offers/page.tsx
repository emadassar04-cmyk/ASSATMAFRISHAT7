import { requireStaff } from '@/lib/auth';
import type { Offer } from '@/types';
import { Check, Field, Flash, PageHeader, type SP } from '../_ui';
import { deleteOffer, saveOffer } from './actions';

export const metadata = { title: 'العروض' };

const local = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

export default async function OffersAdminPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff('/dashboard/offers');
  const [{ data: offers }, { data: products }, { data: links }] = await Promise.all([
    supabase.from('offers').select('*').order('created_at', { ascending: false }),
    supabase.from('products').select('id,name').order('name'),
    supabase.from('offer_products').select('offer_id, product_id'),
  ]);

  const offerForm = (o?: Offer) => {
    const sel = new Set((links ?? []).filter((l: { offer_id: string }) => l.offer_id === o?.id).map((l: { product_id: string }) => l.product_id));
    return (
      <form action={saveOffer} className="grid gap-3 sm:grid-cols-2">
        {o && <input type="hidden" name="id" value={o.id} />}
        <Field label="العنوان"><input name="title" defaultValue={o?.title} className="input" required /></Field>
        <Field label="صورة"><input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="input" /></Field>
        <Field label="الوصف" className="sm:col-span-2"><textarea name="description" rows={2} defaultValue={o?.description ?? ''} className="input" /></Field>
        <Field label="نوع الخصم">
          <select name="discount_type" defaultValue={o?.discount_type ?? ''} className="input">
            <option value="">بدون</option><option value="percent">نسبة %</option><option value="fixed">مبلغ ₪</option>
          </select>
        </Field>
        <Field label="قيمة الخصم"><input name="discount_value" type="number" step="0.01" min="0" defaultValue={o?.discount_value ?? ''} className="input" /></Field>
        <Field label="يبدأ"><input name="starts_at" type="datetime-local" defaultValue={local(o?.starts_at ?? null)} className="input" /></Field>
        <Field label="ينتهي"><input name="ends_at" type="datetime-local" defaultValue={local(o?.ends_at ?? null)} className="input" /></Field>
        <div className="sm:col-span-2">
          <p className="label">المنتجات المشمولة</p>
          <div className="grid max-h-44 gap-1 overflow-y-auto rounded-card border border-border p-2 sm:grid-cols-2">
            {(products ?? []).map((p: { id: string; name: string }) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="product_ids" value={p.id} defaultChecked={sel.has(p.id)} className="size-4 accent-[var(--primary)]" />{p.name}
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between sm:col-span-2">
          <Check name="is_visible" label="ظاهر في الموقع" defaultChecked={o ? o.is_visible : true} />
          <button className="btn btn-primary">{o ? 'حفظ' : 'إضافة العرض'}</button>
        </div>
      </form>
    );
  };

  return (
    <>
      <PageHeader title="العروض" />
      <Flash sp={sp} />
      <details className="card mb-5 p-4" open={!offers?.length}>
        <summary className="cursor-pointer font-medium">+ عرض جديد</summary>
        <div className="pt-3">{offerForm()}</div>
      </details>
      <div className="space-y-3">
        {((offers ?? []) as Offer[]).map((o) => (
          <details key={o.id} className="card p-4">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{o.title}</span>
              {!o.is_visible && <span className="badge bg-border">مخفي</span>}
            </summary>
            <div className="space-y-3 pt-3">
              {offerForm(o)}
              <form action={deleteOffer}><input type="hidden" name="id" value={o.id} /><button className="btn btn-danger btn-sm">حذف العرض</button></form>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
