import type { Metadata } from 'next';
import { getSettings } from '@/lib/settings';
import { httpUrl, tgLink, waLink } from '@/lib/format';

export const metadata: Metadata = { title: 'من نحن' };
export const revalidate = 60;

export default async function AboutPage() {
  const s = await getSettings();
  const wa = waLink(s.contact.whatsapp);
  const tg = tgLink(s.contact.telegram);
  const fb = httpUrl(s.contact.facebook);
  return (
    <div className="container-page max-w-3xl space-y-6 py-6">
      <h1 className="text-2xl font-bold">من نحن</h1>
      <p className="whitespace-pre-line leading-8">{s.store.about ?? s.store.name}</p>
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">تواصل معنا</h2>
        {s.contact.phone && <p className="text-sm">☎ <bdi>{s.contact.phone}</bdi></p>}
        {s.contact.email && <p className="text-sm">✉ <bdi>{s.contact.email}</bdi></p>}
        <div className="flex flex-wrap gap-2">
          {wa && <a className="btn btn-primary btn-sm" href={wa} target="_blank" rel="noopener">واتساب</a>}
          {tg && <a className="btn btn-outline btn-sm" href={tg} target="_blank" rel="noopener">تلجرام</a>}
          {fb && <a className="btn btn-outline btn-sm" href={fb} target="_blank" rel="noopener">فيسبوك</a>}
        </div>
      </section>
    </div>
  );
}
