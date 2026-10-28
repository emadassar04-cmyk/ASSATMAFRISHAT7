import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { PageHeader } from './_ui';

export default async function DashboardHome() {
  const { supabase, profile } = await requireRole(['moderator', 'admin', 'auditor']);
  if (profile.role === 'auditor') redirect('/dashboard/audit');
  const count = async (t: string) => (await supabase.from(t).select('*', { count: 'exact', head: true })).count ?? 0;
  const [products, categories, offers, lowStock] = await Promise.all([
    count('products'), count('categories'), count('offers'),
    supabase.from('branch_stock')
      .select('quantity, status, branches(name), product_variants(sku, products(name))')
      .in('status', ['out_of_stock', 'limited']).order('quantity').limit(15),
  ]);
  type Low = { quantity: number; status: string; branches: { name: string } | null; product_variants: { sku: string | null; products: { name: string } | null } | null };
  return (
    <>
      <PageHeader title={`أهلاً ${profile.full_name ?? ''}`.trim()} />
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ n: products, l: 'منتج', h: '/dashboard/products' }, { n: categories, l: 'قسم', h: '/dashboard/categories' }, { n: offers, l: 'عرض', h: '/dashboard/offers' }].map((c) => (
          <Link key={c.l} href={c.h} className="card p-5 hover:border-primary">
            <p className="text-3xl font-bold text-primary">{c.n}</p><p className="text-sm text-muted">{c.l}</p>
          </Link>
        ))}
      </div>
      <section className="mt-8">
        <h2 className="h-section">منتجات نفدت أو قاربت على النفاد</h2>
        <div className="card divide-y divide-border">
          {((lowStock.data ?? []) as unknown as Low[]).map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span>{r.product_variants?.products?.name} <span className="text-muted">({r.product_variants?.sku ?? '—'})</span></span>
              <span className="text-muted">{r.branches?.name}</span>
              <span className={`badge ${r.status === 'out_of_stock' ? 'bg-danger/10 text-danger' : 'bg-accent/20'}`}>
                {r.status === 'out_of_stock' ? 'نفذ' : `متبقي ${r.quantity}`}
              </span>
            </div>
          ))}
          {!lowStock.data?.length && <p className="p-4 text-sm text-muted">لا توجد تنبيهات.</p>}
        </div>
      </section>
    </>
  );
}
