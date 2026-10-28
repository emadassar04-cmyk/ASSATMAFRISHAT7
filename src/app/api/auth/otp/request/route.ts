import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/phone';
import { OTP_TTL_SECONDS, generateCode, hashCode, isDevOtp, sendOtpViaN8n } from '@/lib/otp';

/** طلب رمز تحقق: يُرسل عبر واتساب أو تلجرام (بدون SMS) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body.phone ?? ''));
  const channel = body.channel === 'telegram' ? 'telegram' : 'whatsapp';
  if (!phone) return NextResponse.json({ error: 'رقم الجوال غير صحيح' }, { status: 400 });

  const sb = createAdminClient();
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  // Rate limiting: 3 رموز/10 دقائق لكل رقم، و10/ساعة لكل IP
  const [okPhone, okIp] = await Promise.all([
    sb.rpc('check_rate_limit', { p_key: `otp:phone:${phone}`, p_limit: 3, p_window_seconds: 600 }),
    sb.rpc('check_rate_limit', { p_key: `otp:ip:${ip}`, p_limit: 10, p_window_seconds: 3600 }),
  ]);
  // الفشل مغلق: أي خطأ في فحص الحد يُعامل كتجاوز
  if (okPhone.data !== true || okIp.data !== true) {
    return NextResponse.json({ error: 'محاولات كثيرة، حاول لاحقاً' }, { status: 429 });
  }

  const code = generateCode();
  const { data: row, error } = await sb.from('otp_requests').insert({
    phone, channel, code_hash: hashCode(phone, code), expires_at: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
  }).select('id').single();
  if (error) return NextResponse.json({ error: 'تعذّر إنشاء الرمز' }, { status: 500 });

  if (!isDevOtp()) {
    const sent = await sendOtpViaN8n(phone, channel, code);
    if (!sent) {
      await sb.from('otp_requests').delete().eq('id', row.id);
      return NextResponse.json({ error: 'تعذّر إرسال الرمز حالياً' }, { status: 502 });
    }
  }
  return NextResponse.json({ ok: true, ttl: OTP_TTL_SECONDS });
}
