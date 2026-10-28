import { requireAdmin } from '@/lib/auth';
import { publicUrl } from '@/lib/format';
import type { Policy, StoreSettings } from '@/types';
import { Check, Field, Flash, PageHeader, type SP } from '../_ui';
import { saveSettings } from './actions';
import { POLICY_SETTINGS } from './keys';

export const metadata = { title: 'الإعدادات' };

const COLOR_LABELS: [string, string][] = [
  ['bg', 'الخلفية'], ['surface', 'البطاقات'], ['fg', 'النص'], ['muted', 'نص ثانوي'],
  ['primary', 'الأساسي'], ['primaryFg', 'نص الأساسي'], ['accent', 'اللمسة الذهبية'], ['border', 'الحدود'],
];

function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
  <details className="card mb-3 p-4" open={id === 'store'}>
    <summary className="cursor-pointer font-bold">{title}</summary>
    <form action={saveSettings} className="grid gap-3 pt-4 sm:grid-cols-2">
      <input type="hidden" name="section" value={id} />
      {children}
      <button className="btn btn-primary sm:col-span-2">حفظ</button>
    </form>
  </details>
);
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin('/dashboard/settings');
  const { data } = await supabase.from('settings').select('key, value');
  const s = Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value])) as unknown as StoreSettings;
  const c = s.theme?.colors ?? {};
  const logo = publicUrl('branding', s.store?.logo_path);

  return (
    <>
      <PageHeader title="الإعدادات" />
      <Flash sp={sp} />

      <Sec id="store" title="بيانات المتجر">
        <Field label="اسم المتجر"><input name="name" defaultValue={s.store?.name} className="input" required /></Field>
        <Field label="الشعار الفرعي"><input name="tagline" defaultValue={s.store?.tagline} className="input" /></Field>
        <Field label="من نحن" className="sm:col-span-2"><textarea name="about" rows={4} defaultValue={s.store?.about} className="input" /></Field>
        <Field label="اللوجو">
          {logo && <img src={logo} alt="" className="mb-2 h-12 object-contain" />}
          <input type="file" name="logo" accept="image/jpeg,image/png,image/webp" className="input" />
        </Field>
      </Sec>

      <Sec id="theme" title="الثيم والألوان">
        {COLOR_LABELS.map(([k, label]) => (
          <Field key={k} label={label}><input type="color" name={`c_${k}`} defaultValue={c[k] ?? '#000000'} className="input !p-1" /></Field>
        ))}
        <Field label="استدارة الزوايا (مثل 0.75rem)"><input name="radius" defaultValue={s.theme?.radius ?? '0.75rem'} dir="ltr" className="input" /></Field>
        <Field label="الخط">
          <select name="font" defaultValue={s.theme?.font ?? 'tajawal'} className="input">
            <option value="tajawal">Tajawal</option><option value="plex">IBM Plex Sans Arabic</option>
          </select>
        </Field>
      </Sec>

      <Sec id="contact" title="التواصل والقنوات">
        <Field label="هاتف"><input name="phone" defaultValue={s.contact?.phone} className="input" dir="ltr" /></Field>
        <Field label="واتساب (أرقام مع رمز الدولة)"><input name="whatsapp" defaultValue={s.contact?.whatsapp} className="input" dir="ltr" /></Field>
        <Field label="تلجرام (معرّف بدون @)"><input name="telegram" defaultValue={s.contact?.telegram} className="input" dir="ltr" /></Field>
        <Field label="رابط صفحة فيسبوك"><input name="facebook" defaultValue={s.contact?.facebook} className="input" dir="ltr" /></Field>
        <Field label="البريد"><input name="email" defaultValue={s.contact?.email} className="input" dir="ltr" /></Field>
      </Sec>

      <Sec id="hero" title="واجهة الصفحة الرئيسية">
        <Field label="العنوان"><input name="title" defaultValue={s.hero?.title} className="input" /></Field>
        <Field label="النص"><input name="subtitle" defaultValue={s.hero?.subtitle} className="input" /></Field>
        <Field label="صورة الخلفية"><input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="input" /></Field>
      </Sec>

      <Sec id="deposit" title="العربون للطلبات المفصّلة">
        <Check name="enabled" label="تفعيل العربون" defaultChecked={s.deposit?.enabled} />
        <Field label="النسبة %"><input name="percent" type="number" min="0" max="100" step="1" defaultValue={s.deposit?.percent ?? 0} className="input" /></Field>
      </Sec>

      <Sec id="policies" title="نصوص السياسات (الاستبدال، التفصيل، الخصوصية، الشروط، حذف البيانات)">
        {POLICY_SETTINGS.map(([key, label]) => {
          const p = (s[key] as Policy | undefined) ?? { title: label, body: '' };
          return (
            <fieldset key={key} className="space-y-2 rounded-card border border-border p-3 sm:col-span-2">
              <legend className="px-1 text-sm font-medium">{label}</legend>
              <Field label="العنوان"><input name={`${key}.title`} defaultValue={p.title} className="input" /></Field>
              <Field label="ملخص قصير (يظهر في صفحة المنتج وإتمام الطلب)"><input name={`${key}.summary`} defaultValue={p.summary ?? ''} className="input" /></Field>
              <Field label="النص الكامل"><textarea name={`${key}.body`} rows={6} defaultValue={p.body} className="input" /></Field>
            </fieldset>
          );
        })}
      </Sec>
    </>
  );
}
