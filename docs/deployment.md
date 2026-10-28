# دليل النشر (يُحدَّث مع كل مرحلة)

> الحالة: **المرحلة 1**. لم يُنشأ مشروع Vercel بعد (بانتظار قرار المستودع، انظر `docs/roadmap.md`).

## 1) Supabase
- **مشروع التطوير الحالي:** `rmvnexuqdpyrcyfuqokd` (eu-west-1). الـ Migrations الأربعة مطبّقة عليه:
  `foundation` · `catalog` · `rate_limit` · `google_auth` (ملفاتها في `supabase/migrations`، وهي المصدر الوحيد للتغييرات).
- **الإنتاج:** مشروع منفصل (أو Branching) — قرار معلّق. التطبيق على الإنتاج: `supabase link` ثم `supabase db push`.
- البيانات التجريبية `supabase/seed.sql` **للتطوير فقط**، لا تُشغَّل على الإنتاج. الإعدادات الحقيقية تُدخل من لوحة الإدارة.
- **Auth:** تسجيل الدخول **بحساب Google (Gmail) فقط**؛ لا جوال ولا OTP.
  1. في Google Cloud Console أنشئ OAuth Client (Web). أضف Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
  2. في Supabase → Authentication → Providers → Google: فعّله وأدخل Client ID وSecret.
  3. Authentication → URL Configuration: `Site URL` = دومين الموقع، وأضف `https://<الدومين>/api/auth/callback` (و`http://localhost:3000/api/auth/callback` للتطوير) إلى Redirect URLs.
  4. فعّل **MFA (TOTP)** في Authentication → Multi-Factor.
  - المستخدم الجديد يُنشأ تلقائياً بدور `customer` عند أول دخول. الموظفون يُضافون من «المستخدمون» ببريد Gmail، ويرتبط حسابهم تلقائياً بنفس البريد.
- **Storage:** Buckets `branding` · `category-images` · `product-images` (عامة) أُنشئت بالـ migration. (`receipts` و`custom-refs` الخاصان في المرحلة 2.)

### إنشاء أول إداري
1. ادخل بحساب Google الخاص بك من `/login` (يُنشأ حساب زبون).
2. من SQL Editor (مرة واحدة فقط):
   ```sql
   update public.profiles set role = 'admin' where email = 'you@gmail.com';
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

4. الصفحات العامة تستخدم ISR (إعادة توليد كل 60 ثانية)، وكل تعديل من اللوحة يستدعي `revalidatePath` فيظهر فوراً.

## 3) ربط واتساب وفيسبوك (من اللوحة)
صفحة **الربط** في لوحة الإدارة (`/dashboard/integrations`، للإداري مع 2FA):
- تُدخل Phone number ID وAccess token لواتساب للأعمال، وPage ID وPage access token لفيسبوك، بدل ملفات البيئة.
- الإعدادات غير السرية في جدول `integrations`؛ **التوكنات في Supabase Vault مشفّرة** ولا تُقرأ إلا عبر دوال `service_role` من الخادم (لا تعود للمتصفح، ولا تظهر بعد الحفظ).
- «اختبار الاتصال» يستدعي Graph API فعلياً؛ عند النجاح تُملأ بيانات التواصل الفارغة (رقم واتساب ورابط الصفحة) فيظهر زر التواصل في الموقع.
- يتطلب `SUPABASE_SERVICE_ROLE_KEY` على الخادم (موجود في Vercel). المتغيرات `WHATSAPP_*` و`FB_*` في `.env.example` للتوثيق فقط ولا يقرأها الموقع.

## 4) الطلبات (الدفع والتوصيل بالاتفاق)
- الزبون يضيف للسلة (محلية في المتصفح) ثم `/checkout` (يتطلب تسجيل دخول Google): الفرع، استلام أو توصيل، الجوال، وسيلة التواصل المفضلة (واتساب/فيسبوك)، وموافقة سياسة الاستبدال.
- **الأسعار والمخزون ورسوم التوصيل تُحسب في قاعدة البيانات** (`create_order`)؛ الخادم يرسل المعرّفات والكميات فقط.
- **الدفع:** طريقة افتراضية «الاتفاق عبر واتساب أو فيسبوك». **التوصيل:** منطقة «التوصيل بالاتفاق» رسومها تُحدَّد من الإدارة بعد الاتفاق (`/dashboard/orders/<id>`). يمكن إضافة مناطق بأسعار ثابتة من جدول `delivery_zones`، وتعطيل التوصيل كلياً من الإعداد `delivery`.
- بعد تقديم الطلب تظهر صفحة `/orders/<id>` بأزرار تواصل (واتساب برسالة جاهزة تحمل رقم الطلب، وماسنجر) تُبنى من إعدادات التواصل/صفحة الربط.
- لوحة الإدارة: الطلبات، تغيير الحالة (مخطط انتقالات مفروض في القاعدة، والإلغاء يتطلب سبباً ويعيد المخزون)، رسوم التوصيل، مراجعة الدفعات/الإيصالات (روابط مؤقتة من bucket خاص). للإداري مع 2FA فقط.
- حد المحاولات: 5 طلبات/10 دقائق للمستخدم (يتطلب `SUPABASE_SERVICE_ROLE_KEY`).
- الأحداث (`outbox_events`) تُسجَّل مع كل طلب/دفعة/تغيير حالة وللتعديلات الحساسة؛ إرسالها إلى n8n/تلجرام من المرحلة 2 (لاحقاً) و3.

## 5) PWA
- `public/sw.js` يُسجَّل في الإنتاج فقط: الصفحات شبكة-أولاً مع رجوع للكاش وصفحة `/offline`، والصور والملفات الثابتة كاش-أولاً.
- لا يُخزَّن أي مسار خاص (`/api` `/dashboard` `/account` `/mfa` `/login`).
- الأيقونات `public/icon-192.png` و`icon-512.png` مؤقتة وتُستبدل بلوجو المتجر.

## 6) الاختبارات
```bash
npm run typecheck && npm run lint && npm run test && npm run build
```
اختبارات RLS: `supabase/tests/rls_phase1.sql` (انظر `CLAUDE.md`).
