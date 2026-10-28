# دليل النشر (يُحدَّث مع كل مرحلة)

> الحالة: **المرحلة 1**. لم يُنشأ مشروع Vercel بعد (بانتظار قرار المستودع، انظر `docs/roadmap.md`).

## 1) Supabase
- **مشروع التطوير الحالي:** `rmvnexuqdpyrcyfuqokd` (eu-west-1). الـ Migrations الثلاثة مطبّقة عليه:
  `foundation` · `catalog` · `rate_limit` (ملفاتها في `supabase/migrations`، وهي المصدر الوحيد للتغييرات).
- **الإنتاج:** مشروع منفصل (أو Branching) — قرار معلّق. التطبيق على الإنتاج: `supabase link` ثم `supabase db push`.
- البيانات التجريبية `supabase/seed.sql` **للتطوير فقط**، لا تُشغَّل على الإنتاج. الإعدادات الحقيقية تُدخل من لوحة الإدارة.
- **Auth:** مزوّد البريد مفعّل (يستخدمه النظام داخلياً بريداً اصطناعياً `<phone>@phone.alassar.local`)؛ تسجيل الدخول للمستخدم برقم الجوال + OTP فقط.
  - فعّل **MFA (TOTP)** في Authentication → Multi-Factor.
  - أوقف التسجيل المباشر بالبريد (`Allow new users to sign up` يبقى مفعّلاً لأن إنشاء الحساب يتم من الخادم، لكن لا تنشر واجهة بريد).
- **Storage:** Buckets `branding` · `category-images` · `product-images` (عامة) أُنشئت بالـ migration. (`receipts` و`custom-refs` الخاصان في المرحلة 2.)

### إنشاء أول إداري
1. شغّل التطبيق واطلب OTP برقمك (يُنشأ حساب زبون).
2. من SQL Editor (مرة واحدة فقط):
   ```sql
   update public.profiles set role = 'admin' where phone = '+970XXXXXXXXX';
   ```
3. ادخل، وسيُطلب منك إعداد 2FA قبل فتح اللوحة. بعدها أضف بقية الموظفين من «المستخدمون».

## 2) Vercel
1. Import من GitHub (Production = `main`، Preview لكل PR).
2. Framework: Next.js. Node 22. لا أوامر بناء مخصصة (`npm run build`).
3. متغيرات البيئة (Settings → Environment Variables)، القيم الحقيقية هنا **فقط**:

| المتغير | ملاحظة |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | مفتاح publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | **سري**، للخادم فقط، لا يبدأ بـ NEXT_PUBLIC |
| `NEXT_PUBLIC_SITE_URL` | دومين الموقع (للـ sitemap وOG) |
| `OTP_HASH_SECRET` | سر عشوائي طويل |
| `OTP_DEV_MODE` | **اتركه `false` أو غير معرّف** في الإنتاج (ويُتجاهل أصلاً عند `NODE_ENV=production`) |
| `N8N_BASE_URL` · `N8N_OUTBOUND_HMAC_SECRET` | مطلوبان لإرسال OTP فعلياً (WF-10) |

4. الصفحات العامة تستخدم ISR (إعادة توليد كل 60 ثانية)، وكل تعديل من اللوحة يستدعي `revalidatePath` فيظهر فوراً.

## 3) إرسال OTP (قيد معلّق)
إرسال الرمز عبر واتساب/تلجرام يمر على n8n (WF-10 في `docs/n8n-workflows.md`) وهو **غير مُنشأ بعد** (المرحلة 2 حسب الخطة). حتى ذلك الحين:
- محلياً: `OTP_DEV_MODE=true` و`OTP_DEV_CODE=000000` (يعمل خارج الإنتاج فقط).
- الإنتاج: لن يصل OTP قبل ربط n8n وقناة واتساب/تلجرام (بيانات اعتماد Meta/Telegram مطلوبة).

## 4) PWA
- `public/sw.js` يُسجَّل في الإنتاج فقط: الصفحات شبكة-أولاً مع رجوع للكاش وصفحة `/offline`، والصور والملفات الثابتة كاش-أولاً.
- لا يُخزَّن أي مسار خاص (`/api` `/dashboard` `/account` `/mfa` `/login`).
- الأيقونات `public/icon-192.png` و`icon-512.png` مؤقتة وتُستبدل بلوجو المتجر.

## 5) الاختبارات
```bash
npm run typecheck && npm run lint && npm run test && npm run build
```
اختبارات RLS: `supabase/tests/rls_phase1.sql` (انظر `CLAUDE.md`).
