import Link from 'next/link';
import { getSettings } from '@/lib/settings';
import { createPublicClient } from '@/lib/supabase/public';
import { Img, ProductCard } from '@/components/ui';
import { httpUrl, publicUrl, tgLink, waLink, WEEKDAYS, hhmm } from '@/lib/format';
import type { Branch, BranchHour, Category, Offer, ProductCardData } from '@/types';

export const revalidate = 60;

export default async function HomePage() {
  const s = await getSettings();
  const sb = createPublicClient();
  const [cats, offers, popular, featured, branches, hours] = await Promise.all([
    sb.from('categories').select('*').is('parent_id', null).order('sort_order'),
    sb.from('offers').select('*').order('created_at', { ascending: false }).limit(4),
    sb.rpc('search_products', { p_sort: 'popular', p_limit: 8 }),
    sb.rpc('search_products', { p_limit: 100 }),
    sb.from('branches').select('*').eq('is_active', true).order('sort_order'),
    sb.from('branch_hours').select('*').order('weekday'),
  ]);
  const featuredList = ((featured.data ?? []) as ProductCardData[]).filter((p) => p.is_featured).slice(0, 4);
  const heroImg = publicUrl('branding', s.hero.image_path);
  const wa = waLink(s.contact.whatsapp);
  const tg = tgLink(s.contact.telegram);
  const fb = httpUrl(s.contact.facebook);

  return (
    <>
      <section className="relative overflow-hidden bg-primary text-primary-fg">
        {heroImg && <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
        <div className="container-page relative py-14 md:py-20">
          <h1 className="max-w-xl text-3xl font-bold leading-tight md:text-5xl">{s.hero.title ?? s.store.name}</h1>
          {s.hero.subtitle && <p className="mt-3 max-w-xl text-primary-fg/85 md:text-lg">{s.hero.subtitle}</p>}
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/products" className="btn btn-accent">تصفّح المنتجات</Link>
            {wa && <a href={wa} target="_blank" rel="noopener" className="btn btn-outline">واتساب</a>}
            {tg && <a href={tg} target="_blank" rel="noopener" className="btn btn-outline">تلجرام</a>}
            {fb && <a href={fb} target="_blank" rel="noopener" className="btn btn-outline">فيسبوك</a>}
          </div>
        </div>
      </section>

      <div className="container-page space-y-12 pt-10">
        <section>
          <h2 className="h-section">الأقسام</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {(cats.data as Category[] | null)?.map((c) => (
              <Link key={c.id} href={`/products?category=${c.id}`} className="card group overflow-hidden text-center">
                <Img bucket="category-images" path={c.image_path} alt={c.name} />
                <p className="p-3 text-sm font-medium">{c.icon ? `${c.icon} ` : ''}{c.name}</p>
              </Link>
            ))}
          </div>
        </section>

        {!!offers.data?.length && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="h-section mb-0">العروض الحالية</h2>
              <Link href="/offers" className="text-sm text-primary">كل العروض</Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(offers.data as Offer[]).map((o) => (
                <Link key={o.id} href="/offers" className="card flex gap-3 overflow-hidden">
                  <div className="w-28 shrink-0"><Img bucket="product-images" path={o.image_path} alt={o.title} className="h-full !aspect-auto min-h-24" /></div>
                  <div className="space-y-1 p-3">
                    <p className="font-bold">{o.title}</p>
                    {o.description && <p className="line-clamp-2 text-sm text-muted">{o.description}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!!featuredList.length && (
          <section>
            <h2 className="h-section">منتجات مميزة</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{featuredList.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          </section>
        )}

        {!!popular.data?.length && (
          <section>
            <h2 className="h-section">الأكثر مشاهدة</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(popular.data as ProductCardData[]).map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </section>
        )}

        <section>
          <h2 className="h-section">فروعنا</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {(branches.data as Branch[] | null)?.map((b) => {
              const bh = ((hours.data ?? []) as BranchHour[]).filter((h) => h.branch_id === b.id);
              return (
                <div key={b.id} className="card space-y-1 p-4 text-sm">
                  <p className="text-base font-bold">{b.name}</p>
                  {b.address && <p className="text-muted">{b.address}</p>}
                  {bh[0] && <p className="text-muted">الدوام: {hhmm(bh[0].opens_at)} - {hhmm(bh[0].closes_at)} ({bh.map((h) => WEEKDAYS[h.weekday]).join('، ')})</p>}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
