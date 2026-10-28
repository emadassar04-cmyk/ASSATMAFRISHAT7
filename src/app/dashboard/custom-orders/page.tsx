import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { CUSTOM_STATUS_CLASS, CUSTOM_STATUS_LABEL, isCustomStatus, type CustomStatus } from '@/lib/customOrder';
import { formatPrice } from '@/lib/format';
import { Flash, PageHeader, type SP, first } from '../_ui';

export const metadata = { title: 'طلبات التفصيل' };

interface Row { id: string; status: CustomStatus; description: string; quoted_price: number | null; contact_phone: string | null; created_at: string }

export default async function CustomOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff('/dashboard/custom-orders');
  const status = first(sp.status);
  let query = supabase.from('custom_orders').select('id, status, description, quoted_price, contact_phone, created_at').order('created_at', { ascending: false }).limit(100);
  if (isCustomStatus(status)) query = query.eq('status', status);
  const { data } = await query;
  const rows = (data ?? []) as Row[];
  return (
    <>
      <PageHeader title="طلبات التفصيل" />
      <Flash sp={sp} />
      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_auto]">
        <select name="status" defaultValue={status} className="input" aria-label="الحالة">
          <option value="">كل الحالات</option>
          {Object.entries(CUSTOM_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn btn-outline">تصفية</button>
      </form>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/dashboard/custom-orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:border-primary">
                <span className="min-w-0"><bdi className="font-bold">{o.id.slice(0, 8).toUpperCase()}</bdi> <span className="line-clamp-1 text-muted">{o.description}</span></span>
                <span className="flex items-center gap-2">
                  {o.quoted_price != null && <bdi>{formatPrice(o.quoted_price)}</bdi>}
                  <span className={`badge ${CUSTOM_STATUS_CLASS[o.status]}`}>{CUSTOM_STATUS_LABEL[o.status]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="card p-6 text-center text-muted">لا توجد طلبات تفصيل.</p>}
    </>
  );
}
