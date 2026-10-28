import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createPublicClient } from '@/lib/supabase/public';
import { getSettings, getPolicy } from '@/lib/settings';
import { decodeSlug, formatPrice, priceRange, publicUrl, tgLink, waLink } from '@/lib/format';
import { ProductGallery } from '@/components/ProductGallery';
import { VariantPicker } from '@/components/VariantPicker';
import { ViewTracker } from '@/components/ViewTracker';
import { StatusBadge } from '@/components/ui';
import type { Availability, OptionType, OptionValue, Product, Variant } from '@/types';

export const revalidate = 60;

async function load(slugParam: string) {
  const sb = createPublicClient();
  const { data: product } = await sb.from('products').select('*, categories(name, slug)').eq('slug', decodeSlug(slugParam)).maybeSingle();
  return { sb, product: product as (Product & { categories: { name: string; slug: string } | null }) | null };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { sb, product } = await load(slug);
  if (!product) return { title: 'منتج غير موجود' };
  const [{ data: imgs }, { data: vs }] = await Promise.all([
    sb.from('product_images').select('path').eq('product_id', product.id).order('sort_order').limit(1),
    sb.from('product_variants').select('price').eq('product_id', product.id).eq('is_active', true),
  ]);
  const prices = (vs ?? []).map((v: { price: number }) => Number(v.price));
  const priceTxt = prices.length ? priceRange(Math.min(...prices), Math.max(...prices)) : formatPrice(product.base_price);
  const desc = `${priceTxt}${product.description ? ` — ${product.description.slice(0, 120)}` : ''}`;
  const img = publicUrl('product-images', imgs?.[0]?.path);
  // Open Graph: الصورة والاسم والسعر عند المشاركة على فيسبوك وواتساب
  return {
    title: product.name,
    description: desc,
    alternates: { canonical: `/products/${encodeURIComponent(product.slug)}` },
    openGraph: { title: product.name, description: desc, type: 'website', images: img ? [img] : [] },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sb, product } = await load(slug);
  if (!product) notFound();

  const [imgs, variantsRes, stockRes, branchesRes, types, values] = await Promise.all([
    sb.from('product_images').select('path, alt').eq('product_id', product.id).order('sort_order'),
    sb.from('product_variants').select('*, variant_options(value_id)').eq('product_id', product.id).eq('is_active', true).order('sort_order'),
    sb.rpc('get_product_availability', { p_product_id: product.id }),
    sb.from('branches').select('id,name').eq('is_active', true).order('sort_order'),
    sb.from('option_types').select('*').order('sort_order'),
    sb.from('option_values').select('*').order('sort_order'),
  ]);
  const settings = await getSettings();
  const exchange = await getPolicy('exchange');

  const variants = ((variantsRes.data ?? []) as Variant[]).map((v) => ({
    id: v.id, sku: v.sku, price: Number(v.price), compare_at: v.compare_at_price ? Number(v.compare_at_price) : null,
    valueIds: (v.variant_options ?? []).map((o) => o.value_id),
  }));
  const used = new Set(variants.flatMap((v) => v.valueIds));
  const groups = ((types.data ?? []) as OptionType[]).map((t) => ({
    typeId: t.id, typeName: t.name,
    values: ((values.data ?? []) as OptionValue[]).filter((v) => v.type_id === t.id && used.has(v.id))
      .map((v) => ({ id: v.id, label: v.value, swatch: v.swatch })),
  })).filter((g) => g.values.length);
  const stock = (stockRes.data ?? []) as { variant_id: string; branch_id: string; status: Availability }[];
  const branches = (branchesRes.data ?? []) as { id: string; name: string }[];
  const overall: Availability = stock.some((s) => s.status === 'available') ? 'available'
    : stock.some((s) => s.status === 'limited') ? 'limited'
    : stock.some((s) => s.status === 'made_to_order') ? 'made_to_order' : 'out_of_stock';

  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/products/${encodeURIComponent(product.slug)}`;
  const msg = `السلام عليكم، أريد الاستفسار/الطلب عن: ${product.name}\n${url}`;
  const wa = waLink(settings.contact.whatsapp, msg);
  const tg = tgLink(settings.contact.telegram, msg);

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: product.name, description: product.description ?? undefined,
    image: (imgs.data ?? []).map((i: { path: string }) => publicUrl('product-images', i.path)),
    offers: { '@type': 'Offer', priceCurrency: 'ILS', price: variants[0]?.price ?? product.base_price, url },
  };

  return (
    <div className="container-page py-6">
      <ViewTracker productId={product.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="grid gap-6 md:grid-cols-2">
        <ProductGallery name={product.name}
          images={(imgs.data ?? []).map((i: { path: string; alt: string | null }) => ({ src: publicUrl('product-images', i.path)!, alt: i.alt }))} />
        <div className="space-y-4">
          {product.categories && <p className="text-sm text-muted">{product.categories.name}</p>}
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <StatusBadge status={overall} />
          {product.description && <p className="whitespace-pre-line text-sm leading-7 text-muted">{product.description}</p>}

          {variants.length ? (
            <VariantPicker groups={groups} variants={variants} stock={stock} branches={branches} />
          ) : (
            <p className="text-2xl font-bold text-primary"><bdi>{formatPrice(product.base_price)}</bdi></p>
          )}

          <div className="flex flex-wrap gap-2">
            {wa && <a href={wa} target="_blank" rel="noopener" className="btn btn-primary">اطلب عبر واتساب</a>}
            {tg && <a href={tg} target="_blank" rel="noopener" className="btn btn-outline">اطلب عبر تلجرام</a>}
          </div>

          {exchange && (
            <div className="rounded-card border border-accent/50 bg-accent/10 p-3 text-xs leading-6">
              <b>سياسة الاستبدال:</b> {exchange.summary ?? exchange.title}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
