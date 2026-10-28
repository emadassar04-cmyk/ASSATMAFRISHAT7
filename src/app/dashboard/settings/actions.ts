'use server';
import { requireAdmin } from '@/lib/auth';
import { uploadImage } from '@/lib/storage';
import { POLICY_SETTINGS } from './keys';
import { bool, file, go, numOr, refreshStorefront, str } from '../actions-util';

const BACK = '/dashboard/settings';
const COLORS = ['bg', 'surface', 'fg', 'muted', 'primary', 'primaryFg', 'accent', 'border'] as const;

/** حفظ قسم من الإعدادات. كل القيم تُخزَّن في جدول settings (لا شيء في الكود). */
export async function saveSettings(formData: FormData) {
  const { supabase, userId } = await requireAdmin(BACK);
  const section = str(formData, 'section');
  const { data: cur } = await supabase.from('settings').select('key, value').in('key', ['store', 'hero']);
  const current = (k: string) => (cur?.find((r: { key: string }) => r.key === k)?.value ?? {}) as Record<string, unknown>;
  const rows: { key: string; value: unknown }[] = [];

  if (section === 'store') {
    const value: Record<string, unknown> = {
      ...current('store'), name: str(formData, 'name'), tagline: str(formData, 'tagline'), about: str(formData, 'about'),
    };
    if (!value.name) go(BACK, { error: 'اسم المتجر مطلوب' });
    const logo = file(formData, 'logo');
    if (logo) {
      const up = await uploadImage(supabase, 'branding', 'logo', logo);
      if ('error' in up) go(BACK, { error: up.error });
      value.logo_path = up.path;
    }
    rows.push({ key: 'store', value });
  } else if (section === 'theme') {
    const colors: Record<string, string> = {};
    for (const c of COLORS) {
      const v = str(formData, `c_${c}`);
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) go(BACK, { error: `لون غير صالح: ${c}` });
      colors[c] = v;
    }
    const radius = str(formData, 'radius') || '0.75rem';
    if (!/^\d+(\.\d+)?(rem|px)$/.test(radius)) go(BACK, { error: 'قيمة الزوايا غير صالحة' });
    const font = str(formData, 'font') === 'plex' ? 'plex' : 'tajawal';
    rows.push({ key: 'theme', value: { colors, radius, font } });
  } else if (section === 'contact') {
    rows.push({ key: 'contact', value: Object.fromEntries(['phone', 'whatsapp', 'telegram', 'facebook', 'email'].map((k) => [k, str(formData, k)])) });
  } else if (section === 'hero') {
    const value: Record<string, unknown> = { ...current('hero'), title: str(formData, 'title'), subtitle: str(formData, 'subtitle') };
    const img = file(formData, 'image');
    if (img) {
      const up = await uploadImage(supabase, 'branding', 'hero', img);
      if ('error' in up) go(BACK, { error: up.error });
      value.image_path = up.path;
    }
    rows.push({ key: 'hero', value });
  } else if (section === 'deposit') {
    const percent = Math.min(100, Math.max(0, numOr(formData, 'percent')));
    rows.push({ key: 'deposit', value: { enabled: bool(formData, 'enabled'), percent } });
  } else if (section === 'policies') {
    for (const [key] of POLICY_SETTINGS) {
      rows.push({ key, value: { title: str(formData, `${key}.title`), summary: str(formData, `${key}.summary`), body: str(formData, `${key}.body`) } });
    }
  } else go(BACK, { error: 'قسم غير معروف' });

  const { error } = await supabase.from('settings').upsert(
    rows.map((r) => ({ ...r, is_public: true, updated_by: userId, updated_at: new Date().toISOString() })), { onConflict: 'key' });
  if (error) go(BACK, { error: 'تعذّر الحفظ' });
  refreshStorefront();
  go(BACK, { ok: 'تم حفظ الإعدادات' });
}
