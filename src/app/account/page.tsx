import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatPrice } from '@/lib/format';
import { CUSTOM_STATUS_CLASS, CUSTOM_STATUS_LABEL, type CustomStatus } from '@/lib/customOrder';
import { ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/orderStatus';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'حسابي', robots: { index: false } };

/** لوحة الزبون: بياناتي وطلباتي (المفضلة لاحقاً) */
export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account');
  const { data: profile } = await supabase.from('profiles').select('email, full_name, role').eq('id', user.id).single();
  if (profile?.role === 'admin' || profile?.role === 'moderator') redirect('/dashboard');
  const { data: customs } = await supabase.from('custom_orders').select('id, status, description, quoted_price, created_at').order('created_at', { ascending: false }).limit(20);
  const { data: orders } = await supabase.from('orders').select('id, order_number, status, total, created_at').order('created_at', { ascending: false }).limit(50);
  return (
    <main className="container-page max-w-lg space-y-4 py-10">
      <h1 className="text-xl font-bold">حسابي</h1>
      <div className="card space-y-1 p-5 text-sm">
        <p>البريد: <bdi>{profile?.email}</bdi></p>
        <p>الاسم: {profile?.full_name ?? '—'}</p>
      </div>
      <section className="space-y-2">
        <h2 className="font-bold">طلباتي</h2>
        {orders?.length ? (
          <ul className="space-y-2">
            {(orders as { id: string; order_number: string; status: OrderStatus; total: number; created_at: string }[]).map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="card flex items-center justify-between gap-2 p-3 text-sm hover:border-primary">
                  <span><bdi className="font-bold">{o.order_number}</bdi> <span className="text-muted">· <bdi>{new Date(o.created_at).toLocaleDateString('ar')}</bdi></span></span>
                  <span className="flex items-center gap-2"><bdi>{formatPrice(o.total)}</bdi><span className={`badge ${ORDER_STATUS_CLASS[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="card p-4 text-sm text-muted">لا توجد طلبات بعد. <Link href="/products" className="text-primary underline">تصفّح المنتجات</Link></p>}
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between"><h2 className="font-bold">طلبات التفصيل</h2><Link href="/custom-order" className="text-sm text-primary underline">+ طلب تفصيل جديد</Link></div>
        {customs?.length ? (
          <ul className="space-y-2">
            {(customs as { id: string; status: CustomStatus; description: string; quoted_price: number | null }[]).map((c) => (
              <li key={c.id}>
                <Link href={`/custom-orders/${c.id}`} className="card flex items-center justify-between gap-2 p-3 text-sm hover:border-primary">
                  <span className="min-w-0"><bdi className="font-bold">{c.id.slice(0, 8).toUpperCase()}</bdi> <span className="line-clamp-1 text-muted">{c.description}</span></span>
                  <span className="flex shrink-0 items-center gap-2">{c.quoted_price != null && <bdi>{formatPrice(c.quoted_price)}</bdi>}<span className={`badge ${CUSTOM_STATUS_CLASS[c.status]}`}>{CUSTOM_STATUS_LABEL[c.status]}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="card p-4 text-sm text-muted">لا توجد طلبات تفصيل.</p>}
      </section>
      <form action="/api/auth/logout" method="post"><button className="btn btn-outline">تسجيل الخروج</button></form>
    </main>
  );
}
