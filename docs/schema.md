# مسودة قاعدة البيانات (Schema Draft)

> **مسودة للمراجعة فقط — لا Migration مُنفَّذ.** عند الموافقة تُحوَّل إلى ملفات في `supabase/migrations` بالترتيب المذكور في القسم 9.
> المنطقة الزمنية للتخزين UTC، والعرض `Asia/Gaza`. العملة ILS. المعرّفات `uuid` (`gen_random_uuid()`) ما لم يُذكر غير ذلك.

## 1. المبادئ
- **Single-Tenant**: لا `store_id` في الجداول.
- **RLS مفعّل على كل جدول** (`ENABLE` + `FORCE`). الافتراضي: منع كل شيء، ثم سياسات صريحة لكل دور.
- الدور واحد لكل مستخدم في `profiles.role`، ويُقرأ عبر دالة `public.app_role()` (security definer، `stable`) تُستدعى كـ `(select public.app_role())` لتحسين الأداء.
- **Admin/Auditor يتطلبان MFA**: دالة `public.is_aal2()` تفحص `auth.jwt()->>'aal' = 'aal2'`، وتُدمج في سياسات الدورين.
- كل جدول قابل للتعديل من الموظفين عليه trigger `audit_row_change()` (القسم 6).
- الخدمات الخلفية (n8n + Route Handlers) تستخدم `service_role` الذي يتجاوز RLS؛ لذلك القيود الحرجة (Append-Only وغيرها) تُفرض بـ **triggers** لا بالسياسات فقط.

## 2. Enums
```sql
create type app_role         as enum ('customer','moderator','admin','auditor');
create type channel_type     as enum ('web','facebook','whatsapp','telegram');
create type availability     as enum ('available','limited','out_of_stock','made_to_order');
create type order_status     as enum ('new','awaiting_payment_confirmation','confirmed','in_preparation','ready_for_pickup','picked_up','cancelled');
create type payment_status   as enum ('pending','confirmed','rejected');
create type fulfillment_type as enum ('pickup','delivery');           -- delivery غير مفعّل الآن
create type conv_status      as enum ('bot','human','waiting','closed');
create type msg_direction    as enum ('inbound','outbound');
create type msg_sender       as enum ('customer','bot','staff','system');
create type post_status      as enum ('draft','pending_approval','editing','approved','published','rejected','failed');
create type outbox_status    as enum ('pending','sent','failed','dead');
create type custom_status    as enum ('new','quoted','deposit_pending','in_progress','ready','delivered','cancelled');
```

## 3. الجداول

### 3.1 الهوية والمستخدمون
```sql
-- ملف المستخدم المسجّل (موظف أو زبون بحساب). id = auth.users.id
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  phone       text unique not null,              -- E.164 (+970/+972...) هو مفتاح الهوية الموحدة
  full_name   text,
  role        app_role not null default 'customer',
  branch_id   uuid references branches(id),      -- فرع الموظف (اختياري، للتقارير والتدقيق)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- الزبون الموحّد عبر القنوات (قد لا يملك حساباً)
create table customers (
  id          uuid primary key default gen_random_uuid(),
  phone       text unique,                       -- قد يكون null مؤقتاً لزبون قناة لم يعطِ رقمه
  full_name   text,
  profile_id  uuid unique references profiles(id),
  notes       text,                              -- ملاحظات الموظف
  created_at  timestamptz not null default now()
);

-- ربط معرّفات القنوات بالزبون (PSID فيسبوك، wa_id، chat_id تلجرام)
create table customer_identities (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  channel      channel_type not null,
  external_id  text not null,
  display_name text,
  created_at   timestamptz not null default now(),
  unique (channel, external_id)
);

-- رموز OTP (تُرسل عبر واتساب/تلجرام عبر n8n، تُخزَّن مُجزّأة)
create table otp_requests (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  channel     channel_type not null check (channel in ('whatsapp','telegram')),
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on otp_requests (phone, created_at desc);
```

### 3.2 الإعدادات والفروع (لا بيانات متجر في الكود)
```sql
-- إعدادات المتجر key/value: store.name, store.logo, theme.tokens, policy.exchange, policy.custom_orders,
-- policy.privacy, policy.terms, policy.data_deletion, deposit.enabled, deposit.percent, contact.*, social.* ...
create table settings (
  key         text primary key,
  value       jsonb not null,
  is_public   boolean not null default false,     -- true = يقرؤه الموقع العام (الاسم، الثيم، السياسات...)
  updated_by  uuid references profiles(id),
  updated_at  timestamptz not null default now()
);

-- نصوص البوت القابلة للتعديل (ترحيب، خارج الدوام، تحويل لموظف، سياسة الاستبدال...)
create table bot_messages (
  key         text primary key,                   -- مثل: greeting, after_hours, handoff, exchange_policy
  body        text not null,                      -- يدعم متغيرات {{opening_time}} {{branches}}
  updated_by  uuid references profiles(id),
  updated_at  timestamptz not null default now()
);

create table branches (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  address     text,
  phone       text,
  whatsapp    text,
  map_url     text,
  lat         numeric(9,6), lng numeric(9,6),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ساعات الدوام الأسبوعية (صف لكل فترة؛ يسمح بفترتين في اليوم)
create table branch_hours (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branches(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),   -- 0 = الأحد
  opens_at    time not null,
  closes_at   time not null
);

-- العطل والإغلاقات الاستثنائية
create table branch_holidays (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid references branches(id) on delete cascade,      -- null = كل الفروع
  on_date     date not null,
  reason      text
);

-- طرق الدفع وبياناتها (من الإعدادات): بنك فلسطين، PalPay، جوال باي
create table payment_methods (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  instructions text,                               -- نص تعليمات التحويل
  details     jsonb not null default '{}',         -- مثل {"account":"[رقم الحساب]","holder":"[اسم صاحب الحساب]"}
  is_active   boolean not null default true,
  sort_order  int not null default 0
);

-- جاهز للتوصيل لاحقاً (فارغ ومعطّل الآن)
create table delivery_zones (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  fee         numeric(10,2) not null default 0,
  is_active   boolean not null default false
);
```

### 3.3 الكتالوج
```sql
create table categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references categories(id) on delete restrict,
  slug        text unique not null,                -- يدعم العربية
  name        text not null,
  description text,
  image_path  text,
  icon        text,
  is_visible  boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index on categories (parent_id, sort_order);

create table products (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid references categories(id),
  slug          text unique not null,
  name          text not null,
  description   text,
  base_price    numeric(12,2) not null check (base_price >= 0),   -- السعر عند غياب Variant
  is_visible    boolean not null default true,
  is_featured   boolean not null default false,
  is_custom_orderable boolean not null default false,
  view_count    bigint not null default 0,                         -- تجميع يومي من product_views
  search        tsvector generated always as (to_tsvector('simple', coalesce(name,'')||' '||coalesce(description,''))) stored,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on products (category_id) where is_visible;
create index on products using gin (search);
create index on products using gin (name gin_trgm_ops);          -- بحث تقريبي (pg_trgm)

create table product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  path        text not null,                       -- مسار في Bucket product-images
  variants    jsonb not null default '{}',         -- مقاسات/WebP مولّدة لاحقاً (المرحلة 4)
  alt         text,
  sort_order  int not null default 0
);

-- أنواع الخصائص الديناميكية: لون، خامة، مقاس ... (يضيفها المشرف)
create table option_types (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  sort_order  int not null default 0
);
create table option_values (
  id          uuid primary key default gen_random_uuid(),
  type_id     uuid not null references option_types(id) on delete cascade,
  value       text not null,
  swatch      text,                                -- كود لون أو صورة خامة (اختياري)
  sort_order  int not null default 0,
  unique (type_id, value)
);

-- النسخة القابلة للبيع (Variant): سعر وتوفر خاص
create table product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  sku         text unique,
  price       numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2),
  is_active   boolean not null default true,
  sort_order  int not null default 0
);
create table variant_options (
  variant_id  uuid references product_variants(id) on delete cascade,
  value_id    uuid references option_values(id) on delete restrict,
  primary key (variant_id, value_id)
);

-- مخزون كل فرع لكل Variant
create table branch_stock (
  variant_id  uuid references product_variants(id) on delete cascade,
  branch_id   uuid references branches(id) on delete cascade,
  quantity    int not null default 0 check (quantity >= 0),
  low_threshold int not null default 2,
  status      availability not null default 'available',   -- يُحسب تلقائياً من الكمية ما لم يُحدَّد made_to_order
  updated_at  timestamptz not null default now(),
  primary key (variant_id, branch_id)
);
create index on branch_stock (branch_id, status);

create table offers (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  image_path  text,
  discount_type text check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2),
  starts_at   timestamptz, ends_at timestamptz,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now()
);
create table offer_products (
  offer_id uuid references offers(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  primary key (offer_id, product_id)
);

create table favorites (
  customer_id uuid references customers(id) on delete cascade,
  product_id  uuid references products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, product_id)
);

create table product_views (                       -- تجميع يومي خفيف للأكثر مشاهدة
  product_id uuid references products(id) on delete cascade,
  day date, views int not null default 0,
  primary key (product_id, day)
);
```

### 3.4 الطلبات والدفع
```sql
create sequence order_number_seq start 1001;

create table orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text unique not null default ('ME-' || nextval('order_number_seq')),
  customer_id     uuid not null references customers(id),
  branch_id       uuid not null references branches(id),          -- فرع الاستلام
  source_channel  channel_type not null,                           -- مصدر الطلب (وقناة الإشعار)
  fulfillment     fulfillment_type not null default 'pickup',
  delivery_zone_id uuid references delivery_zones(id),             -- للمستقبل
  delivery_fee    numeric(10,2) not null default 0,
  status          order_status not null default 'new',
  payment_method_id uuid references payment_methods(id),
  subtotal        numeric(12,2) not null,
  total           numeric(12,2) not null,
  customer_note   text,
  exchange_policy_accepted_at timestamptz not null,                -- موافقة Checkbox إلزامية
  exchange_policy_version     text not null,                       -- نسخة نص السياسة وقت الموافقة
  cancelled_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on orders (customer_id, created_at desc);
create index on orders (branch_id, status, created_at desc);

create table order_items (                          -- لقطة (Snapshot) وقت الطلب
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  variant_id  uuid references product_variants(id) on delete set null,
  product_name text not null,
  options_text text,                               -- "بيج / قطن / 3 مقاعد"
  unit_price  numeric(12,2) not null,
  quantity    int not null check (quantity > 0),
  line_total  numeric(12,2) not null
);

create table order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references orders(id) on delete cascade,
  from_status order_status, to_status order_status not null,
  changed_by  uuid references profiles(id),         -- null = النظام/البوت
  note        text,
  created_at  timestamptz not null default now()
);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references orders(id) on delete cascade,
  custom_order_id uuid references custom_orders(id) on delete cascade,
  method_id   uuid not null references payment_methods(id),
  amount      numeric(12,2) not null,
  is_deposit  boolean not null default false,
  receipt_path text,                                -- Bucket خاص receipts
  status      payment_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(order_id, custom_order_id) = 1)
);
create index on payments (status, created_at);

create table custom_orders (                        -- طلبات التفصيل
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  branch_id   uuid references branches(id),
  source_channel channel_type not null,
  description text not null,
  dimensions  text, material text, color text,
  reference_image_paths text[] not null default '{}',   -- Bucket خاص custom-refs
  quoted_price numeric(12,2),
  deposit_percent numeric(5,2),                          -- من الإعدادات وقت الإنشاء
  status      custom_status not null default 'new',
  policy_accepted_at timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

### 3.5 المحادثات والبوت
```sql
create table conversations (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customers(id),
  channel       channel_type not null,
  external_thread_id text not null,                 -- chat_id / wa_id / PSID / session id
  status        conv_status not null default 'bot',
  assigned_to   uuid references profiles(id),
  handoff_reason text,
  waiting_since timestamptz,                        -- طلب موظف خارج الدوام
  first_staff_response_at timestamptz,              -- لحساب متوسط وقت الرد
  handoff_at    timestamptz,
  last_customer_message_at timestamptz,             -- لنافذة واتساب 24 ساعة
  last_message_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (channel, external_thread_id)
);
create index on conversations (status, last_message_at desc);
create index on conversations (customer_id);

create table messages (
  id          uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction   msg_direction not null,
  sender      msg_sender not null,
  sender_profile_id uuid references profiles(id),
  body        text,
  attachments jsonb not null default '[]',
  external_id text,                                  -- معرّف الرسالة لدى المنصة (منع التكرار)
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  unique (conversation_id, external_id)
);
create index on messages (conversation_id, created_at);

-- قاعدة المعرفة (FAQ/سياسات) للـ RAG — pgvector
create table kb_documents (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('faq','policy','info')),
  title       text not null,
  content     text not null,
  embedding   vector(1536),                          -- البعد يتبع مزود الـ AI المختار
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);
create index on kb_documents using hnsw (embedding vector_cosine_ops);
```

### 3.6 المنشورات
```sql
create table social_posts (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid references products(id) on delete set null,
  offer_id    uuid references offers(id) on delete set null,
  body        text not null,                         -- النص المولّد/المعدّل
  hashtags    text[] not null default '{}',
  image_paths text[] not null default '{}',
  targets     text[] not null default '{facebook}',  -- facebook, telegram_channel
  status      post_status not null default 'draft',
  requested_by uuid references profiles(id),
  approved_by  uuid references profiles(id),
  telegram_approval_msg_id text,
  fb_post_id  text, fb_post_url text, tg_message_id text,
  reject_reason text, error text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

### 3.7 الموثوقية والأمان
```sql
-- Outbox: يضمن عدم ضياع أي حدث إذا توقف n8n
create table outbox_events (
  id              uuid primary key default gen_random_uuid(),
  event_type      text not null,                     -- order.created, payment.receipt_uploaded, order.status_changed, staff.reply, post.requested, audit.sensitive ...
  payload         jsonb not null,
  idempotency_key text unique not null,
  status          outbox_status not null default 'pending',
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index on outbox_events (status, next_attempt_at) where status in ('pending','failed');

-- منع معالجة Webhook مرتين
create table processed_webhook_events (
  provider    text, external_id text,
  received_at timestamptz not null default now(),
  primary key (provider, external_id)
);

create table rate_limit_hits (
  key text, hit_at timestamptz not null default now()
);
create index on rate_limit_hits (key, hit_at desc);

-- سجل التعديلات — Append-Only
create table audit_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,                                 -- لا FK: يبقى السجل حتى لو حُذف المستخدم
  actor_name   text, actor_role app_role,
  branch_id    uuid,
  entity_type  text not null,                        -- product, category, price, order, payment, setting, user ...
  entity_id    text,
  action       text not null,                        -- insert | update | delete | status_change | price_change ...
  old_values   jsonb, new_values jsonb,
  is_sensitive boolean not null default false,       -- تغيير سعر، حذف منتج، إلغاء طلب، تأكيد دفعة
  source       text not null default 'dashboard'     -- dashboard | bot | system | import
);
create index on audit_log (occurred_at desc);
create index on audit_log (actor_id, occurred_at desc);
create index on audit_log (entity_type, occurred_at desc);
create index on audit_log (branch_id, occurred_at desc);
create index on audit_log (is_sensitive, occurred_at desc) where is_sensitive;
```

## 4. الدوال والـ Triggers المهمة
| الاسم | الوظيفة |
|---|---|
| `app_role()` / `is_staff()` / `is_aal2()` | مساعدات للسياسات |
| `handle_new_user()` | ينشئ `profiles` + يربط/ينشئ `customers` عند أول دخول |
| `set_updated_at()` | يحدّث `updated_at` |
| `audit_row_change()` | trigger عام AFTER INSERT/UPDATE/DELETE على الجداول الحساسة؛ يكتب في `audit_log` بالقيم القديمة والجديدة، ويضع `is_sensitive` (تغيير `price`/`base_price` في products/variants، حذف product، `orders.status → cancelled`، `payments.status → confirmed`) ويُنشئ `outbox_events('audit.sensitive')` |
| `audit_log_immutable()` | BEFORE UPDATE/DELETE/TRUNCATE ← `RAISE EXCEPTION`، مع `REVOKE UPDATE, DELETE, TRUNCATE` من كل الأدوار (تشمل service_role) |
| `create_order(payload jsonb)` | RPC معتمدة: تتحقق من السعر والمخزون والفرع والموافقة على السياسة، وتكتب الطلب + البنود + السجل + Outbox بمعاملة واحدة |
| `set_order_status(order_id, to, note)` | تغيير حالة بمخطط انتقالات مسموح، ويكتب `order_status_history` + Outbox |
| `review_payment(payment_id, decision, reason)` | Admin فقط؛ تؤكد/ترفض وتحدّث حالة الطلب |
| `compute_stock_status()` | trigger على `branch_stock`: يحدّد available/limited/out_of_stock من الكمية والعتبة |
| `resolve_customer(channel, external_id, phone)` | يدمج الهويات بالرقم ويعيد `customer_id` |
| `check_rate_limit(key, limit, window)` | Rate limiting |
| `search_products(q, category, branch, min, max, avail)` | بحث/فلترة للواجهة والبوت |
| `bot_*` (قراءة فقط) | دوال تستعملها أدوات الـ Agent: منتجات، أسعار، توفر الفروع، ساعات الدوام، حالة طلب |

## 5. التخزين (Storage Buckets)
| Bucket | عام؟ | الرفع | القراءة | قيود |
|---|---|---|---|---|
| `branding` | نعم | Admin | الجميع | صور فقط |
| `category-images` | نعم | Moderator/Admin | الجميع | صور فقط |
| `product-images` | نعم | Moderator/Admin | الجميع | صور فقط، مسار موحّد `products/{product_id}/{uuid}.ext` (نقطة تمديد WebP لاحقاً) |
| `receipts` | **لا** | الزبون صاحب الطلب عبر Signed Upload URL من الخادم | **Admin فقط** (+ service_role) | `image/jpeg,png,webp` و`application/pdf`، حد 5MB |
| `custom-refs` | **لا** | الزبون (مجلده فقط `customers/{customer_id}/`) | الزبون صاحب الطلب + Moderator/Admin | صور، 5MB |

## 6. مصفوفة RLS حسب الدور
الرموز: **R** قراءة، **C** إنشاء، **U** تعديل، **D** حذف، **own** صفوف الزبون نفسه فقط، **—** لا وصول.
`anon` = زائر غير مسجل. Admin وAuditor مشروطان بـ `is_aal2()`.

| الجدول | anon | Customer | Moderator | Admin | Auditor |
|---|---|---|---|---|---|
| profiles | — | R/U own (بدون تغيير `role`) | R (الأسماء فقط عبر view) | R/C/U/D | R عبر view (اسم/دور) |
| customers / customer_identities | — | R own | R/U | R/C/U | — |
| otp_requests | — | — | — | — | — (service_role فقط) |
| settings | R حيث `is_public` | R حيث `is_public` | R حيث `is_public` | R/C/U/D | — |
| bot_messages | — | — | — | R/C/U | — |
| branches, branch_hours, branch_holidays | R (النشطة) | R | R | R/C/U/D | — |
| payment_methods | R (النشطة، بدون `details` الحساسة حتى تُختار عبر RPC) | R نفسه | — | R/C/U/D | — |
| delivery_zones | — | — | — | R/C/U/D | — |
| categories, products, product_images, offers, offer_products | R (`is_visible`) | R (`is_visible`) | R/C/U/D | R/C/U/D | — |
| option_types, option_values, product_variants, variant_options | R (النشطة) | R | R/C/U/D | R/C/U/D | — |
| branch_stock | R (الحالة والكمية المبسّطة عبر view) | R | R/C/U | R/C/U/D | — |
| favorites | — | R/C/D own | — | — | — |
| product_views | C عبر RPC | C عبر RPC | — | R | — |
| orders, order_items | — | R own (الإنشاء عبر `create_order()` فقط) | **—** | R/U (عبر RPC) | — |
| order_status_history | — | R own | — | R | — |
| payments | — | R own (بدون `reject_reason` الداخلي إن لزم) | — | R/U (عبر `review_payment`) | — |
| custom_orders | — | R/C own | R/U | R/U | — |
| conversations, messages | — | — | R/U (الإجابة والتحويل والإعادة للبوت) | R/U | — |
| kb_documents | — | — | R/C/U | R/C/U/D | — |
| social_posts | — | — | R/C (مسودة وإرسال للموافقة)، U لمسوداته فقط | R/C/U (موافقة/تعديل/رفض) | — |
| outbox_events | — | — | — | R (المتعثرة فقط) | — |
| processed_webhook_events, rate_limit_hits | — | — | — | — | — (service_role فقط) |
| **audit_log** | — | — | **—** | **R** | **R** (فلترة كاملة) |
| إحصائيات مالية (views/RPC) | — | — | **—** | R | — |

ملاحظات حاسمة:
1. **audit_log:** لا سياسة INSERT/UPDATE/DELETE لأي دور؛ الكتابة من triggers `security definer` فقط، والـ immutability trigger يمنع التعديل/الحذف حتى من الإداري وservice_role.
2. **المشرف لا يرى** الطلبات والدفعات والإحصائيات المالية والإعدادات وسجل التعديلات (حسب الـ PRD). *يحتاج تأكيداً*: هل يحتاج المشرف رؤية الطلبات؟ (سؤال 6).
3. **Auditor** قراءة فقط: لا يملك INSERT/UPDATE/DELETE على أي جدول، ويرى `audit_log` عبر view تضم اسم الفاعل والفرع.
4. **الزبون لا يكتب مباشرة** في orders/payments؛ كل الكتابة عبر RPC تتحقق من الأسعار والملكية (يمنع التلاعب بالسعر من المتصفح).
5. **سياسة التخزين `receipts`:** INSERT للزبون صاحب الطلب (التحقق عبر المسار `orders/{order_id}/...` + ملكية الطلب)، و**لا SELECT** له؛ SELECT للإداري فقط.
6. تُكتب اختبارات pgTAP تؤكد: لكل (دور × جدول × عملية) النتيجة المتوقعة في الجدول أعلاه.

نمط السياسة (مثال):
```sql
alter table products enable row level security; alter table products force row level security;
create policy products_public_read on products for select to anon, authenticated
  using (is_visible);
create policy products_staff_all on products for all to authenticated
  using ((select app_role()) in ('moderator','admin'))
  with check ((select app_role()) in ('moderator','admin'));
create policy audit_read on audit_log for select to authenticated
  using ((select app_role()) in ('admin','auditor') and (select is_aal2()));
```

## 7. Seed (تجريبي فقط — placeholders)
- أقسام: كنب، غرف نوم، سفرة، ستائر، تنجيد.
- فرعان: دير البلح، النصيرات (العنوان/الهاتف/الدوام `[...]`).
- طرق الدفع: بنك فلسطين، PalPay، جوال باي (`[رقم الحساب]`، `[اسم صاحب الحساب]`).
- `settings`: اسم المتجر، ألوان افتراضية (بيج/بني/ذهبي)، نصوص السياسات `[نص سياسة الاستبدال]`، `deposit.enabled=false`, `deposit.percent=[نسبة العربون]`.
- `bot_messages`: النصوص الافتراضية من `docs/ai-agent-prompt.md`.

## 8. ما يدعمه التصميم مستقبلاً دون إعادة بناء
| الميزة | كيف |
|---|---|
| التوصيل | `orders.fulfillment`, `delivery_zone_id`, `delivery_fee` + `delivery_zones` موجودة |
| فرع جديد | صف في `branches` + `branch_hours`؛ لا شيء في الكود |
| ضغط WebP + لوجو | `product_images.variants` + مسار رفع موحّد |
| قناة جديدة | قيمة جديدة في `channel_type` + `customer_identities` |

## 9. ترتيب الـ Migrations المقترح
1. `0001_extensions_enums` (pgcrypto, pg_trgm, vector) · 2. `0002_identity_settings_branches` · 3. `0003_catalog` · 4. `0004_orders_payments` · 5. `0005_conversations_kb_posts` · 6. `0006_outbox_security` · 7. `0007_audit_log_and_triggers` · 8. `0008_functions_rpc` · 9. `0009_rls_policies` · 10. `0010_storage_buckets_policies` · 11. `0011_seed_dev` · 12. `tests/rls_*.sql`

> ملاحظة: تُنفَّذ المرحلة 1 migrations (1-3 + 9-11 للجداول المعنية)، والمرحلة 2 (4، 6-7)، والمرحلة 3 (5) — حسب `docs/roadmap.md`. أو دفعة واحدة إن فضّلت (سؤال في تقرير المرحلة 0).
