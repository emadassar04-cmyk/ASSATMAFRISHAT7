import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { canRequote, CUSTOM_STATUS_CLASS, CUSTOM_STATUS_LABEL, nextCustomStatuses, type CustomStatus } from '@/lib/customOrder';
import { formatPrice, intlDigits, waLink } from '@/lib/format';
import { createAdminClient } from '@/lib/supabase/admin';
import { Field, Flash, PageHeader, type SP } from '../../_ui';
import { changeCustomStatus, quoteOrder } from '../actions';

export const metadata = { title: 'تفاصيل طلب التفصيل' };

interface Row {
  id: string; status: CustomStatus; description: string; dimensions: string | null; material: string | null; color: string | null;
  reference_image_paths: string[]; quoted_price: number | null; deposit_percent: number | null; deposit_amount: number | null;
  quote_note: string | null; contact_phone: string | null; contact_preference: string | null; cancelled_reason: string | null;
  created_at: string; branches: { name: string } | null; customers: { full_name: string | null } | null;
}

export default async function CustomOrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireStaff(`/dashboard/custom-orders/${id}`);
  const { data } = await supabase.from('custom_orders')
    .select('id, status, description, dimensions, material, color, reference_image_paths, quoted_price, deposit_percent, deposit_amount, quote_note, contact_phone, contact_preference, cancelled_reason, created_at, branches(name), customers(full_name)')
    .eq('id', id).maybeSingle();
  if (!data) notFound();
  const o = data as unknown as Row;

  // روابط مؤقتة (دقيقتان) للصور المرجعية من المخزن الخاص
  const images: string[] = [];
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && o.reference_image_paths.length) {
    const { data: urls } = await createAdminClient().storage.from('custom-refs').createSignedUrls(o.reference_image_paths, 120);
    for (const u of urls ?? []) if (u.signedUrl) images.push(u.signedUrl);
  }
  const digits = intlDigits(o.contact_phone);
  const wa = digits ? waLink(digits, `السلام عليكم، بخصوص طلب التفصيل ${o.id.slice(0, 8).toUpperCase()}`) : null;
  const next = nextCustomStatuses(o.status);

  return (
    <>
      <PageHeader title={`طلب تفصيل ${o.id.slice(0, 8).toUpperCase()}`}>
        <Link href="/dashboard/custom-orders" className="btn btn-outline btn-sm">← الطلبات</Link>
      </PageHeader>
      <Flash sp={sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <section className="card space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">التفاصيل</h2><span className={`badge ${CUSTOM_STATUS_CLASS[o.status]}`}>{CUSTOM_STATUS_LABEL[o.status]}</span>
            </div>
            <p className="whitespace-pre-line">{o.description}</p>
            {o.dimensions && <p><b>المقاس:</b> {o.dimensions}</p>}
            {o.material && <p><b>الخامة:</b> {o.material}</p>}
            {o.color && <p><b>اللون:</b> {o.color}</p>}
            {o.branches && <p><b>الفرع المفضّل:</b> {o.branches.name}</p>}
            {o.cancelled_reason && <p className="text-danger"><b>سبب الإلغاء:</b> {o.cancelled_reason}</p>}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {images.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="صورة مرجعية" loading="lazy" className="size-24 rounded object-cover" /></a>)}
              </div>
            )}
          </section>
          <section className="card space-y-1 p-4 text-sm">
            <h2 className="mb-1 font-bold">الزبون</h2>
            <p><b>الاسم:</b> {o.customers?.full_name ?? '—'}</p>
            <p><b>الجوال:</b> <bdi>{o.contact_phone ?? '—'}</bdi> · يفضّل: {o.contact_preference === 'facebook' ? 'فيسبوك' : o.contact_preference === 'whatsapp' ? 'واتساب' : '—'}</p>
            <p className="text-muted"><bdi>{new Date(o.created_at).toLocaleString('ar')}</bdi></p>
            {wa && <a href={wa} target="_blank" rel="noopener" className="btn btn-primary btn-sm mt-2">تواصل مع الزبون عبر واتساب</a>}
          </section>
        </div>
        <aside className="space-y-4">
          {o.quoted_price != null && (
            <section className="card space-y-1 p-4 text-sm">
              <p>السعر: <bdi className="font-bold text-primary">{formatPrice(o.quoted_price)}</bdi></p>
              {o.deposit_amount != null ? <p>العربون ({o.deposit_percent}%): <bdi className="font-bold">{formatPrice(o.deposit_amount)}</bdi></p> : <p className="text-muted">بلا عربون</p>}
              {o.quote_note && <p className="text-muted">{o.quote_note}</p>}
            </section>
          )}
          {canRequote(o.status) && (
            <form action={quoteOrder} className="card space-y-3 p-4">
              <h2 className="font-bold">{o.quoted_price == null ? 'تسعير الطلب' : 'تعديل السعر'}</h2>
              <input type="hidden" name="id" value={o.id} />
              <Field label="السعر (₪)"><input name="price" type="number" min="1" max="1000000" step="0.5" dir="ltr" className="input" required defaultValue={o.quoted_price ?? ''} /></Field>
              <Field label="ملاحظة للزبون (اختياري)"><input name="note" className="input" maxLength={300} /></Field>
              <button className="btn btn-primary w-full">حفظ السعر</button>
              <p className="text-xs text-muted">العربون يُحسب تلقائياً من نسبة العربون في الإعدادات.</p>
            </form>
          )}
          {next.length > 0 && (
            <form action={changeCustomStatus} className="card space-y-3 p-4">
              <h2 className="font-bold">تغيير الحالة</h2>
              <input type="hidden" name="id" value={o.id} />
              <Field label="الحالة الجديدة"><select name="to" className="input" required>{next.map((s) => <option key={s} value={s}>{CUSTOM_STATUS_LABEL[s]}</option>)}</select></Field>
              <Field label="ملاحظة (إلزامية عند الإلغاء)"><input name="note" className="input" maxLength={300} /></Field>
              <button className="btn btn-primary w-full">حفظ</button>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
