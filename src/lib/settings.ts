import { cache } from 'react';
import { createPublicClient } from '@/lib/supabase/public';
import type { StoreSettings, Policy } from '@/types';

const DEFAULTS: StoreSettings = {
  store: { name: 'المتجر' },
  theme: {},
  contact: {},
  hero: {},
  deposit: { enabled: false, percent: 0 },
};

/** كل الإعدادات العامة كخريطة key -> value (مرة واحدة لكل طلب). لا قيم متجر مكتوبة في الكود. */
export const getSettings = cache(async (): Promise<StoreSettings> => {
  const sb = createPublicClient();
  const { data } = await sb.from('settings').select('key, value').eq('is_public', true);
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const row of data ?? []) out[row.key] = row.value;
  return out as StoreSettings;
});

export const POLICY_KEYS = {
  exchange: 'policy.exchange',
  'custom-orders': 'policy.custom_orders',
  privacy: 'policy.privacy',
  terms: 'policy.terms',
  'data-deletion': 'policy.data_deletion',
} as const;

export async function getPolicy(slug: keyof typeof POLICY_KEYS): Promise<Policy | null> {
  const s = await getSettings();
  return (s[POLICY_KEYS[slug]] as Policy | undefined) ?? null;
}

/** يحوّل ألوان الثيم إلى متغيرات CSS تُحقن في <head>. القيم تُنظَّف لمنع حقن CSS. */
export function themeToCss(theme: StoreSettings['theme']): string {
  const safe = (v: string) => /^[#a-zA-Z0-9(),.\s%-]{1,40}$/.test(v);
  const map: Record<string, string> = {
    bg: '--bg', surface: '--surface', fg: '--fg', muted: '--muted', primary: '--primary',
    primaryFg: '--primary-fg', accent: '--accent', border: '--border',
  };
  const decls: string[] = [];
  for (const [k, cssVar] of Object.entries(map)) {
    const v = theme.colors?.[k];
    if (v && safe(v)) decls.push(`${cssVar}:${v}`);
  }
  if (theme.radius && safe(theme.radius)) decls.push(`--radius:${theme.radius}`);
  return decls.length ? `:root{${decls.join(';')}}` : '';
}
