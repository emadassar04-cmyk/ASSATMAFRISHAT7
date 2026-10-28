import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;

/** وضع التطوير: رمز ثابت، ويُمنع تلقائياً في الإنتاج */
export const isDevOtp = () => process.env.OTP_DEV_MODE === 'true' && process.env.NODE_ENV !== 'production';

export function generateCode(): string {
  if (isDevOtp()) return process.env.OTP_DEV_CODE ?? '000000';
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** يُخزَّن الـ hash فقط (HMAC) ولا يُخزَّن الرمز نفسه */
export function hashCode(phone: string, code: string): string {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret) throw new Error('OTP_HASH_SECRET غير مضبوط');
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * إرسال الرمز إلى n8n (WF-10) بتوقيع HMAC. الرمز لا يُسجَّل في أي log.
 * قبل ربط n8n (المرحلة 2) يُستخدم وضع التطوير فقط.
 */
export async function sendOtpViaN8n(phone: string, channel: 'whatsapp' | 'telegram', code: string): Promise<boolean> {
  const base = process.env.N8N_BASE_URL;
  const secret = process.env.N8N_OUTBOUND_HMAC_SECRET;
  if (!base || !secret || base.includes('[')) return false;
  const body = JSON.stringify({
    event_type: 'auth.otp_requested', idempotency_key: crypto.randomUUID(), payload: { phone, channel, code },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/webhook/alassar/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-alassar-timestamp': ts, 'x-alassar-signature': `sha256=${sig}` },
      body, signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
