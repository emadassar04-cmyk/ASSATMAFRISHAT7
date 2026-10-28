# CLAUDE.md — مفروشات العصار

المرجع الأساسي: `docs/PRD.md`. اقرأه في بداية كل جلسة. عند أي تعارض، الـ PRD هو الحاكم. لا تفترض شيئاً غير مذكور فيه؛ اسأل قبل أي قرار مهم.

## ملخص المشروع
نظام ويب متكامل لمتجر "مفروشات العصار" (دير البلح والنصيرات، قطاع غزة). **Single-Tenant**: متجر واحد فقط، وليس منصة SaaS.
يشمل: واجهة عامة، 4 لوحات تحكم (Customer / Moderator / Admin / Auditor)، شات بوت ذكي (AI + بشري) على 4 قنوات، ونشر بموافقة.

## المعمارية
- **Frontend:** Next.js (App Router) + Tailwind، على Vercel.
- **DB + Auth + Storage:** Supabase (Postgres + RLS).
- **Automation + AI Agent:** n8n (self-hosted، دومين ثابت). Webhooks موقّعة.
- **القنوات:** موقع، فيسبوك ماسنجر/تعليقات، واتساب Cloud API، تلجرام.
- القاعدة: **الحفظ في Supabase أولاً ثم الإرسال إلى n8n** (Outbox + Retry). تفاصيل في `docs/architecture.md`.

## قواعد العمل (إلزامية)
1. **RTL وعربي فقط** (`<html lang="ar" dir="rtl">`)، استخدم خصائص منطقية (`ms-`/`me-`/`ps-`/`pe-`) لا `ml-`/`mr-`.
2. **Mobile-First**: صمّم للجوال أولاً. خفيف جداً (إنترنت غزة ضعيف)؛ لا مكتبات ثقيلة بلا مبرر، صور WebP + Lazy Loading، PWA.
3. **RLS إلزامي على كل جدول** في `public`، حسب الأدوار. لا جدول بدون سياسات. الـ `service_role` للخادم فقط، لا يصل للمتصفح أبداً.
4. **Migrations فقط**: كل تغيير DB عبر ملف في `supabase/migrations`. ممنوع التعديل اليدوي على قاعدة البيانات.
5. **لا أسرار في الكود** أو الـ logs أو الواجهة. الأسرار في Vercel env / Supabase Vault / n8n credentials. حدّث `.env.example` دائماً.
6. **لا بيانات متجر في الكود**: الاسم، اللوجو، الألوان، الفروع، الأقسام، الدفع، السياسات، الدوام، نصوص البوت — كلها من جداول الإعدادات. استخدم placeholders مثل `[رقم الحساب]` في الـ seed.
7. **Design Tokens** في مكان واحد (CSS variables + `tailwind.config`)، والقيم تُقرأ من إعدادات الثيم.
8. **Audit Log Append-Only**: لا UPDATE ولا DELETE لأي دور (حتى service_role عبر trigger يمنع ذلك).
9. **سياسة الاستبدال**: استبدال فقط، حضورياً في الفرع، لا استرداد مالي، لا نظام استبدال إلكتروني.
10. كود نظيف ومقسّم، **تعليقات بالعربي**. Commits واضحة.
11. **لا تنتقل لمرحلة قبل موافقة المستخدم** على السابقة (`docs/roadmap.md`).
12. فرع `main` = إنتاج، `dev` = تطوير، وكل ميزة في فرع مستقل + Pull Request. لا تُنشئ PR بدون طلب.
13. كل Workflow في n8n يُصدَّر JSON إلى `/n8n` ويُحدَّث عند أي تعديل.

## الأوامر (تُحدَّث بعد إنشاء مشروع Next.js في المرحلة 1)
```bash
npm install            # تثبيت الاعتماديات
npm run dev            # تشغيل محلي
npm run lint           # فحص الكود
npm run typecheck      # tsc --noEmit
npm run test           # اختبارات الوحدة (Vitest)
npm run test:e2e       # اختبارات E2E (Playwright)
npm run build          # بناء الإنتاج
supabase db reset      # إعادة بناء DB محلياً من migrations + seed
supabase migration new <name>   # migration جديد
```
اختبارات RLS: ملفات pgTAP في `supabase/tests/` (`supabase test db`).

## مراجع التوثيق
`docs/PRD.md` · `docs/architecture.md` · `docs/schema.md` · `docs/n8n-workflows.md` · `docs/ai-agent-prompt.md` · `docs/whatsapp-templates.md` · `docs/roadmap.md` · `docs/deployment.md` (يُنشأ في المرحلة 1)
