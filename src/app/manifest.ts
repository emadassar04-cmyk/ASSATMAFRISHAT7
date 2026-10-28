import type { MetadataRoute } from 'next';
import { getSettings } from '@/lib/settings';

export const revalidate = 3600;

/** بيان PWA: الاسم والألوان من إعدادات المتجر */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings();
  return {
    name: s.store.name,
    short_name: s.store.name.slice(0, 12),
    description: s.store.tagline ?? s.store.name,
    lang: 'ar',
    dir: 'rtl',
    start_url: '/',
    display: 'standalone',
    background_color: s.theme.colors?.bg ?? '#faf7f2',
    theme_color: s.theme.colors?.primary ?? '#6b4226',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
