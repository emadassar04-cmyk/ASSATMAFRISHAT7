import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice, messengerLink, waLink } from '@/lib/format';
import { customerCanCancel, ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/orderStatus';
import { getSettings } from '@/lib/settings';
import { createClient } from '@/lib/supabase/server';
import { cancelOrder } from './actions';
import { ClearCart } from './ClearCart';

export const metadata: Metadata = { title: 'طلبي', robots: { index: false } };
export const dynamic = 'force-dynamic';

interface Order {
  id: string; order_number: string; status: OrderStatus; fulfillment: 'pickup' | 'delivery'; subtotal: number; delivery_fee: number;
  delivery_fee_pending: boolean; total: number; delivery_address: string | null; contact_phone: string; contact_preference: string | null;
  customer_note: string | null; cancelled_reason: string | null; created_at: string;
  branches: { name: string } | null;
  order_items: { id: string; product_name: string; options_text: string | null; unit_price: number; quantity: number; line_total: number }[];
}

export default async function OrderPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from('orders')
    .select('id, order_number, status, fulfillment, subtotal, delivery_fee, delivery_fee_pending, total, delivery_address, contact_phone, contact_preference, customer_note, cancelled_reason, created_at, branches(name), order_items(id, product_name, options_text, unit_price, quantity, line_total)')
    .eq('id', id).maybeSingle();
  if (!data) notFound();
  const o = data as unknown as Order;
  const s = await getSettings();

  const topic = o.fulfillment === 'delivery' ? 'الدفع والتوصيل' : 'الدفع';
  const msg = `السلام عليكم، طلبي رقم ${o.order_number}. أودّ الاتفاق على ${topic}.`;
  const wa = waLink(s.contact.whatsapp, msg);
  const fb = messengerLink(s.contact.facebook);
  const active = o.status !== 'cancelled';

  return (
    <main className="container-page max-w-3xl space-y-4 py-8">
      {sp.placed === '1' && <ClearCart />}
      {sp.ok && <p role="status" className="rounded-card border border-ok/40 bg-ok/10 p-3 text-sm text-ok">{sp.ok}</p>}
      {sp.error && <p role="alert" className="rounded-card border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{sp.error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">طلب <bdi>{o.order_number}</bdi></h1>
        <span className={`badge ${ORDER_STATUS_CLASS[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
      </div>

      {sp.placed === '1' && (
        <div className="card space-y-1 border-ok/40 bg-ok/10 p-4 text-sm">
          <p className="font-bold text-ok">تم استلام طلبك ✓</p>
          <p>رقم طلبك <bdi className="font-bold">{o.order_number}</bdi>. تواصل معنا الآن للاتفاق على {topic}.</p>
        </div>
      )}

      {active && (wa || fb) && (
        <section className="card space-y-3 p-4">
          <h2 className="font-bold">الاتفاق على {topic}</h2>
          <p className="text-sm text-muted">اضغط وسيلة التواصل التي تفضّلها. اذكر رقم الطلب <bdi className="font-bold text-fg">{o.order_number}</bdi>.</p>
          <div className="flex flex-wrap gap-2">
            {wa && <a href={wa} target="_blank" rel="noopener" className={`btn ${o.contact_preference !== 'facebook' ? 'btn-primary' : 'btn-outline'}`}>تواصل عبر واتساب</a>}
            {fb && <a href={fb} target="_blank" rel="noopener" className={`btn ${o.contact_preference === 'facebook' ? 'btn-primary' : 'btn-outline'}`}>تواصل عبر ماسنجر</a>}
          </div>
        </section>
      )}

      <section className="card space-y-2 p-4">
        <h2 className="font-bold">المنتجات</h2>
        <ul className="divide-y divide-border text-sm">
          {o.order_items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">{i.product_name}{i.options_text && <span className="text-muted"> — {i.options_text}</span>} × <bdi>{i.quantity}</bdi></span>
              <bdi className="shrink-0">{formatPrice(i.line_total)}</bdi>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-border pt-2 text-sm">
          <div className="flex justify-between"><dt>المجموع</dt><dd><bdi>{formatPrice(o.subtotal)}</bdi></dd></div>
          {o.fulfillment === 'delivery' && (
            <div className="flex justify-between"><dt>التوصيل</dt><dd>{o.delivery_fee_pending ? 'بالاتفاق' : <bdi>{formatPrice(o.delivery_fee)}</bdi>}</dd></div>
          )}
          <div className="flex justify-between text-base font-bold"><dt>الإجمالي</dt>
            <dd className="text-primary"><bdi>{formatPrice(o.total)}</bdi>{o.delivery_fee_pending && <span className="ms-1 text-xs font-normal text-muted">+ رسوم التوصيل</span>}</dd></div>
        </dl>
      </section>

      <section className="card space-y-1 p-4 text-sm">
        <p><b>الاستلام:</b> {o.fulfillment === 'delivery' ? 'توصيل' : 'من الفرع'}{o.branches && ` — ${o.branches.name}`}</p>
        {o.delivery_address && <p><b>العنوان:</b> {o.delivery_address}</p>}
        <p><b>الجوال:</b> <bdi>{o.contact_phone}</bdi></p>
        {o.customer_note && <p><b>ملاحظتك:</b> {o.customer_note}</p>}
        {o.cancelled_reason && <p className="text-danger"><b>سبب الإلغاء:</b> {o.cancelled_reason}</p>}
      </section>

      {customerCanCancel(o.status) && (
        <form action={cancelOrder} className="card flex flex-wrap items-end gap-2 p-4">
          <input type="hidden" name="id" value={o.id} />
          <label className="min-w-0 flex-1"><span className="label">إلغاء الطلب (اختياري: السبب)</span><input name="reason" className="input" maxLength={300} /></label>
          <button className="btn btn-outline text-danger">إلغاء الطلب</button>
        </form>
      )}
      <Link href="/account" className="text-sm text-primary underline">كل طلباتي</Link>
    </main>
  );
}
