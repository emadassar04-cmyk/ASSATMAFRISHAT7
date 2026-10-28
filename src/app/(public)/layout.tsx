import Link from 'next/link';
import { getSettings, POLICY_KEYS } from '@/lib/settings';
import { createPublicClient } from '@/lib/supabase/public';
import { httpUrl, publicUrl, tgLink, waLink } from '@/lib/format';
import { AccountLink } from '@/components/AccountLink';
import type { Branch } from '@/types';

const NAV = [
  { href: '/products', label: 'المنتجات' },
  { href: '/offers', label: 'العروض' },
  { href: '/branches', label: 'الفروع' },
  { href: '/about', label: 'من نحن' },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const sb = createPublicClient();
  const { data: branches } = await sb.from('branches').select('id,name,address,phone').eq('is_active', true).order('sort_order');
  const logo = publicUrl('branding', s.store.logo_path);
  const wa = waLink(s.contact.whatsapp);
  const tg = tgLink(s.contact.telegram);
  const fb = httpUrl(s.contact.facebook);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="container-page flex h-14 items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-primary">
            {logo && <img src={logo} alt="" className="size-8 rounded object-contain" />}
            <span>{s.store.name}</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm md:flex" aria-label="التنقل الرئيسي">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="hover:text-primary">{n.label}</Link>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/products" aria-label="بحث" className="btn btn-outline btn-sm">🔍</Link>
            <AccountLink />
            <details className="relative md:hidden">
              <summary className="btn btn-outline btn-sm cursor-pointer list-none" aria-label="القائمة">☰</summary>
              <div className="card absolute end-0 mt-2 grid w-44 gap-1 p-2 text-sm">
                {NAV.map((n) => <Link key={n.href} href={n.href} className="rounded px-2 py-2 hover:bg-border/40">{n.label}</Link>)}
              </div>
            </details>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="mt-16 border-t border-border bg-surface">
        <div className="container-page grid gap-8 py-10 text-sm md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-base font-bold text-primary">{s.store.name}</p>
            {s.store.tagline && <p className="text-muted">{s.store.tagline}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {wa && <a className="btn btn-outline btn-sm" href={wa} target="_blank" rel="noopener">واتساب</a>}
              {tg && <a className="btn btn-outline btn-sm" href={tg} target="_blank" rel="noopener">تلجرام</a>}
              {fb && <a className="btn btn-outline btn-sm" href={fb} target="_blank" rel="noopener">فيسبوك</a>}
            </div>
          </div>
          <div className="space-y-2">
            <p className="font-bold">فروعنا</p>
            {(branches as Pick<Branch, 'id' | 'name' | 'address' | 'phone'>[] | null)?.map((b) => (
              <p key={b.id} className="text-muted">{b.name}{b.address ? ` — ${b.address}` : ''}</p>
            ))}
          </div>
          <div className="space-y-2">
            <p className="font-bold">السياسات</p>
            <ul className="space-y-1 text-muted">
              {(Object.keys(POLICY_KEYS) as (keyof typeof POLICY_KEYS)[]).map((k) => {
                const p = s[POLICY_KEYS[k]] as { title?: string } | undefined;
                return p?.title ? <li key={k}><Link className="hover:text-primary" href={`/policies/${k}`}>{p.title}</Link></li> : null;
              })}
            </ul>
          </div>
        </div>
        <p className="border-t border-border py-4 text-center text-xs text-muted">© {s.store.name}</p>
      </footer>

      {wa && (
        <a href={wa} target="_blank" rel="noopener" aria-label="تواصل عبر واتساب"
          className="fixed bottom-4 start-4 z-20 flex size-12 items-center justify-center rounded-full bg-[#25D366] text-xl text-white shadow-lg">
          💬
        </a>
      )}
    </>
  );
}
