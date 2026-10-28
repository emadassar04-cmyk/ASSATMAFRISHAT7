import type { Metadata } from 'next';
import { createPublicClient } from '@/lib/supabase/public';
import { EmptyState, Img, ProductCard } from '@/components/ui';
import type { Offer, ProductCardData } from '@/types';

export const metadata: Metadata = { title: 'العروض' };
export const revalidate = 60;

export default async function OffersPage() {
  const sb = createPublicClient();
  const [{ data: offers }, { data: links }, { data: prods }] = await Promise.all([
    sb.from('offers').select('*').order('created_at', { ascending: false }),
    sb.from('offer_products').select('offer_id, product_id'),
    sb.rpc('search_products', { p_limit: 100 }),
  ]);
  const products = (prods ?? []) as ProductCardData[];
  return (
    <div className="container-page space-y-8 py-6">
      <h1 className="text-2xl font-bold">العروض</h1>
      {!offers?.length && <EmptyState>لا توجد عروض حالياً. تابعنا قريباً 🌷</EmptyState>}
      {(offers as Offer[] | null)?.map((o) => {
        const ps = products.filter((p) => (links ?? []).some((l: { offer_id: string; product_id: string }) => l.offer_id === o.id && l.product_id === p.id));
        return (
          <section key={o.id} className="card overflow-hidden">
            <div className="md:flex">
              {o.image_path && <div className="md:w-1/3"><Img bucket="product-images" path={o.image_path} alt={o.title} /></div>}
              <div className="space-y-2 p-4">
                <h2 className="text-lg font-bold">{o.title}</h2>
                {o.discount_value && (
                  <p className="font-bold text-primary">
                    خصم {Number(o.discount_value)}{o.discount_type === 'percent' ? '%' : ' ₪'}
                  </p>
                )}
                {o.description && <p className="text-sm text-muted">{o.description}</p>}
                {o.ends_at && <p className="text-xs text-muted">ينتهي: {new Date(o.ends_at).toLocaleDateString('ar-EG')}</p>}
              </div>
            </div>
            {!!ps.length && <div className="grid grid-cols-2 gap-3 p-4 pt-0 md:grid-cols-4">{ps.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
          </section>
        );
      })}
    </div>
  );
}
