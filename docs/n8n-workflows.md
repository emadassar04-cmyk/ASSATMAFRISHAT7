# قائمة n8n Workflows

> **توثيق فقط — لم يُنشأ أي Workflow في n8n.** كل Workflow يُصدَّر لاحقاً إلى `/n8n/<id>.json` (بدون credentials).
> الدومين الثابت لـ n8n: `[N8N_BASE_URL]`. كل مسارات الـ Webhook تحت `/webhook/alassar/...`.

## 0. اتفاقيات عامة

### التوقيع بين الموقع وn8n
الموقع ← n8n، رؤوس إلزامية:
```
X-Alassar-Timestamp: 1730000000          # ثواني؛ يُرفض الطلب إن تجاوز فرقه 5 دقائق
X-Alassar-Signature: sha256=<hex>        # HMAC-SHA256( secret, timestamp + "." + rawBody )
X-Alassar-Idempotency-Key: <outbox_event_id>
```
أول عقدة في كل Workflow مستقبِل: **التحقق من التوقيع** (Code node) ← غير صالح يعيد 401 ولا يكمل. n8n ← الموقع بنفس الآلية بمفتاح مختلف.

### الظرف الموحّد للرسالة الواردة (Normalized Inbound)
```json
{
  "channel": "whatsapp | facebook | telegram | web",
  "external_thread_id": "string",
  "external_message_id": "string",
  "sender": { "external_id": "string", "name": "string|null", "phone": "+970...|null" },
  "text": "string|null",
  "attachments": [{ "type": "image|document|audio", "url": "string" }],
  "received_at": "ISO8601"
}
```

### ظرف الرد الصادر (Outbound Reply)
```json
{
  "conversation_id": "uuid",
  "channel": "whatsapp | facebook | telegram | web",
  "external_thread_id": "string",
  "sender": "bot | staff",
  "text": "string",
  "template": { "name": "string", "language": "ar", "params": ["..."] },
  "quick_replies": ["string"]
}
```

### قواعد مشتركة
- كل Workflow له **Error Workflow** = WF-13 (تنبيه + سجل).
- لا أسرار داخل الـ JSON المصدَّر؛ كل شيء عبر n8n Credentials.
- مفاتيح Supabase من نوع `service_role` تُحفظ كـ Credential فقط.
- منع التكرار: قبل أي معالجة `insert into processed_webhook_events(provider, external_id)` وتجاهل عند التعارض.

---

## WF-01a — استقبال ماسنجر (Messenger Inbound)
- **Trigger:** Webhook `GET/POST /webhook/alassar/facebook` (GET للتحقق بـ `hub.verify_token`).
- **الخطوات:** تحقق `X-Hub-Signature-256` ← إن `entry[].messaging[]` ← تجاهل الأصداء (`is_echo`) ← منع التكرار ← تطبيع إلى Normalized Inbound ← استدعاء **WF-02**.
- **الداخل (مختصر):** `{"object":"page","entry":[{"messaging":[{"sender":{"id":"PSID"},"message":{"mid":"m_x","text":"بكم الكنب؟"}}]}]}`
- **الخارج:** Normalized Inbound إلى WF-02؛ يرد `200` فوراً لميتا.

## WF-01b — استقبال واتساب (WhatsApp Inbound)
- **Trigger:** Webhook `GET/POST /webhook/alassar/whatsapp`.
- **الخطوات:** تحقق التوقيع ← فصل `statuses` (تحديث حالة التسليم في `messages.meta`) عن `messages` ← منع التكرار ← تنزيل الوسائط إن وُجدت ← تطبيع (`phone = wa_id`) ← WF-02.
- **الداخل:** `{"entry":[{"changes":[{"value":{"messages":[{"from":"9705xxxxxxx","id":"wamid.x","type":"text","text":{"body":"..."}}]}}]}]}`

## WF-01c — استقبال تلجرام (Telegram Inbound)
- **Trigger:** Telegram Webhook `POST /webhook/alassar/telegram` مع `secret_token`.
- **الخطوات:** تحقق `X-Telegram-Bot-Api-Secret-Token` ← تفريق: رسالة زبون (محادثة خاصة) / ضغطة زر `callback_query` من الإدارة (← WF-08) / رسالة المجموعة الداخلية (تُتجاهل أو أوامر) ← تطبيع ← WF-02.
- **ملاحظة:** مشاركة الرقم عبر زر "مشاركة جهة الاتصال" لربط الهوية بالجوال.

## WF-01d — شات الموقع (Web Chat Inbound)
- **Trigger:** Webhook موقّع `POST /webhook/alassar/web-chat` من `/api/chat` (بعد Rate Limiting).
- **الداخل:** `{"session_id":"uuid","customer_id":"uuid|null","text":"..."}` ← تطبيع ← WF-02.
- **الخارج:** الرد يُعاد **متزامناً** كـ JSON `{ "reply":"...", "handoff":false }` (أو عبر Supabase Realtime على `messages` للردود البشرية).

---

## WF-02 — قلب الـ AI Agent (Sub-workflow)
- **Trigger:** Execute Workflow (من WF-01a/b/c/d).
- **الخطوات:**
  1. `resolve_customer(channel, external_id, phone)` ← `customer_id`.
  2. upsert في `conversations`، وتحديث `last_customer_message_at`، وحفظ الرسالة في `messages` (inbound).
  3. **بوابة الحالة:** إن `status IN ('human','waiting')` ← لا رد من البوت؛ إن `human` ينبَّه الموظف (Telegram داخلي) ← انتهى. إن `closed` ← يُفتح من جديد كـ `bot`.
  4. فحص كلمات "موظف/إنسان/شخص" ← handoff مباشر (قبل الـ AI، لتجنب الاعتماد على النموذج).
  5. تحميل: `bot_messages`، ساعات الدوام الحالية، آخر 10 رسائل (ذاكرة محادثة).
  6. **AI Agent** (موجّه من `docs/ai-agent-prompt.md`) مع الأدوات (قراءة فقط ما عدا الأخيرتين):
     `search_products`, `get_product_details`, `get_branches_and_hours`, `get_payment_methods`, `get_policies`, `search_kb` (RAG), `get_order_status`, `create_order_draft`/`create_order`, `handoff_to_human`.
  7. حفظ رد البوت في `messages` ← WF-06 للإرسال.
  8. تحديث الإحصائيات: `conversations.handled_by_bot` يُشتق من عدم وجود handoff.
- **الخارج:** Outbound Reply إلى WF-06.
- **الأمان:** الأدوات تستعمل `service_role` لكن عبر دوال `bot_*` ضيقة؛ لا SQL حر. حد أقصى لعدد خطوات الـ Agent (مثلاً 6) وللتكلفة.

---

## WF-03 — إشعارات الإدارة (طلب جديد / إيصال)
- **Trigger:** Webhook موقّع `/webhook/alassar/events` من Outbox، `event_type ∈ {order.created, payment.receipt_uploaded, custom_order.created}`.
- **الخطوات:** جلب تفاصيل الطلب من Supabase ← صياغة رسالة عربية (رقم الطلب، الفرع، المنتجات، الإجمالي، طريقة الدفع، رابط اللوحة) ← إرسال لمجموعة تلجرام الداخلية (مع صورة الإيصال عبر Signed URL قصير العمر) ← رد `200`.
- **الداخل:** `{"event_type":"order.created","idempotency_key":"uuid","payload":{"order_id":"uuid"}}`
- **الخارج:** `{"ok":true}`.

## WF-04 — تحويل لموظف وإشعاره
- **Trigger:** Execute Workflow من WF-02 (أداة `handoff_to_human`) أو حدث `conversation.handoff`.
- **الخطوات:** فحص ساعات الدوام (`is_open_now(branch)`):
  - **داخل الدوام:** `status='human'` + `handoff_at` ← إشعار المجموعة الداخلية (القناة، الزبون، آخر رسالتين، رابط Inbox).
  - **خارج الدوام:** `status='waiting'` + `waiting_since=now()` ← رد البوت بنص `after_hours` مع `{{opening_time}}` ← لا إشعار فوري (يُجمَّع في WF-09).
- **الداخل:** `{"conversation_id":"uuid","reason":"customer_request|no_answer|complaint|custom_order"}`

## WF-05 — تعليقات فيسبوك (Comment → Reply + Private Reply)
- **Trigger:** Webhook `/webhook/alassar/facebook` (حقل `feed` / `changes[].value.item='comment'`) — يُفرَّع من WF-01a.
- **الخطوات:** تجاهل تعليقات الصفحة نفسها ← مطابقة كلمات ("السعر، بكم، خاص، كم، price") ← إن تطابق: (1) رد عام قصير على التعليق (`POST /{comment_id}/comments`: «أهلاً فيك 🌷 أرسلنا لك التفاصيل خاص») (2) **Private Reply** (`POST /{page}/messages` مع `recipient.comment_id`) بتفاصيل المنتج من AI/الأدوات (3) فتح محادثة في `conversations` على قناة facebook. غير مطابق ← تجاهل أو تحويل لموظف حسب الإعداد.
- **قيود:** Private Reply مرة واحدة لكل تعليق خلال 7 أيام.

## WF-06 — المُرسِل الموحّد (Unified Outbound Sender)
- **Trigger:** Execute Workflow (من WF-02/04/07/09) + Webhook موقّع `/webhook/alassar/staff-reply` (رد الموظف من Inbox عبر Outbox).
- **الخطوات:** Switch على `channel`:
  - **whatsapp:** إن `now - last_customer_message_at ≤ 24h` ← رسالة نصية عادية؛ وإلا ← **Template** معتمد (`docs/whatsapp-templates.md`) وإن لم يوجد Template مناسب يُسجَّل `failed` مع تنبيه.
  - **facebook:** Send API (`messaging_type=RESPONSE`، وللمتابعة بعد 24 ساعة `MESSAGE_TAG` المسموح فقط — [قرار معلّق]).
  - **telegram:** `sendMessage`.
  - **web:** كتابة في `messages` (يلتقطها العميل عبر Realtime).
- حفظ النتيجة (`external_id`، فشل/نجاح) في `messages.meta`، وإعادة المحاولة 3 مرات.
- **الداخل:** Outbound Reply. **الخارج:** `{"delivered":true,"external_message_id":"..."}`

## WF-07 — إشعار حالة الطلب للزبون
- **Trigger:** حدث `order.status_changed` أو `payment.reviewed`.
- **الخطوات:** جلب الطلب وقناة المصدر (`source_channel`) ورقم الزبون ← اختيار نص الحالة بالعربي ← WF-06 (واتساب خارج النافذة ← Template حسب الحالة).
- **الداخل:** `{"event_type":"order.status_changed","payload":{"order_id":"uuid","from":"awaiting_payment_confirmation","to":"confirmed"}}`

## WF-08 — النشر بالموافقة (Social Publishing)
- **Trigger:** حدث `post.requested` (تلقائي عند إضافة منتج/عرض أو بطلب المشرف) + `callback_query` من تلجرام.
- **الخطوات:**
  1. توليد النص + هاشتاغات بالـ AI من بيانات المنتج/العرض (بدون اختراع أسعار؛ الأسعار تُحقن من DB).
  2. `social_posts.status='pending_approval'`.
  3. إرسال للإداري على تلجرام: الصورة + النص + أزرار inline: ✅ `approve:<id>` / ✏️ `edit:<id>` / ❌ `reject:<id>`.
  4. **✅:** نشر على صفحة فيسبوك (`POST /{page}/photos` أو `/feed`) (+ قناة تلجرام إن `targets` تتضمنها) ← حفظ `fb_post_id/url` و`status='published'`.
  5. **✏️:** `status='editing'` ← يطلب النص الجديد ← الرد التالي من نفس الإداري يحدّث `body` ← يُعاد عرضه للموافقة (الحلقة 3).
  6. **❌:** `status='rejected'` (+ سبب اختياري).
  7. الفشل ← `status='failed'` + تنبيه.
- **التحقق:** فقط `callback_query.from.id ∈ admin_ids` (قائمة من الإعدادات).
- **الداخل:** `{"event_type":"post.requested","payload":{"post_id":"uuid"}}`

## WF-09 — ملخص المحادثات المنتظرة (بداية الدوام)
- **Trigger:** Schedule — كل 5 دقائق يفحص «هل بدأ دوام فرع للتو؟» (الأوقات من `branch_hours`، لا قيم ثابتة) أو Cron يوم عمل.
- **الخطوات:** جلب `conversations WHERE status='waiting' ORDER BY waiting_since ASC` ← صياغة ملخص مرتب من الأقدم (القناة، الزبون، منذ متى، آخر رسالة، رابط) ← إرسال لمجموعة تلجرام الداخلية ← تحديث `status='human'` للمحادثات المدرجة.
- **الخارج:** رسالة تلجرام واحدة (تُقسَّم إن طالت).

## WF-10 — إرسال OTP
- **Trigger:** حدث `auth.otp_requested` `{"phone":"+970...","channel":"whatsapp|telegram","code":"123456"}` (الرمز الواضح يمر مرة واحدة فقط عبر قناة موقّعة ولا يُسجَّل في logs؛ DB تحفظ الـ hash).
- **الخطوات:** واتساب ← Template فئة Authentication؛ تلجرام ← رسالة للمستخدم إن سبق وبدأ البوت (وإلا يُطلب منه فتح البوت أولاً).
- **ملاحظة:** نقطة ضعف معروفة: تلجرام لا يرسل لمن لم يبدأ البوت.

## WF-11 — تنبيهات التعديلات الحساسة (للمراقب والإدارة)
- **Trigger:** حدث `audit.sensitive` (تغيير سعر، حذف منتج، إلغاء طلب، تأكيد دفعة).
- **الخطوات:** جلب سجل التدقيق ← رسالة تلجرام فورية: من، الدور، الفرع، الكيان، القيمة القديمة ← الجديدة ← إرسال إلى مجموعة/محادثة المراقب `[AUDITOR_CHAT_ID]`.
- **الداخل:** `{"payload":{"audit_id":123}}`

## WF-12 — مزامنة كتالوج فيسبوك
- **Trigger:** حدث `product.changed` + Schedule ليلي.
- **الخطوات:** جلب المنتجات المرئية مع Variants الأساسية والصور ← بناء عناصر الكتالوج (name, price بالـ ILS, availability, image_url, url) ← `POST /{catalog_id}/items_batch` ← تسجيل الأخطاء.
- **قيد:** يتطلب إعداد كتالوج ومتجر في Meta Commerce Manager [قرار معلّق].

## WF-13 — معالج الأخطاء والـ Dead Letter
- **Trigger:** Error Trigger (لكل Workflows) + Schedule يومي لفحص `outbox_events.status='dead'`.
- **الخطوات:** تنبيه تلجرام للإداري (اسم الـ Workflow، العقدة، رسالة الخطأ دون بيانات حساسة)، وتسجيل.

## WF-14 — مزامنة قاعدة المعرفة (Embeddings)
- **Trigger:** حدث `kb.changed` (تعديل الأسئلة الشائعة/السياسات/الفروع) + يدوي.
- **الخطوات:** جلب المستند ← حساب embedding بمزوّد الـ AI ← `update kb_documents.embedding`.

## WF-15 — عمل الـ Outbox المعاكس (استدعاء الموقع)
- **Trigger:** n8n يحتاج كتابة تتجاوز الأدوات (مثلاً تحديث حالة منشور) ← `POST [SITE_URL]/api/hooks/n8n` موقّع بـ `N8N_INBOUND_HMAC_SECRET`.
- **الداخل/الخارج:** `{"action":"post.published","post_id":"uuid","fb_post_url":"..."}` ← `{"ok":true}`.

---

## خريطة الأحداث (Outbox → n8n)
| event_type | Workflow |
|---|---|
| order.created / payment.receipt_uploaded / custom_order.created | WF-03 |
| order.status_changed / payment.reviewed | WF-07 |
| staff.reply | WF-06 |
| conversation.handoff | WF-04 |
| post.requested | WF-08 |
| audit.sensitive | WF-11 |
| product.changed | WF-12 (+ WF-08 عند منتج جديد) |
| auth.otp_requested | WF-10 |
| kb.changed | WF-14 |

## بوابة n8n الموحّدة للأحداث
نقطة دخول واحدة `/webhook/alassar/events` تتحقق من التوقيع ثم تفرّق بـ `event_type` (Switch) إلى الـ Workflows أعلاه، ليبقى الموقع يعرف رابطاً واحداً فقط. الرد: `200 {"ok":true}` عند القبول، أي غير ذلك يُعتبر فشلاً ويُعاد الإرسال.
