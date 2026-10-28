// تعريف حقول الربط وتحقق مدخلاتها (منطق نقي قابل للاختبار، بلا وصول لقاعدة البيانات أو الشبكة).

export type Provider = 'whatsapp' | 'facebook';

export interface FieldSpec {
  name: string;
  label: string;
  secret?: boolean;
  /** التوكن الذي يُستخدم لاختبار الاتصال */
  token?: boolean;
  required?: boolean;
  pattern: RegExp;
  hint: string;
}

export interface ProviderSpec { title: string; help: string; helpUrl: string; fields: FieldSpec[] }

const ID = /^\d{5,20}$/;
const TOKEN = /^[A-Za-z0-9_\-.]{20,600}$/;
const APP_SECRET = /^[a-fA-F0-9]{32}$/;

export const PROVIDERS: Record<Provider, ProviderSpec> = {
  whatsapp: {
    title: 'واتساب للأعمال (WhatsApp Cloud API)',
    help: 'من Meta for Developers ← تطبيقك ← WhatsApp ← API Setup. استخدم توكناً دائماً (System User) وليس التوكن المؤقت.',
    helpUrl: 'https://developers.facebook.com/apps/',
    fields: [
      { name: 'phone_number_id', label: 'Phone number ID', required: true, pattern: ID, hint: 'أرقام فقط' },
      { name: 'waba_id', label: 'WhatsApp Business Account ID', pattern: ID, hint: 'أرقام فقط (اختياري)' },
      { name: 'access_token', label: 'Access token', secret: true, token: true, required: true, pattern: TOKEN, hint: 'يُحفظ مشفّراً ولا يُعرض بعد الحفظ' },
      { name: 'app_secret', label: 'App secret', secret: true, pattern: APP_SECRET, hint: '32 خانة hex، للتحقق من توقيع الـ Webhooks لاحقاً (اختياري)' },
    ],
  },
  facebook: {
    title: 'صفحة فيسبوك (Messenger)',
    help: 'من Meta for Developers ← تطبيقك ← Messenger ← إعداد الصفحة، ولّد Page access token طويل الأمد.',
    helpUrl: 'https://developers.facebook.com/apps/',
    fields: [
      { name: 'page_id', label: 'Page ID', required: true, pattern: ID, hint: 'أرقام فقط' },
      { name: 'app_id', label: 'App ID', pattern: ID, hint: 'أرقام فقط (اختياري)' },
      { name: 'page_access_token', label: 'Page access token', secret: true, token: true, required: true, pattern: TOKEN, hint: 'يُحفظ مشفّراً ولا يُعرض بعد الحفظ' },
      { name: 'app_secret', label: 'App secret', secret: true, pattern: APP_SECRET, hint: '32 خانة hex، للتحقق من توقيع الـ Webhooks لاحقاً (اختياري)' },
    ],
  },
};

export const isProvider = (s: string): s is Provider => s === 'whatsapp' || s === 'facebook';
export const secretName = (p: Provider, field: string) => `integration:${p}:${field}`;

/** يعيد رسالة خطأ أو null */
export function validateField(f: FieldSpec, value: string): string | null {
  if (!value) return f.required ? `${f.label} مطلوب` : null;
  return f.pattern.test(value) ? null : `${f.label} غير صالح`;
}

export const STATUS_LABEL: Record<string, string> = {
  not_configured: 'غير مربوط', saved: 'محفوظ (لم يُختبر)', connected: 'متصل', error: 'فشل الاتصال',
};

// --- تلخيص ردود Graph API ---
export interface Summary { ok: boolean; info?: Record<string, string>; error?: string }

export function graphError(json: unknown, status: number): string {
  const msg = (json as { error?: { message?: unknown } })?.error?.message;
  return typeof msg === 'string' && msg ? msg.slice(0, 200) : `HTTP ${status}`;
}

export function summarizeWhatsApp(json: { display_phone_number?: string; verified_name?: string; quality_rating?: string }): Summary {
  if (!json.display_phone_number) return { ok: false, error: 'رد غير متوقع من واتساب' };
  return { ok: true, info: {
    display_phone_number: json.display_phone_number, verified_name: json.verified_name ?? '', quality_rating: json.quality_rating ?? '',
  } };
}

export function summarizeFacebook(json: { name?: string; link?: string }): Summary {
  if (!json.name) return { ok: false, error: 'رد غير متوقع من فيسبوك' };
  return { ok: true, info: { page_name: json.name, page_link: json.link ?? '' } };
}

/** أرقام فقط بصيغة دولية لاستخدامها في wa.me */
export const digitsOnly = (s: string) => s.replace(/\D/g, '');
