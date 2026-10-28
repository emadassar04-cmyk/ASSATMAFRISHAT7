import type { MetadataRoute } from 'next';
import { createPublicClient } from '@/lib/supabase/public';
import { POLICY_KEYS } from '@/lib/settings';

export const revalidate = 3600;
const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sb = createPublicClient();
  const [{ data: products }, { data: cats }] = await Promise.all([
    sb.from('products').select('slug, updated_at').eq('is_visible', true),
    sb.from('categories').select('slug').eq('is_visible', true),
  ]);
  const fixed = ['', '/products', '/offers', '/branches', '/about', ...Object.keys(POLICY_KEYS).map((k) => `/policies/${k}`)];
  return [
    ...fixed.map((p) => ({ url: `${base}${p}`, changeFrequency: 'weekly' as const })),
    ...(cats ?? []).map((c: { slug: string }) => ({ url: `${base}/categories/${encodeURIComponent(c.slug)}` })),
    ...(products ?? []).map((p: { slug: string; updated_at: string }) => ({
      url: `${base}/products/${encodeURIComponent(p.slug)}`, lastModified: p.updated_at,
    })),
  ];
}
