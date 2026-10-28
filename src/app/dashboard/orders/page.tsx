import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { formatPrice } from '@/lib/format';
import { isOrderStatus, ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/orderStatus';
import { Flash, PageHeader, type SP, first } from '../_ui';

export const metadata = { title: 'الطلبات' };

interface Row {
  id: string; order_number: string; status: OrderStatus; fulfillment: 'pickup' | 'delivery'; total: number;
  delivery_fee_pending: boolean; contact_phone: string; created_at: string; branches: { name: string } | null;
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin('/dashboard/orders');
  const status = first(sp.status);
  const q = first(sp.q).replace(/[^A-Za-z0-9-]/g, '').slice(0, 20);
  let query = supabase.from('orders')
    .select('id, order_number, status, fulfillment, total, delivery_fee_pending, contact_phone, created_at, branches(name)')
    .order('created_at', { ascending: false }).limit(100);
  if (isOrderStatus(status)) query = query.eq('status', status);
  if (q) query = query.ilike('order_number', `%${q}%`);
  const [{ data }, { count: newCount }] = await Promise.all([
    query,
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'new'),
  ]);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="الطلبات" />
      <Flash sp={sp} />
      {!!newCount && <p className="mb-3 rounded-card border border-primary/30 bg-primary/10 p-3 text-sm">لديك <bdi className="font-bold">{newCount}</bdi> طلب جديد بانتظار التواصل والاتفاق.</p>}
      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_auto_auto]">
        <input name="q" defaultValue={q} dir="ltr" placeholder="رقم الطلب ORD-1001" className="input" aria-label="رقم الطلب" />
        <select name="status" defaultValue={status} className="input" aria-label="الحالة">
          <option value="">كل الحالات</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn btn-outline">بحث</button>
      </form>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/dashboard/orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:border-primary">
                <span className="min-w-0">
                  <bdi className="font-bold">{o.order_number}</bdi>
                  <span className="text-muted"> · {o.fulfillment === 'delivery' ? 'توصيل' : 'استلام'}{o.branches && ` · ${o.branches.name}`} · <bdi>{o.contact_phone}</bdi></span>
                </span>
                <span className="flex items-center gap-2">
                  <bdi>{formatPrice(o.total)}</bdi>{o.delivery_fee_pending && <span className="badge bg-accent/20 text-fg">رسوم التوصيل بالاتفاق</span>}
                  <span className={`badge ${ORDER_STATUS_CLASS[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="card p-6 text-center text-muted">لا توجد طلبات.</p>}
    </>
  );
}
