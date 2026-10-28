import { describe, expect, it } from 'vitest';
import { PROVIDERS, digitsOnly, graphError, isProvider, secretName, summarizeFacebook, summarizeWhatsApp, validateField } from '@/lib/integrationSpecs';

const f = (p: 'whatsapp' | 'facebook', name: string) => PROVIDERS[p].fields.find((x) => x.name === name)!;

describe('تحقق حقول الربط', () => {
  it('المعرّفات أرقام فقط', () => {
    expect(validateField(f('whatsapp', 'phone_number_id'), '123456789012345')).toBeNull();
    expect(validateField(f('whatsapp', 'phone_number_id'), '12ab')).toMatch(/غير صالح/);
    expect(validateField(f('facebook', 'page_id'), "1; drop table x")).toMatch(/غير صالح/);
  });
  it('الحقل المطلوب الفارغ مرفوض والاختياري مقبول', () => {
    expect(validateField(f('whatsapp', 'phone_number_id'), '')).toMatch(/مطلوب/);
    expect(validateField(f('whatsapp', 'waba_id'), '')).toBeNull();
  });
  it('التوكن: طول معقول وأحرف آمنة فقط (يرفض المسافات والأسطر)', () => {
    expect(validateField(f('whatsapp', 'access_token'), 'EAAB' + 'x'.repeat(40))).toBeNull();
    expect(validateField(f('whatsapp', 'access_token'), 'قصير')).toMatch(/غير صالح/);
    expect(validateField(f('whatsapp', 'access_token'), 'EAAB' + 'x'.repeat(40) + '\nGET /')).toMatch(/غير صالح/);
  });
  it('app secret: 32 خانة hex', () => {
    expect(validateField(f('facebook', 'app_secret'), 'a'.repeat(32))).toBeNull();
    expect(validateField(f('facebook', 'app_secret'), 'g'.repeat(32))).toMatch(/غير صالح/);
  });
  it('لكل مزوّد حقل توكن واحد سري ومطلوب', () => {
    for (const p of ['whatsapp', 'facebook'] as const) {
      const t = PROVIDERS[p].fields.filter((x) => x.token);
      expect(t).toHaveLength(1);
      expect(t[0].secret && t[0].required).toBe(true);
    }
  });
  it('كل الحقول السرية تطابق نمط أسماء الأسرار المسموح في قاعدة البيانات', () => {
    for (const p of ['whatsapp', 'facebook'] as const) {
      for (const x of PROVIDERS[p].fields.filter((y) => y.secret)) {
        expect(secretName(p, x.name)).toMatch(/^integration:(whatsapp|facebook):[a-z_]+$/);
      }
    }
  });
  it('isProvider', () => {
    expect(isProvider('whatsapp')).toBe(true);
    expect(isProvider('telegram')).toBe(false);
  });
});

describe('ردود Graph API', () => {
  it('واتساب: ردّ صالح', () => {
    const s = summarizeWhatsApp({ display_phone_number: '+970 59 479 3301', verified_name: 'العصار' });
    expect(s.ok).toBe(true);
    expect(digitsOnly(s.info!.display_phone_number)).toBe('970594793301');
  });
  it('واتساب: ردّ ناقص يُعدّ فشلاً', () => expect(summarizeWhatsApp({}).ok).toBe(false));
  it('فيسبوك: اسم ورابط الصفحة', () => {
    expect(summarizeFacebook({ name: 'صفحة', link: 'https://facebook.com/x' })).toEqual({ ok: true, info: { page_name: 'صفحة', page_link: 'https://facebook.com/x' } });
    expect(summarizeFacebook({}).ok).toBe(false);
  });
  it('رسالة خطأ Graph مقتطعة ولا تحمل توكناً', () => {
    expect(graphError({ error: { message: 'Invalid OAuth access token.' } }, 400)).toBe('Invalid OAuth access token.');
    expect(graphError({ error: { message: 'x'.repeat(500) } }, 400)).toHaveLength(200);
    expect(graphError({}, 500)).toBe('HTTP 500');
  });
});
