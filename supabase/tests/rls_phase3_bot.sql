-- اختبارات المرحلة 3 (طبقة قاعدة البيانات): دوال البوت (service_role فقط)، المحادثات، التحويل، الدوام.
-- (النتيجة المسجّلة: 42/42 على مشروع التطوير.)
-- تُشغَّل داخل معاملة وتُلغى. يجب failed = 0.
-- التشغيل: psql أو Supabase MCP execute_sql (جلسة واحدة)، وليس SQL Editor في المتصفح.
-- ملاحظة: داخل معاملة واحدة تتساوى now() لكل الصفوف، لذا نضبط created_at يدوياً حيث يلزم الترتيب،
-- ونُغلق الدوام باستخدام إجازة اليوم (فرع null = كل الفروع) لاختبار «خارج الدوام» بصرف النظر عن وقت التشغيل.
begin;
create temp table _t (name text, ok boolean); grant all on _t to public;
create temp table _ctx (k text primary key, v text); grant all on _ctx to public;
create function pg_temp.chk(p_name text, p_ok boolean) returns void language plpgsql security definer as $$ begin insert into _t values (p_name, coalesce(p_ok,false)); end $$;
create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$ declare n bigint; begin execute p_sql; get diagnostics n = row_count; return n = 0; exception when others then return true; end $$;
create function pg_temp.err_is(p_sql text, p_like text) returns boolean language plpgsql as $$ begin execute p_sql; return false; exception when others then return sqlerrm like p_like; end $$;
create function pg_temp.c(p_k text) returns text language sql stable as $$ select v from _ctx where k = p_k $$;
create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true); execute 'set local role authenticated'; end $$;
grant execute on all functions in schema pg_temp to public;

insert into public.products (id, slug, name, description, base_price) values
 ('cccccccc-0000-0000-0000-0000000000b1','t-bot-p1','طقم اختبار بوت','وصف يحتوي كلمة زغبيّة_فريدة',100);

-- ===== الصلاحيات: الأدوار العادية لا تنفّذ دوال البوت =====
set local role anon;
select pg_temp.chk('anon لا ينفّذ bot_search_products', pg_temp.denied($$select public.bot_search_products('x')$$));
select pg_temp.chk('anon لا ينفّذ bot_create_order', pg_temp.denied($$select public.bot_create_order(gen_random_uuid(), 'web', '{}')$$));
reset role;
set local role authenticated;
select pg_temp.chk('authenticated لا ينفّذ bot_handoff', pg_temp.denied($$select public.bot_handoff(gen_random_uuid(), 'x')$$));
select pg_temp.chk('authenticated لا ينفّذ bot_resolve_customer', pg_temp.denied($$select public.bot_resolve_customer('telegram','x','0599123456')$$));
reset role;

-- ===== كل ما يلي بصلاحية service_role (كما يستعملها n8n) =====
set local role service_role;

-- هوية الزبون
insert into _ctx select 'c1', public.bot_resolve_customer('telegram', 'tg-t1', '0599123456', 'زبون اختبار')::text;
insert into _ctx select 'c1b', public.bot_resolve_customer('whatsapp', 'wa-t1', '+970599123456', null)::text;
select pg_temp.chk('الرقم نفسه عبر قناتين = زبون واحد', pg_temp.c('c1') = pg_temp.c('c1b'));
select pg_temp.chk('إعادة نفس المعرّف تعيد الزبون نفسه', public.bot_resolve_customer('telegram', 'tg-t1')::text = pg_temp.c('c1'));
insert into _ctx select 'cbad', public.bot_resolve_customer('telegram', 'tg-bad', '12ab')::text;
select pg_temp.chk('جوال غير صالح لا يُنشئ رقماً (phone = null)', (select phone is null from public.customers where id = pg_temp.c('cbad')::uuid));
select pg_temp.chk('معرّف خارجي فارغ مرفوض', pg_temp.err_is($$select public.bot_resolve_customer('telegram', '')$$, '%invalid_external_id%'));

-- المحادثات والرسائل
insert into _ctx select 'conv', (public.bot_upsert_conversation('telegram', 'th-t1', pg_temp.c('c1')::uuid) ->> 'id');
select pg_temp.chk('نفس الخيط = نفس المحادثة', (public.bot_upsert_conversation('telegram', 'th-t1') ->> 'id') = pg_temp.c('conv'));
select pg_temp.chk('خيط فارغ مرفوض', pg_temp.err_is($$select public.bot_upsert_conversation('telegram', '')$$, '%invalid_thread%'));
select pg_temp.chk('رسالة واردة أولى ليست مكررة', (public.bot_log_message(pg_temp.c('conv')::uuid, 'inbound', 'customer', 'مرحبا', 'm1') ->> 'duplicate')::boolean = false);
select pg_temp.chk('نفس external_id = مكررة', (public.bot_log_message(pg_temp.c('conv')::uuid, 'inbound', 'customer', 'مرحبا', 'm1') ->> 'duplicate')::boolean);
select public.bot_log_message(pg_temp.c('conv')::uuid, 'outbound', 'bot', 'أهلاً بك', 'm2');
select public.bot_log_message(pg_temp.c('conv')::uuid, 'inbound', 'customer', 'أريد كنبة', 'm3');
update public.messages set created_at = now() - interval '3 minutes' where conversation_id = pg_temp.c('conv')::uuid and external_id = 'm1';
update public.messages set created_at = now() - interval '2 minutes' where conversation_id = pg_temp.c('conv')::uuid and external_id = 'm2';
update public.messages set created_at = now() - interval '1 minutes' where conversation_id = pg_temp.c('conv')::uuid and external_id = 'm3';
select pg_temp.chk('الذاكرة: آخر الرسائل مرتبة من الأقدم', (select string_agg(e ->> 'body', '|' order by ord) from jsonb_array_elements(public.bot_history(pg_temp.c('conv')::uuid, 10)) with ordinality as t(e, ord)) = 'مرحبا|أهلاً بك|أريد كنبة');
select pg_temp.chk('الذاكرة تحترم الحد', jsonb_array_length(public.bot_history(pg_temp.c('conv')::uuid, 2)) = 2);
select pg_temp.chk('الرسالة الواردة تحدّث نافذة العميل', (select last_customer_message_at is not null from public.conversations where id = pg_temp.c('conv')::uuid));
select pg_temp.chk('محادثة غير موجودة مرفوضة', pg_temp.err_is($$select public.bot_log_message(gen_random_uuid(), 'inbound', 'customer', 'x')$$, '%conversation_not_found%'));

-- التحويل داخل الدوام (نغلق الإجازات القائمة اليوم أولاً بعدم إضافة أي إجازة؛ نفترض أن فرعاً مفتوحاً الآن عبر فرع اختبار)
insert into public.branches (id, slug, name, is_active) values ('eeeeeeee-0000-0000-0000-0000000000b1', 't-bot-br', 'فرع اختبار البوت', true);
insert into public.branch_hours (branch_id, weekday, opens_at, closes_at)
  select 'eeeeeeee-0000-0000-0000-0000000000b1', extract(dow from (now() at time zone 'Asia/Gaza'))::int, time '00:00', time '23:59:59';
insert into _ctx select 'conv2', (public.bot_upsert_conversation('telegram', 'th-t2', pg_temp.c('c1')::uuid) ->> 'id');
select pg_temp.chk('bot_open_status: مفتوح الآن', (public.bot_open_status() ->> 'open_now')::boolean);
select pg_temp.chk('تحويل داخل الدوام ← human ونص handoff_open', (select (j ->> 'status') = 'human' and (j ->> 'message_key') = 'handoff_open' and not (j ->> 'after_hours')::boolean from (select public.bot_handoff(pg_temp.c('conv2')::uuid, 'سبب') as j) x));
select pg_temp.chk('human: waiting_since فارغ', (select waiting_since is null and status = 'human' from public.conversations where id = pg_temp.c('conv2')::uuid));
select pg_temp.chk('التحويل المتكرر آمن (already)', (public.bot_handoff(pg_temp.c('conv2')::uuid, 'سبب') ->> 'already')::boolean);
select pg_temp.chk('التحويل يضيف حدث outbox', exists (select 1 from public.outbox_events where event_type = 'conversation.handoff' and payload ->> 'conversation_id' = pg_temp.c('conv2')));

-- التحويل خارج الدوام: إجازة اليوم لكل الفروع
insert into public.branch_holidays (branch_id, on_date, reason) values (null, (now() at time zone 'Asia/Gaza')::date, 'إجازة اختبار');
insert into _ctx select 'conv3', (public.bot_upsert_conversation('telegram', 'th-t3', pg_temp.c('c1')::uuid) ->> 'id');
select pg_temp.chk('bot_open_status: مغلق بسبب الإجازة', not (public.bot_open_status() ->> 'open_now')::boolean);
select pg_temp.chk('تحويل خارج الدوام ← waiting + نص after_hours', (select (j ->> 'status') = 'waiting' and (j ->> 'message_key') = 'handoff_after_hours' and (j ->> 'after_hours')::boolean from (select public.bot_handoff(pg_temp.c('conv3')::uuid, 'سبب') as j) x));
select pg_temp.chk('waiting: waiting_since محدد', (select waiting_since is not null and status = 'waiting' from public.conversations where id = pg_temp.c('conv3')::uuid));
select pg_temp.chk('نص after_hours يحتوي {{opening_time}} ويُستبدل', public.bot_message('handoff_after_hours') like '%{{opening_time}}%' and public.bot_message('handoff_after_hours', '{"opening_time":"09:00"}') like '%09:00%' and public.bot_message('handoff_after_hours', '{"opening_time":"09:00"}') not like '%{{%');
select pg_temp.chk('مفتاح نص غير موجود يعيد null', public.bot_message('no_such_key') is null);

-- إعادة الفتح: رسالة واردة على محادثة مغلقة تعيدها للبوت
update public.conversations set status = 'closed' where id = pg_temp.c('conv')::uuid;
insert into _ctx select 'reopen', (public.bot_log_message(pg_temp.c('conv')::uuid, 'inbound', 'customer', 'هل أحد هنا؟', 'm4') ->> 'status');
select pg_temp.chk('رسالة جديدة من الزبون تعيد فتح المحادثة المغلقة للبوت', pg_temp.c('reopen') = 'bot'
  and (select status = 'bot' from public.conversations where id = pg_temp.c('conv')::uuid));

-- أدوات القراءة
select pg_temp.chk('بحث بالاسم يجد المنتج', exists (select 1 from jsonb_array_elements(public.bot_search_products('طقم اختبار بوت')) e where e ->> 'slug' = 't-bot-p1'));
select pg_temp.chk('بحث بالوصف يجد المنتج', exists (select 1 from jsonb_array_elements(public.bot_search_products('زغبيّة_فريدة')) e where e ->> 'slug' = 't-bot-p1'));
select pg_temp.chk('البحث لا يكشف كميات المخزون', public.bot_search_products('طقم')::text not like '%"quantity"%');
select pg_temp.chk('بحث فارغ لا يعيد شيئاً', jsonb_array_length(public.bot_search_products('')) = 0);
update public.products set is_visible = false where slug = 't-bot-p1';
select pg_temp.chk('المنتج المخفي لا يظهر للبوت', jsonb_array_length(public.bot_search_products('زغبيّة_فريدة')) = 0 and public.bot_get_product('t-bot-p1') is null);
select pg_temp.chk('الفروع والدوام تُعاد', jsonb_array_length(public.bot_get_branches_and_hours()) >= 1);
select pg_temp.chk('طرق الدفع تتضمن «بالاتفاق»', exists (select 1 from jsonb_array_elements(public.bot_get_payment_methods()) e where e ->> 'code' = 'agreement'));
select pg_temp.chk('معلومات التوصيل تتضمن منطقة بالاتفاق', exists (select 1 from jsonb_array_elements(public.bot_delivery_info() -> 'zones') e where (e ->> 'fee_on_agreement')::boolean));
select pg_temp.chk('السياسات العامة فقط', not (public.bot_get_policies() ? 'locale'));

-- حالة الطلب: لا تُعاد إلا بمطابقة الجوال
insert into public.branches (id, slug, name) values ('eeeeeeee-0000-0000-0000-0000000000b2', 't-bot-br2', 'فرع 2');
insert into public.product_variants (id, product_id, price) values ('dddddddd-0000-0000-0000-0000000000b1', 'cccccccc-0000-0000-0000-0000000000b1', 100);
update public.products set is_visible = true where slug = 't-bot-p1';
insert into public.branch_stock (variant_id, branch_id, quantity) values ('dddddddd-0000-0000-0000-0000000000b1', 'eeeeeeee-0000-0000-0000-0000000000b2', 10);
insert into public.settings (key, value, is_public) values ('policy.exchange', '{"title":"t","body":"t"}', true) on conflict (key) do nothing;
insert into _ctx select 'ord', (public.bot_create_order(pg_temp.c('c1')::uuid, 'telegram', jsonb_build_object('branch_id', 'eeeeeeee-0000-0000-0000-0000000000b2', 'fulfillment', 'pickup',
  'contact_phone', '0599123456', 'exchange_policy_accepted', true,
  'items', jsonb_build_array(jsonb_build_object('variant_id', 'dddddddd-0000-0000-0000-0000000000b1', 'quantity', 2)))) ->> 'order_number');
select pg_temp.chk('bot_create_order: يُنشأ بحساب الخادم (200)', (select total = 200 and source_channel = 'telegram' from public.orders where order_number = pg_temp.c('ord')));
select pg_temp.chk('حالة الطلب بجوال مطابق', (public.bot_get_order_status(pg_temp.c('ord'), '0599123456') ->> 'order_number') = pg_temp.c('ord'));
select pg_temp.chk('حالة الطلب بجوال مختلف = null', public.bot_get_order_status(pg_temp.c('ord'), '0591111111') is null);
select pg_temp.chk('حالة الطلب بلا جوال = null', public.bot_get_order_status(pg_temp.c('ord'), null) is null);
select pg_temp.chk('bot_create_order: زبون غير موجود مرفوض', pg_temp.err_is($$select public.bot_create_order(gen_random_uuid(), 'web', '{}')$$, '%customer_not_found%'));
reset role;

select pg_temp.chk('لا تسريب: RLS على conversations و messages مفعّلة', (select count(*) = 2 from pg_class where relname in ('conversations','messages') and relnamespace = 'public'::regnamespace and relrowsecurity and relforcerowsecurity));

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, coalesce(string_agg(name,' | ') filter (where not ok),'-') as failures from _t;
rollback;
