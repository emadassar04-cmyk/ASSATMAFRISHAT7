import Link from 'next/link';
import type { Metadata } from 'next';
import { createPublicClient } from '@/lib/supabase/public';
import { EmptyState, ProductCard } from '@/components/ui';
import { AVAILABILITY_LABEL } from '@/lib/format';
import type { Availability, Branch, Category, ProductCardData } from '@/types';

export const metadata: Metadata = { title: 'المنتجات' };

const PAGE = 24;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const AVAIL = ['available', 'limited', 'out_of_stock', 'made_to_order'] as const;
const UUID = /^[0-9a-f-]{36}$/i;

/** ترتيب الأقسام هرمياً للقائمة المنسدلة */
function flatten(cats: Category[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => {
    cats.filter((c) => c.parent_id === parent).sort((a, b) => a.sort_order - b.sort_order)
      .forEach((c) => { out.push({ id: c.id, label: `${'— '.repeat(depth)}${c.name}` }); walk(c.id, depth + 1); });
  };
  walk(null, 0);
  return out;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 80);
  const category = UUID.test(one(sp.category)) ? one(sp.category) : null;
  const branch = UUID.test(one(sp.branch)) ? one(sp.branch) : null;
  const avail = (AVAIL as readonly string[]).includes(one(sp.availability)) ? (one(sp.availability) as Availability) : null;
  const num = (v: string) => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const min = num(one(sp.min));
  const max = num(one(sp.max));
  const sort = ['new', 'price_asc', 'price_desc', 'popular'].includes(one(sp.sort)) ? one(sp.sort) : 'new';
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const sb = createPublicClient();
  const [res, cats, branches] = await Promise.all([
    sb.rpc('search_products', {
      p_q: q || null, p_category: category, p_branch: branch, p_min: min, p_max: max,
      p_availability: avail, p_sort: sort, p_limit: PAGE + 1, p_offset: (page - 1) * PAGE,
    }),
    sb.from('categories').select('*'),
    sb.from('branches').select('id,name').eq('is_active', true).order('sort_order'),
  ]);
  const rows = (res.data ?? []) as ProductCardData[];
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);

  const href = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) { const x = one(v); if (x && k !== 'page') u.set(k, x); }
    if (p > 1) u.set('page', String(p));
    return `/products?${u}`;
  };

  return (
    <div className="container-page py-6">
      <h1 className="mb-4 text-2xl font-bold">المنتجات</h1>
      <form method="get" className="card mb-6 grid gap-3 p-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="label" htmlFor="q">بحث</label>
          <input id="q" name="q" defaultValue={q} placeholder="ابحث عن منتج..." className="input" />
        </div>
        <div>
          <label className="label" htmlFor="category">القسم</label>
          <select id="category" name="category" defaultValue={category ?? ''} className="input">
            <option value="">كل الأقسام</option>
            {flatten((cats.data ?? []) as Category[]).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="branch">الفرع</label>
          <select id="branch" name="branch" defaultValue={branch ?? ''} className="input">
            <option value="">كل الفروع</option>
            {((branches.data ?? []) as Pick<Branch, 'id' | 'name'>[]).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="min">السعر من (₪)</label>
          <input id="min" name="min" type="number" min="0" inputMode="numeric" defaultValue={min ?? ''} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="max">إلى (₪)</label>
          <input id="max" name="max" type="number" min="0" inputMode="numeric" defaultValue={max ?? ''} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="availability">التوفر</label>
          <select id="availability" name="availability" defaultValue={avail ?? ''} className="input">
            <option value="">الكل</option>
            {AVAIL.map((a) => <option key={a} value={a}>{AVAILABILITY_LABEL[a]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sort">الترتيب</label>
          <select id="sort" name="sort" defaultValue={sort} className="input">
            <option value="new">الأحدث</option>
            <option value="price_asc">الأرخص</option>
            <option value="price_desc">الأغلى</option>
            <option value="popular">الأكثر مشاهدة</option>
          </select>
        </div>
        <div className="flex gap-2 md:col-span-4">
          <button className="btn btn-primary flex-1 md:flex-none">تطبيق</button>
          <Link href="/products" className="btn btn-outline">مسح</Link>
        </div>
      </form>

      {list.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      ) : (
        <EmptyState>لا توجد منتجات مطابقة. جرّب تغيير الفلاتر.</EmptyState>
      )}

      {(page > 1 || hasMore) && (
        <nav className="mt-6 flex justify-center gap-2" aria-label="الصفحات">
          {page > 1 && <Link className="btn btn-outline" href={href(page - 1)}>السابق</Link>}
          {hasMore && <Link className="btn btn-outline" href={href(page + 1)}>التالي</Link>}
        </nav>
      )}
    </div>
  );
}
