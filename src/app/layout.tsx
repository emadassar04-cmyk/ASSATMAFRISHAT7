import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Tajawal } from 'next/font/google';
import { getSettings, themeToCss } from '@/lib/settings';
import { SwRegister } from '@/components/SwRegister';
import '@/styles/globals.css';

// الخطان المسموحان في الـ PRD؛ يُختار أحدهما من إعدادات الثيم
const tajawal = Tajawal({ subsets: ['arabic'], weight: ['400', '500', '700'], display: 'swap', variable: '--font-tajawal' });
const plex = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '700'], display: 'swap', variable: '--font-plex' });

export const revalidate = 60;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    metadataBase: new URL(siteUrl),
    title: { default: s.store.name, template: `%s | ${s.store.name}` },
    description: s.store.tagline ?? s.store.name,
    applicationName: s.store.name,
    openGraph: { siteName: s.store.name, locale: 'ar_PS', type: 'website' },
    manifest: '/manifest.webmanifest',
    icons: { icon: '/icon.svg', apple: '/icon.svg' },
  };
}

export const viewport: Viewport = { themeColor: '#6b4226', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const fontVar = s.theme.font === 'plex' ? 'var(--font-plex)' : 'var(--font-tajawal)';
  const css = `:root{--font-main:${fontVar}}${themeToCss(s.theme)}`;
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${plex.variable}`}>
      <head><style dangerouslySetInnerHTML={{ __html: css }} /></head>
      <body className="min-h-dvh">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
