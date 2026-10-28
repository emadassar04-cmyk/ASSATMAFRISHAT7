import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPolicy, POLICY_KEYS } from '@/lib/settings';

export const revalidate = 60;

const isKey = (s: string): s is keyof typeof POLICY_KEYS => s in POLICY_KEYS;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = isKey(slug) ? await getPolicy(slug) : null;
  return { title: p?.title ?? 'سياسة' };
}

/** الخصوصية، الشروط، الاستبدال، حذف البيانات (مطلوبة من Meta) — النصوص من الإعدادات */
export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isKey(slug)) notFound();
  const p = await getPolicy(slug);
  if (!p) notFound();
  return (
    <article className="container-page max-w-3xl space-y-4 py-6">
      <h1 className="text-2xl font-bold">{p.title}</h1>
      <div className="whitespace-pre-line leading-8">{p.body}</div>
    </article>
  );
}
