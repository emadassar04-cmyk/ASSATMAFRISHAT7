import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { formatPrice } from '@/lib/format';
import type { Category } from '@/types';
import { Flash, PageHeader, type SP, first } from '../_ui';

export const metadata = { title: 'المنتجات' };

export default async function ProductsAdminPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff('/dashboard/products');
  const q = first(sp.q).slice(0, 80);
  const cat = first(sp.category);
  let query = supabase.from('products').select('id, name, slug, base_price, is_visible, is_featured, categories(name), product_variants(price)')
    .order('created_at', { ascending: false }).limit(200);
  if (q) query = query.ilike('name', `%${q.replace(/[%_]/g, '')}%`);
  if (/^[0-9a-f-]{36}$/i.test(cat)) query = query.eq('category_id', cat);
  const [{ data }, { data: cats }] = await Promise.all([query, supabase.from('categories').select('id,name').order('sort_order')]);
  type Row = { id: string; name: string; base_price: number; is_visible: boolean; is_featured: boolean; categories: { name: string } | null; product_variants: { price: number }[] };

  return (
    <>
      <PageHeader title="المنتجات">
        <Link href="/dashboard/products/new" className="btn btn-primary">+ منتج جديد</Link>
      </PageHeader>
      <Flash sp={sp} />
      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_auto_auto]">
        <input name="q" defaultValue={q} placeholder="بحث بالاسم..." className="input" aria-label="بحث" />
        <select name="category" defaultValue={cat} className="input" aria-label="القسم">
          <option value="">كل الأقسام</option>
          {((cats ?? []) as Pick<Category, 'id' | 'name'>[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn btn-outline">بحث</button>
      </form>
      <div className="card divide-y divide-border">
        {((data ?? []) as unknown as Row[]).map((p) => {
          const prices = p.product_variants.map((v) => Number(v.price));
          return (
            <Link key={p.id} href={`/dashboard/products/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-border/30">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted">{p.categories?.name ?? 'بدون قسم'} · {p.product_variants.length} خيار</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <bdi className="font-bold text-primary">{formatPrice(prices.length ? Math.min(...prices) : p.base_price)}</bdi>
                {p.is_featured && <span className="badge bg-accent/20">مميز</span>}
                {!p.is_visible && <span className="badge bg-border">مخفي</span>}
              </div>
            </Link>
          );
        })}
        {!data?.length && <p className="p-6 text-center text-muted">لا توجد منتجات.</p>}
      </div>
    </>
  );
}
