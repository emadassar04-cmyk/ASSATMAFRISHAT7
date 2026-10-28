'use server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkConnection } from '@/lib/integrations';
import { PROVIDERS, digitsOnly, isProvider, secretName, validateField, type Provider } from '@/lib/integrationSpecs';
import { go, refreshStorefront, str } from '../actions-util';

const BACK = '/dashboard/integrations';
type Row = { config: Record<string, string> | null; secret_names: string[] | null };

function providerOf(formData: FormData): Provider {
  const p = str(formData, 'provider');
  if (!isProvider(p)) go(BACK, { error: 'مزوّد غير معروف' });
  return p as Provider;
}

async function loadRow(provider: Provider): Promise<Row> {
  const { data } = await createAdminClient().from('integrations').select('config, secret_names').eq('provider', provider).single();
  return (data ?? { config: {}, secret_names: [] }) as Row;
}

/** حفظ الإعدادات (غير السرية في الجدول) والأسرار (في Vault). الحقل السري الفارغ = إبقاء القيمة المحفوظة. */
export async function saveIntegration(formData: FormData) {
  const { userId } = await requireAdmin(BACK);
  const provider = providerOf(formData);
  const row = await loadRow(provider);
  const config: Record<string, string> = { ...(row.config ?? {}) };
  const names = new Set(row.secret_names ?? []);
  const secrets: [string, string][] = [];

  for (const f of PROVIDERS[provider].fields) {
    const v = str(formData, f.name);
    if (f.secret) {
      if (!v) { if (f.required && !names.has(f.name)) go(BACK, { error: `${f.label} مطلوب` }); continue; }
      const err = validateField(f, v);
      if (err) go(BACK, { error: err });
      secrets.push([f.name, v]); names.add(f.name);
    } else {
      const err = validateField(f, v);
      if (err) go(BACK, { error: err });
      if (v) config[f.name] = v; else delete config[f.name];
    }
  }

  const admin = createAdminClient();
  for (const [name, value] of secrets) {
    const { error } = await admin.rpc('set_integration_secret', { p_name: secretName(provider, name), p_value: value });
    if (error) go(BACK, { error: 'تعذّر حفظ السر' });
  }
  const { error } = await admin.from('integrations')
    .update({ config, secret_names: [...names], status: 'saved', last_error: null, updated_by: userId }).eq('provider', provider);
  if (error) go(BACK, { error: 'تعذّر الحفظ' });
  go(BACK, { ok: 'تم الحفظ. اضغط «اختبار الاتصال» للتأكد.' });
}

/** اختبار فعلي مقابل Graph API؛ عند النجاح يملأ بيانات التواصل الفارغة في إعدادات الموقع فتظهر أزرار واتساب/فيسبوك. */
export async function testIntegration(formData: FormData) {
  await requireAdmin(BACK);
  const provider = providerOf(formData);
  const spec = PROVIDERS[provider];
  const admin = createAdminClient();
  const row = await loadRow(provider);
  const config = row.config ?? {};
  for (const f of spec.fields.filter((x) => x.required && !x.secret)) {
    if (!config[f.name]) go(BACK, { error: `${f.label} غير مضبوط` });
  }
  const tokenField = spec.fields.find((f) => f.token)!;
  const { data: token } = await admin.rpc('get_integration_secret', { p_name: secretName(provider, tokenField.name) });
  if (!token || typeof token !== 'string') go(BACK, { error: `${tokenField.label} غير محفوظ` });

  const r = await checkConnection(provider, config, token as string);
  const now = new Date().toISOString();
  if (!r.ok) {
    await admin.from('integrations').update({ status: 'error', last_checked_at: now, last_error: r.error ?? 'خطأ' }).eq('provider', provider);
    go(BACK, { error: `فشل الاتصال: ${r.error}` });
  }
  await admin.from('integrations')
    .update({ status: 'connected', last_checked_at: now, last_error: null, config: { ...config, ...r.info } }).eq('provider', provider);

  // ربط الموقع: تعبئة قيم التواصل الفارغة فقط (لا نكتب فوق ما أدخله الإداري)
  const { data: cur } = await admin.from('settings').select('value').eq('key', 'contact').maybeSingle();
  const contact = { ...((cur?.value ?? {}) as Record<string, string>) };
  if (provider === 'whatsapp' && digitsOnly(contact.whatsapp ?? '').length < 8) contact.whatsapp = digitsOnly(r.info?.display_phone_number ?? '');
  if (provider === 'facebook' && !/^https?:\/\//.test(contact.facebook ?? '') && r.info?.page_link) contact.facebook = r.info.page_link;
  await admin.from('settings').update({ value: contact }).eq('key', 'contact');
  refreshStorefront();
  go(BACK, { ok: 'الاتصال ناجح ✓ وتم تفعيل زر التواصل في الموقع.' });
}

export async function removeIntegration(formData: FormData) {
  await requireAdmin(BACK);
  const provider = providerOf(formData);
  const admin = createAdminClient();
  const row = await loadRow(provider);
  for (const n of row.secret_names ?? []) await admin.rpc('delete_integration_secret', { p_name: secretName(provider, n) });
  await admin.from('integrations')
    .update({ config: {}, secret_names: [], status: 'not_configured', last_checked_at: null, last_error: null }).eq('provider', provider);
  go(BACK, { ok: 'تم فصل الربط وحذف الأسرار.' });
}
