import { notFound, redirect } from 'next/navigation';
import { createPublicClient } from '@/lib/supabase/public';
import { decodeSlug } from '@/lib/format';

/** رابط صديق للقسم (slug عربي) يحوّل إلى صفحة المنتجات المفلترة */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await createPublicClient().from('categories').select('id').eq('slug', decodeSlug(slug)).maybeSingle();
  if (!data) notFound();
  redirect(`/products?category=${data.id}`);
}
