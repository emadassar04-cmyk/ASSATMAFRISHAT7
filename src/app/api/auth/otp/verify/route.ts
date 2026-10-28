import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/phone';
import { OTP_MAX_ATTEMPTS, hashCode, safeEqualHex } from '@/lib/otp';

const emailFor = (phone: string) => `${phone.replace(/\D/g, '')}@phone.alassar.local`;

/** التحقق من الرمز ثم إنشاء/إيجاد المستخدم وفتح جلسة Supabase */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body.phone ?? ''));
  const code = String(body.code ?? '').trim();
  if (!phone || !/^\d{6}$/.test(code)) return NextResponse.json({ error: 'بيانات غير صحيحة' }, { status: 400 });

  const admin = createAdminClient();
  const { data: otp } = await admin.from('otp_requests').select('*').eq('phone', phone)
    .is('consumed_at', null).gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return NextResponse.json({ error: 'الرمز منتهي أو غير صالح' }, { status: 400 });

  await admin.from('otp_requests').update({ attempts: otp.attempts + 1 }).eq('id', otp.id);
  if (!safeEqualHex(otp.code_hash, hashCode(phone, code))) {
    return NextResponse.json({ error: 'الرمز غير صحيح' }, { status: 400 });
  }
  await admin.from('otp_requests').update({ consumed_at: new Date().toISOString() }).eq('id', otp.id);

  // مستخدم Supabase مرتبط بالجوال عبر بريد اصطناعي داخلي (المصدر الحقيقي للهوية هو الجوال)
  let email = emailFor(phone);
  const { data: existing } = await admin.from('profiles').select('id').eq('phone', phone).maybeSingle();
  if (existing) {
    // حساب موجود (مثلاً أضافه الإداري): نستخدم بريده الفعلي في Auth
    const { data: u } = await admin.auth.admin.getUserById(existing.id);
    if (u?.user?.email) email = u.user.email;
  } else {
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { phone } });
    if (error) return NextResponse.json({ error: 'تعذّر إنشاء الحساب' }, { status: 500 });
  }
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link.properties?.hashed_token) return NextResponse.json({ error: 'تعذّر فتح الجلسة' }, { status: 500 });

  const supabase = await createClient();
  const { error: vErr } = await supabase.auth.verifyOtp({ type: 'email', token_hash: link.properties.hashed_token });
  if (vErr) return NextResponse.json({ error: 'تعذّر فتح الجلسة' }, { status: 500 });

  const { data: profile } = await admin.from('profiles').select('role, is_active').eq('phone', phone).single();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: 'الحساب موقوف' }, { status: 403 });
  }
  const dest = profile.role === 'admin' || profile.role === 'moderator' ? '/dashboard' : '/account';
  return NextResponse.json({ ok: true, redirect: dest });
}
