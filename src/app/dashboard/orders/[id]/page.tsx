import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { formatPrice, intlDigits, waLink } from '@/lib/format';
import { isClosed, nextStatuses, ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, type Fulfillment, type OrderStatus } from '@/lib/orderStatus';
import { createAdminClient } from '@/lib/supabase/admin';
import { Field, Flash, PageHeader, type SP } from '../../_ui';
import { changeStatus, reviewPayment, setFee } from '../actions';

export const metadata = { title: 'تفاصيل الطلب' };

interface Order {
  id: string; order_number: string; status: OrderStatus; fulfillment: Fulfillment; subtotal: number; delivery_fee: number;
  delivery_fee_pending: boolean; total: number; delivery_address: string | null; contact_phone: string; contact_preference: string | null;
  customer_note: string | null; cancelled_reason: string | null; created_at: string; source_channel: string;
  branches: { name: string } | null; customers: { full_name: string | null } | null;
  order_items: { id: string; product_name: string; options_text: string | null; unit_price: number; quantity: number; line_total: number }[];
  order_status_history: { id: number; from_status: OrderStatus | null; to_status: OrderStatus; note: string | null; created_at: string }[];
  payments: { id: string; amount: number; status: 'pending' | 'confirmed' | 'rejected'; receipt_path: string | null; reject_reason: string | null; created_at: string }[];
}
const PAY_LABEL = { pending: 'بانتظار المراجعة', confirmed: 'مؤكَّدة', rejected: 'مرفوضة' } as const;

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin(`/dashboard/orders/${id}`);
  const { data } = await supabase.from('orders')
    .select('id, order_number, status, fulfillment, subtotal, delivery_fee, delivery_fee_pending, total, delivery_address, contact_phone, contact_preference, customer_note, cancelled_reason, created_at, source_channel, branches(name), customers(full_name), order_items(id, product_name, options_text, unit_price, quantity, line_total), order_status_history(id, from_status, to_status, note, created_at), payments(id, amount, status, receipt_path, reject_reason, created_at)')
    .eq('id', id).maybeSingle();
  if (!data) notFound();
  const o = data as unknown as Order;

  // روابط مؤقتة (دقيقتان) لعرض الإيصالات من المخزن الخاص
  const receipts = new Map<string, string>();
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    for (const p of o.payments) {
      if (!p.receipt_path) continue;
      const { data: u } = await admin.storage.from('receipts').createSignedUrl(p.receipt_path, 120);
      if (u?.signedUrl) receipts.set(p.id, u.signedUrl);
    }
  }
  const digits = intlDigits(o.contact_phone);
  const wa = digits ? waLink(digits, `السلام عليكم، بخصوص طلبك رقم ${o.order_number}`) : null;
  const next = nextStatuses(o.status, o.fulfillment);
  const history = [...o.order_status_history].sort((a, b) => a.id - b.id);

  return (
    <>
      <PageHeader title={`طلب ${o.order_number}`}>
        <Link href="/dashboard/orders" className="btn btn-outline btn-sm">← الطلبات</Link>
      </PageHeader>
      <Flash sp={sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <section className="card space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">المنتجات</h2>
              <span className={`badge ${ORDER_STATUS_CLASS[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
            </div>
            <ul className="divide-y divide-border text-sm">
              {o.order_items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">{i.product_name}{i.options_text && <span className="text-muted"> — {i.options_text}</span>} × <bdi>{i.quantity}</bdi> <span className="text-muted">(<bdi>{formatPrice(i.unit_price)}</bdi>)</span></span>
                  <bdi className="shrink-0">{formatPrice(i.line_total)}</bdi>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-border pt-2 text-sm">
              <div className="flex justify-between"><dt>المجموع</dt><dd><bdi>{formatPrice(o.subtotal)}</bdi></dd></div>
              {o.fulfillment === 'delivery' && <div className="flex justify-between"><dt>التوصيل</dt><dd>{o.delivery_fee_pending ? <span className="badge bg-accent/20 text-fg">بالاتفاق (لم تُحدَّد)</span> : <bdi>{formatPrice(o.delivery_fee)}</bdi>}</dd></div>}
              <div className="flex justify-between text-base font-bold"><dt>الإجمالي</dt><dd className="text-primary"><bdi>{formatPrice(o.total)}</bdi></dd></div>
            </dl>
          </section>

          <section className="card space-y-1 p-4 text-sm">
            <h2 className="mb-1 font-bold">الزبون والاستلام</h2>
            <p><b>الاسم:</b> {o.customers?.full_name ?? '—'}</p>
            <p><b>الجوال:</b> <bdi>{o.contact_phone}</bdi> · يفضّل: {o.contact_preference === 'facebook' ? 'فيسبوك' : o.contact_preference === 'whatsapp' ? 'واتساب' : '—'}</p>
            <p><b>الاستلام:</b> {o.fulfillment === 'delivery' ? 'توصيل' : 'من الفرع'}{o.branches && ` — ${o.branches.name}`}</p>
            {o.delivery_address && <p><b>العنوان:</b> {o.delivery_address}</p>}
            {o.customer_note && <p><b>ملاحظة الزبون:</b> {o.customer_note}</p>}
            {o.cancelled_reason && <p className="text-danger"><b>سبب الإلغاء:</b> {o.cancelled_reason}</p>}
            <p className="text-muted">المصدر: {o.source_channel} · <bdi>{new Date(o.created_at).toLocaleString('ar')}</bdi></p>
            {wa && <a href={wa} target="_blank" rel="noopener" className="btn btn-primary btn-sm mt-2">تواصل مع الزبون عبر واتساب</a>}
          </section>

          {o.payments.length > 0 && (
            <section className="card space-y-3 p-4">
              <h2 className="font-bold">الدفعات</h2>
              {o.payments.map((p) => (
                <div key={p.id} className="space-y-2 rounded-card border border-border p-3 text-sm">
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span><bdi>{formatPrice(p.amount)}</bdi> · {PAY_LABEL[p.status]}</span>
                    {receipts.get(p.id) && <a href={receipts.get(p.id)} target="_blank" rel="noopener noreferrer" className="text-primary underline">عرض الإيصال</a>}
                  </p>
                  {p.reject_reason && <p className="text-danger">سبب الرفض: {p.reject_reason}</p>}
                  {p.status === 'pending' && (
                    <form action={reviewPayment} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="order_id" value={o.id} /><input type="hidden" name="payment_id" value={p.id} />
                      <label className="min-w-0 flex-1"><span className="label">سبب الرفض (إن رُفضت)</span><input name="reason" className="input" /></label>
                      <button name="decision" value="confirmed" className="btn btn-primary btn-sm">تأكيد</button>
                      <button name="decision" value="rejected" className="btn btn-outline btn-sm text-danger">رفض</button>
                    </form>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>

        <aside className="space-y-4">
          {!isClosed(o.status) && next.length > 0 && (
            <form action={changeStatus} className="card space-y-3 p-4">
              <h2 className="font-bold">تغيير الحالة</h2>
              <input type="hidden" name="id" value={o.id} />
              <Field label="الحالة الجديدة">
                <select name="to" className="input" required>
                  {next.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
                </select>
              </Field>
              <Field label="ملاحظة (إلزامية عند الإلغاء)"><input name="note" className="input" maxLength={300} /></Field>
              <button className="btn btn-primary w-full">حفظ</button>
            </form>
          )}
          {o.fulfillment === 'delivery' && !isClosed(o.status) && (
            <form action={setFee} className="card space-y-3 p-4">
              <h2 className="font-bold">رسوم التوصيل بعد الاتفاق</h2>
              <input type="hidden" name="id" value={o.id} />
              <Field label="الرسوم (₪)"><input name="fee" type="number" min="0" max="10000" step="0.5" className="input" dir="ltr" required defaultValue={o.delivery_fee_pending ? '' : o.delivery_fee} /></Field>
              <Field label="ملاحظة (اختياري)"><input name="note" className="input" maxLength={200} /></Field>
              <button className="btn btn-primary w-full">تحديد الرسوم</button>
            </form>
          )}
          <section className="card space-y-2 p-4 text-sm">
            <h2 className="font-bold">سجل الحالات</h2>
            <ol className="space-y-1.5">
              {history.map((h) => (
                <li key={h.id}>
                  <span className={`badge ${ORDER_STATUS_CLASS[h.to_status]}`}>{ORDER_STATUS_LABEL[h.to_status]}</span>
                  <span className="ms-1 text-xs text-muted"><bdi>{new Date(h.created_at).toLocaleString('ar')}</bdi></span>
                  {h.note && <p className="text-xs text-muted">{h.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
