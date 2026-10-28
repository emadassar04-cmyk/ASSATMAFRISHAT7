-- اختبارات المرحلة 2: الطلبات والدفع والتوصيل والتدقيق والـ Outbox.
-- تُشغَّل داخل معاملة وتُلغى (rollback) فلا تترك أثراً. الناتج: passed / failed / أسماء الفاشل (يجب failed = 0).
begin;

create temp table _t (name text, ok boolean);   grant all on _t to public;
create temp table _ctx (k text primary key, v text); grant all on _ctx to public;

create function pg_temp.chk(p_name text, p_ok boolean) returns void
language plpgsql security definer as $$ begin insert into _t values (p_name, coalesce(p_ok, false)); end $$;
-- true إذا فشل الأمر أو لم يؤثر على أي صف
create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$
declare n bigint; begin execute p_sql; get diagnostics n = row_count; return n = 0; exception when others then return true; end $$;
-- true إذا فشل الأمر برسالة تطابق النمط
create function pg_temp.err_is(p_sql text, p_like text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlerrm like p_like; end $$;
create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.act_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{}', true); perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;
create function pg_temp.c(p_k text) returns uuid language sql stable as $$ select v::uuid from _ctx where k = p_k $$;
-- حمولة طلب قياسية مع إمكانية تعديل حقول
create function pg_temp.payload(p_extra jsonb default '{}') returns jsonb language sql stable as $$
  select (jsonb_build_object(
    'branch_id', pg_temp.c('br'), 'fulfillment', 'pickup', 'contact_phone', '0599123456',
    'payment_method_id', pg_temp.c('pm1'), 'exchange_policy_accepted', true,
    'items', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.c('v1'), 'quantity', 2)))) || p_extra $$;
grant execute on all functions in schema pg_temp to public;

-- ===== بيانات الاختبار (كـ postgres) =====
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','authenticated','authenticated','t-custa@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','authenticated','authenticated','t-custb@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','authenticated','authenticated','t-mod@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000004','authenticated','authenticated','t-admin@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000005','authenticated','authenticated','t-aud@x.local','{}');
update public.profiles set role='moderator' where id='aaaaaaaa-0000-0000-0000-000000000003';
update public.profiles set role='admin'     where id='aaaaaaaa-0000-0000-0000-000000000004';
update public.profiles set role='auditor'   where id='aaaaaaaa-0000-0000-0000-000000000005';

insert into public.branches (id, slug, name, is_active) values
 ('eeeeeeee-0000-0000-0000-000000000001','t-branch','فرع اختبار',true),
 ('eeeeeeee-0000-0000-0000-000000000002','t-branch-off','فرع موقوف',false);
insert into public.products (id, slug, name, base_price, is_visible) values
 ('cccccccc-0000-0000-0000-000000000001','t-p1','منتج اختبار',100,true),
 ('cccccccc-0000-0000-0000-000000000002','t-p-hidden','منتج مخفي',100,false);
insert into public.option_types (id, name) values ('99999999-0000-0000-0000-000000000001','t-opt-type');
insert into public.option_values (id, type_id, value) values ('99999999-0000-0000-0000-000000000002','99999999-0000-0000-0000-000000000001','t-opt-val');
insert into public.product_variants (id, product_id, price, is_active) values
 ('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',100,true),   -- v1: مخزون 5
 ('dddddddd-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001',250,true),   -- v2: حسب الطلب
 ('dddddddd-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000001',10,true),    -- v3: نفد
 ('dddddddd-0000-0000-0000-000000000004','cccccccc-0000-0000-0000-000000000002',100,true),   -- vh: منتج مخفي
 ('dddddddd-0000-0000-0000-000000000005','cccccccc-0000-0000-0000-000000000001',100,false);  -- vi: خيار غير نشط
insert into public.variant_options (variant_id, value_id) values ('dddddddd-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000002');
insert into public.branch_stock (variant_id, branch_id, quantity, low_threshold, status) values
 ('dddddddd-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001',5,2,'available'),
 ('dddddddd-0000-0000-0000-000000000002','eeeeeeee-0000-0000-0000-000000000001',0,2,'made_to_order'),
 ('dddddddd-0000-0000-0000-000000000003','eeeeeeee-0000-0000-0000-000000000001',0,2,'available'),
 ('dddddddd-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000001',5,2,'available'),
 ('dddddddd-0000-0000-0000-000000000005','eeeeeeee-0000-0000-0000-000000000001',5,2,'available');
insert into public.delivery_zones (id, name, fee, is_active) values
 ('77777777-0000-0000-0000-000000000001','منطقة اختبار',15,true),
 ('77777777-0000-0000-0000-000000000002','منطقة موقوفة',5,false);
insert into public.payment_methods (id, code, name, is_active) values
 ('88888888-0000-0000-0000-000000000001','t-pm1','طريقة اختبار',true),
 ('88888888-0000-0000-0000-000000000002','t-pm2','طريقة موقوفة',false);
insert into _ctx values ('br','eeeeeeee-0000-0000-0000-000000000001'), ('br_off','eeeeeeee-0000-0000-0000-000000000002'),
  ('v1','dddddddd-0000-0000-0000-000000000001'), ('v2','dddddddd-0000-0000-0000-000000000002'), ('v3','dddddddd-0000-0000-0000-000000000003'),
  ('vh','dddddddd-0000-0000-0000-000000000004'), ('vi','dddddddd-0000-0000-0000-000000000005'),
  ('z1','77777777-0000-0000-0000-000000000001'), ('z2','77777777-0000-0000-0000-000000000002'),
  ('pm1','88888888-0000-0000-0000-000000000001'), ('pm2','88888888-0000-0000-0000-000000000002');
insert into public.settings (key, value, is_public) values ('policy.exchange', '{"title":"t","body":"t"}', true)
  on conflict (key) do nothing;

-- ===== anon =====
select pg_temp.act_anon();
select pg_temp.chk('anon: لا ينشئ طلباً', pg_temp.denied($$select public.create_order(pg_temp.payload())$$));
select pg_temp.chk('anon: لا يرى orders', pg_temp.denied($$select 1 from public.orders$$));
select pg_temp.chk('anon: لا يرى payments', pg_temp.denied($$select 1 from public.payments$$));
select pg_temp.chk('anon: لا يرى audit_log', pg_temp.denied($$select 1 from public.audit_log$$));
select pg_temp.chk('anon: لا يرى outbox', pg_temp.denied($$select 1 from public.outbox_events$$));
reset role;

-- ===== العميل A: التحقق من منطق create_order =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('بدون موافقة السياسة مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload('{"exchange_policy_accepted":false}'))$$, '%policy_not_accepted%'));
select pg_temp.chk('غياب الموافقة مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload() - 'exchange_policy_accepted')$$, '%policy_not_accepted%'));
select pg_temp.chk('كمية صفر مرفوضة', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.c('v1'), 'quantity', 0)))))$$, '%invalid_items%'));
select pg_temp.chk('كمية سالبة مرفوضة', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.c('v1'), 'quantity', -1)))))$$, '%invalid_items%'));
select pg_temp.chk('كمية نصية مرفوضة', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.c('v1'), 'quantity', 'abc')))))$$, '%invalid_items%'));
select pg_temp.chk('قائمة بنود فارغة مرفوضة', pg_temp.err_is($$select public.create_order(pg_temp.payload('{"items":[]}'))$$, '%invalid_items%'));
select pg_temp.chk('بنود ليست مصفوفة مرفوضة', pg_temp.err_is($$select public.create_order(pg_temp.payload('{"items":"x"}'))$$, '%invalid_items%'));
select pg_temp.chk('معرّف خيار مزوّر مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload('{"items":[{"variant_id":"1; drop table x","quantity":1}]}'))$$, '%invalid_items%'));
select pg_temp.chk('خيار غير موجود مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload('{"items":[{"variant_id":"00000000-0000-0000-0000-00000000dead","quantity":1}]}'))$$, '%item_unavailable%'));
select pg_temp.chk('منتج مخفي مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.c('vh'), 'quantity', 1)))))$$, '%item_unavailable%'));
select pg_temp.chk('خيار غير نشط مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.c('vi'), 'quantity', 1)))))$$, '%item_unavailable%'));
select pg_temp.chk('نفاد المخزون مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.c('v3'), 'quantity', 1)))))$$, '%insufficient_stock%'));
select pg_temp.chk('كمية أكبر من المتاح مرفوضة', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.c('v1'), 'quantity', 6)))))$$, '%insufficient_stock%'));
select pg_temp.chk('فرع موقوف مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('branch_id', pg_temp.c('br_off'))))$$, '%invalid_branch%'));
select pg_temp.chk('جوال غير صالح مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload('{"contact_phone":"abc"}'))$$, '%invalid_phone%'));
select pg_temp.chk('طريقة دفع موقوفة مرفوضة', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('payment_method_id', pg_temp.c('pm2'))))$$, '%invalid_payment_method%'));
select pg_temp.chk('توصيل بلا منطقة مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload('{"fulfillment":"delivery","delivery_address":"شارع الجلاء"}'))$$, '%invalid_zone%'));
select pg_temp.chk('منطقة موقوفة مرفوضة', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('fulfillment','delivery','delivery_zone_id', pg_temp.c('z2'),'delivery_address','شارع الجلاء')))$$, '%invalid_zone%'));
select pg_temp.chk('توصيل بلا عنوان مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('fulfillment','delivery','delivery_zone_id', pg_temp.c('z1'))))$$, '%invalid_address%'));
select pg_temp.chk('نوع استلام غير معروف مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload('{"fulfillment":"teleport"}'))$$, '%invalid_fulfillment%'));
reset role;
select pg_temp.chk('المخزون لم يتأثر بالطلبات المرفوضة', (select quantity = 5 from public.branch_stock where variant_id = pg_temp.c('v1')));
select pg_temp.chk('لم يُنشأ أي طلب من المرفوضة', (select count(*) = 0 from public.orders));

-- ذرّية الطلب: بند صالح + بند ينقصه المخزون ← لا يُخصم شيء
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('طلب مختلط (صالح + ناقص) مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('variant_id', pg_temp.c('v1'), 'quantity', 1), jsonb_build_object('variant_id', pg_temp.c('v3'), 'quantity', 1)))))$$, '%insufficient_stock%'));
reset role;
select pg_temp.chk('الذرّية: لم يُخصم المخزون', (select quantity = 5 from public.branch_stock where variant_id = pg_temp.c('v1')));

-- ===== إنشاء طلب صحيح مع محاولة تزوير السعر =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into _ctx select 'o1', (public.create_order(pg_temp.payload(jsonb_build_object(
  'fulfillment','delivery','delivery_zone_id', pg_temp.c('z1'),'delivery_address','شارع الجلاء، غزة',
  'price', 1, 'total', 1, 'subtotal', 1, 'delivery_fee', 0, 'status', 'confirmed',
  'items', jsonb_build_array(
    jsonb_build_object('variant_id', pg_temp.c('v1'), 'quantity', 2, 'price', 1, 'unit_price', 1),
    jsonb_build_object('variant_id', pg_temp.c('v2'), 'quantity', 1, 'price', 1)))))) ->> 'order_id';
reset role;
select pg_temp.chk('السعر المزوّر يُتجاهل: subtotal = 2×100 + 250', (select subtotal = 450 from public.orders where id = pg_temp.c('o1')));
select pg_temp.chk('رسوم التوصيل من المنطقة (15) لا من العميل', (select delivery_fee = 15 and total = 465 from public.orders where id = pg_temp.c('o1')));
select pg_temp.chk('الحالة الأولية new رغم محاولة فرض confirmed', (select status = 'new' from public.orders where id = pg_temp.c('o1')));
select pg_temp.chk('المصدر web ورقم الطلب ORD-', (select source_channel = 'web' and order_number like 'ORD-%' from public.orders where id = pg_temp.c('o1')));
select pg_temp.chk('تم خصم مخزون المتوفّر 5→3', (select quantity = 3 and status = 'available' from public.branch_stock where variant_id = pg_temp.c('v1')));
select pg_temp.chk('حسب الطلب لا يُخصم', (select quantity = 0 and status = 'made_to_order' from public.branch_stock where variant_id = pg_temp.c('v2')));
select pg_temp.chk('لقطة البند: الاسم والخيارات والسعر', exists (select 1 from public.order_items where order_id = pg_temp.c('o1') and product_name = 'منتج اختبار' and options_text = 't-opt-val' and unit_price = 100 and quantity = 2 and line_total = 200 and stock_reserved));
select pg_temp.chk('بند حسب الطلب غير محجوز', exists (select 1 from public.order_items where order_id = pg_temp.c('o1') and unit_price = 250 and not stock_reserved));
select pg_temp.chk('سجل الحالة الأول (null → new)', exists (select 1 from public.order_status_history where order_id = pg_temp.c('o1') and from_status is null and to_status = 'new'));
select pg_temp.chk('حدث outbox للطلب بمفتاح فريد', exists (select 1 from public.outbox_events where event_type = 'order.created' and idempotency_key = 'order.created:' || pg_temp.c('o1')));
select pg_temp.chk('موافقة السياسة سُجّلت مع النسخة', (select exchange_policy_accepted_at is not null and exchange_policy_version <> '' from public.orders where id = pg_temp.c('o1')));
select pg_temp.chk('تدقيق: إنشاء الطلب مسجّل', exists (select 1 from public.audit_log where entity_type = 'order' and action = 'insert' and entity_id = pg_temp.c('o1')::text));

-- طلب استلام بسيط من العميل A وطلب ثانٍ للإلغاء
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into _ctx select 'o2', (public.create_order(pg_temp.payload()) ->> 'order_id');
reset role;
select pg_temp.chk('استلام: بلا رسوم توصيل', (select delivery_fee = 0 and total = 200 and fulfillment = 'pickup' from public.orders where id = pg_temp.c('o2')));
select pg_temp.chk('المخزون بعد الطلب الثاني 3→1', (select quantity = 1 and status = 'limited' from public.branch_stock where variant_id = pg_temp.c('v1')));

-- ===== العزل بين العملاء + منع الكتابة المباشرة =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('A يرى طلبيه', (select count(*) = 2 from public.orders));
select pg_temp.chk('A يرى بنوده وسجلها', (select count(*) >= 3 from public.order_items) and (select count(*) >= 2 from public.order_status_history));
select pg_temp.chk('A لا يكتب في orders مباشرة (insert)', pg_temp.denied($$insert into public.orders (customer_id, branch_id, source_channel, contact_phone, subtotal, total, exchange_policy_accepted_at, exchange_policy_version) values (gen_random_uuid(), pg_temp.c('br'), 'web', '0599', 1, 1, now(), 'x')$$));
select pg_temp.chk('A لا يعدّل السعر مباشرة', pg_temp.denied($$update public.orders set total = 1 where id = pg_temp.c('o1')$$));
select pg_temp.chk('A لا يغيّر الحالة مباشرة', pg_temp.denied($$update public.orders set status = 'confirmed' where id = pg_temp.c('o1')$$));
select pg_temp.chk('A لا يحذف طلباً', pg_temp.denied($$delete from public.orders where id = pg_temp.c('o1')$$));
select pg_temp.chk('A لا يكتب في order_items', pg_temp.denied($$update public.order_items set unit_price = 1 where order_id = pg_temp.c('o1')$$));
select pg_temp.chk('A لا ينشئ payment مباشرة', pg_temp.denied($$insert into public.payments (order_id, method_id, amount, status) values (pg_temp.c('o1'), pg_temp.c('pm1'), 1, 'confirmed')$$));
select pg_temp.chk('A لا يقرأ audit_log', pg_temp.denied($$select 1 from public.audit_log$$));
select pg_temp.chk('A لا يقرأ outbox', (select count(*) = 0 from public.outbox_events));
reset role;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select pg_temp.chk('B لا يرى طلبات A', (select count(*) = 0 from public.orders));
select pg_temp.chk('B لا يرى بنود A', (select count(*) = 0 from public.order_items));
select pg_temp.chk('B لا يلغي طلب A', pg_temp.err_is($$select public.cancel_my_order(pg_temp.c('o2'), 'x')$$, '%order_not_found%'));
select pg_temp.chk('B لا يرفع إيصالاً على طلب A', pg_temp.err_is($$select public.submit_payment(pg_temp.c('o2'), 'orders/' || pg_temp.c('o2') || '/r.png')$$, '%order_not_found%'));
reset role;

-- ===== رفع الإيصال =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('إيصال بمسار طلب آخر مرفوض', pg_temp.err_is($$select public.submit_payment(pg_temp.c('o1'), 'orders/' || pg_temp.c('o2') || '/r.png')$$, '%invalid_receipt_path%'));
select pg_temp.chk('امتداد غير مسموح مرفوض', pg_temp.err_is($$select public.submit_payment(pg_temp.c('o1'), 'orders/' || pg_temp.c('o1') || '/r.exe')$$, '%invalid_receipt_path%'));
select pg_temp.chk('مسار فيه traversal مرفوض', pg_temp.err_is($$select public.submit_payment(pg_temp.c('o1'), 'orders/' || pg_temp.c('o1') || '/../x.png')$$, '%invalid_receipt_path%'));
insert into _ctx select 'pay1', public.submit_payment(pg_temp.c('o1'), 'orders/' || pg_temp.c('o1') || '/receipt.png')::text;
select pg_temp.chk('رفع إيصال ثانٍ أثناء المراجعة مرفوض', pg_temp.err_is($$select public.submit_payment(pg_temp.c('o1'), 'orders/' || pg_temp.c('o1') || '/second.png')$$, '%payment_already_submitted%'));
select pg_temp.chk('A يرى دفعته ومبلغها من الطلب', (select count(*) = 1 and bool_and(amount = 465 and status = 'pending') from public.payments));
reset role;
select pg_temp.chk('الطلب انتقل إلى awaiting_payment_confirmation', (select status = 'awaiting_payment_confirmation' from public.orders where id = pg_temp.c('o1')));
select pg_temp.chk('outbox: payment.receipt_uploaded', exists (select 1 from public.outbox_events where event_type = 'payment.receipt_uploaded'));

-- ===== المشرف (moderator): لا يرى الطلبات ولا المال ولا السجل =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select pg_temp.chk('moderator: لا يرى orders', (select count(*) = 0 from public.orders));
select pg_temp.chk('moderator: لا يرى payments', (select count(*) = 0 from public.payments));
select pg_temp.chk('moderator: لا يرى audit_log', pg_temp.denied($$select 1 from public.audit_log$$));
select pg_temp.chk('moderator: لا يستدعي set_order_status', pg_temp.err_is($$select public.set_order_status(pg_temp.c('o1'), 'confirmed')$$, '%not_allowed%'));
select pg_temp.chk('moderator: لا يستدعي review_payment', pg_temp.err_is($$select public.review_payment(pg_temp.c('pay1'), 'confirmed')$$, '%not_allowed%'));
reset role;

-- ===== الإداري بدون 2FA =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal1');
select pg_temp.chk('admin aal1: لا يرى orders', (select count(*) = 0 from public.orders));
select pg_temp.chk('admin aal1: لا يؤكد دفعة', pg_temp.err_is($$select public.review_payment(pg_temp.c('pay1'), 'confirmed')$$, '%not_allowed%'));
select pg_temp.chk('admin aal1: لا يقرأ audit_log', (select count(*) = 0 from public.audit_log));
reset role;

-- ===== الإداري مع 2FA: مراجعة الدفع =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
select pg_temp.chk('admin aal2: يرى الطلبات والدفعات', (select count(*) = 2 from public.orders) and (select count(*) = 1 from public.payments));
select pg_temp.chk('قرار غير صالح مرفوض', pg_temp.err_is($$select public.review_payment(pg_temp.c('pay1'), 'maybe')$$, '%invalid_decision%'));
select pg_temp.chk('الرفض بلا سبب مرفوض', pg_temp.err_is($$select public.review_payment(pg_temp.c('pay1'), 'rejected')$$, '%reject_reason_required%'));
select public.review_payment(pg_temp.c('pay1'), 'rejected', 'الإيصال غير واضح');
reset role;
select pg_temp.chk('الرفض: الدفعة rejected والطلب يعود new', (select p.status = 'rejected' and p.reject_reason = 'الإيصال غير واضح' and o.status = 'new' from public.payments p join public.orders o on o.id = p.order_id where p.id = pg_temp.c('pay1')));
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('بعد الرفض يستطيع الزبون رفع إيصال جديد', not pg_temp.denied($$select public.submit_payment(pg_temp.c('o1'), 'orders/' || pg_temp.c('o1') || '/new.pdf')$$));
reset role;
insert into _ctx select 'pay2', id::text from public.payments where order_id = pg_temp.c('o1') and status = 'pending';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
select public.review_payment(pg_temp.c('pay2'), 'confirmed');
select pg_temp.chk('مراجعة دفعة مُراجعة مسبقاً مرفوضة', pg_temp.err_is($$select public.review_payment(pg_temp.c('pay2'), 'confirmed')$$, '%payment_already_reviewed%'));
reset role;
select pg_temp.chk('التأكيد: الدفعة confirmed والطلب confirmed', (select p.status = 'confirmed' and p.reviewed_by = 'aaaaaaaa-0000-0000-0000-000000000004' and o.status = 'confirmed' from public.payments p join public.orders o on o.id = p.order_id where p.id = pg_temp.c('pay2')));
select pg_temp.chk('تدقيق حساس: تأكيد دفعة + تنبيه outbox', exists (select 1 from public.audit_log where entity_type = 'payment' and action = 'status_change' and is_sensitive and new_values ->> 'status' = 'confirmed')
  and exists (select 1 from public.outbox_events where event_type = 'audit.sensitive' and payload ->> 'entity_type' = 'payment'));
select pg_temp.chk('تدقيق: القيمة القديمة والجديدة للحالة', exists (select 1 from public.audit_log where entity_type = 'order' and old_values ->> 'status' = 'awaiting_payment_confirmation' and new_values ->> 'status' = 'confirmed'));
select pg_temp.chk('تدقيق يسجّل الفاعل واسمه ودوره', exists (select 1 from public.audit_log where actor_id = 'aaaaaaaa-0000-0000-0000-000000000004' and actor_role = 'admin' and actor_name is not null));

-- ===== انتقالات الحالة (توصيل) =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
select pg_temp.chk('انتقال غير مسموح (confirmed → delivered)', pg_temp.err_is($$select public.set_order_status(pg_temp.c('o1'), 'delivered')$$, '%invalid_transition%'));
select public.set_order_status(pg_temp.c('o1'), 'in_preparation');
select pg_temp.chk('طلب توصيل لا يصير ready_for_pickup', pg_temp.err_is($$select public.set_order_status(pg_temp.c('o1'), 'ready_for_pickup')$$, '%invalid_transition%'));
select public.set_order_status(pg_temp.c('o1'), 'out_for_delivery', 'مع السائق');
select public.set_order_status(pg_temp.c('o1'), 'delivered');
select pg_temp.chk('الحالة النهائية لا تتغير', pg_temp.err_is($$select public.set_order_status(pg_temp.c('o1'), 'cancelled', 'x')$$, '%invalid_transition%'));
reset role;
select pg_temp.chk('سجل الحالات كامل ومرتّب للتوصيل', (select array_agg(to_status::text order by id) = array['new','awaiting_payment_confirmation','new','awaiting_payment_confirmation','confirmed','in_preparation','out_for_delivery','delivered'] from public.order_status_history where order_id = pg_temp.c('o1')));
select pg_temp.chk('outbox: order.status_changed لكل انتقال', (select count(*) >= 6 from public.outbox_events where event_type = 'order.status_changed' and payload ->> 'order_id' = pg_temp.c('o1')::text));

-- ===== الإلغاء وإعادة المخزون =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select public.cancel_my_order(pg_temp.c('o2'), 'غيّرت رأيي');
select pg_temp.chk('الزبون لا يلغي طلباً منتهياً', pg_temp.err_is($$select public.cancel_my_order(pg_temp.c('o1'), 'x')$$, '%invalid_transition%'));
reset role;
select pg_temp.chk('الإلغاء أعاد المخزون 1→3', (select quantity = 3 from public.branch_stock where variant_id = pg_temp.c('v1')));
select pg_temp.chk('الإلغاء سجّل السبب وحالة cancelled', (select status = 'cancelled' and cancelled_reason = 'غيّرت رأيي' from public.orders where id = pg_temp.c('o2')));
select pg_temp.chk('تدقيق حساس لإلغاء الطلب', exists (select 1 from public.audit_log where entity_type = 'order' and entity_id = pg_temp.c('o2')::text and is_sensitive and new_values ->> 'status' = 'cancelled'));
-- إلغاء الإداري يتطلب سبباً ويعيد المخزون
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into _ctx select 'o3', (public.create_order(pg_temp.payload('{"items":[{"variant_id":"dddddddd-0000-0000-0000-000000000001","quantity":1}]}')) ->> 'order_id');
reset role;
select pg_temp.chk('الطلب الثالث خصم 3→2', (select quantity = 2 from public.branch_stock where variant_id = pg_temp.c('v1')));
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
select pg_temp.chk('إلغاء الإداري بلا سبب مرفوض', pg_temp.err_is($$select public.set_order_status(pg_temp.c('o3'), 'cancelled')$$, '%cancel_reason_required%'));
select pg_temp.chk('إلغاء الإداري بسبب ينجح', not pg_temp.denied($$select public.set_order_status(pg_temp.c('o3'), 'cancelled', 'نفد من المورّد')$$));
reset role;
select pg_temp.chk('إلغاء الإداري أعاد المخزون 2→3', (select quantity = 3 from public.branch_stock where variant_id = pg_temp.c('v1')));

-- ===== التوصيل معطّل من الإعدادات =====
update public.settings set value = '{"enabled":false}' where key = 'delivery';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('التوصيل المعطّل مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload(jsonb_build_object('fulfillment','delivery','delivery_zone_id', pg_temp.c('z1'),'delivery_address','شارع الجلاء')))$$, '%delivery_disabled%'));
reset role;
update public.settings set value = '{"enabled":true}' where key = 'delivery';

-- ===== تدقيق تغيير السعر (حساس) =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
update public.products set base_price = 120 where slug = 't-p1';
reset role;
select pg_temp.chk('تدقيق: تغيير السعر حساس بالقيمتين', exists (select 1 from public.audit_log where entity_type = 'product' and action = 'price_change' and is_sensitive and (old_values ->> 'base_price')::numeric = 100 and (new_values ->> 'base_price')::numeric = 120));
insert into _ctx select 'n_audit', count(*)::text from public.audit_log where entity_type = 'product';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
update public.products set updated_at = now() where slug = 't-p1';
reset role;
select pg_temp.chk('تدقيق: تحديث بلا تغيير حقيقي لا يُسجَّل', (select count(*)::text = (select v from _ctx where k = 'n_audit') from public.audit_log where entity_type = 'product'));

-- ===== المدقق (auditor) =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000005', 'aal2');
select pg_temp.chk('auditor aal2: يقرأ audit_log', (select count(*) > 0 from public.audit_log));
select pg_temp.chk('auditor: لا يرى الطلبات', (select count(*) = 0 from public.orders));
select pg_temp.chk('auditor: لا يرى الدفعات', (select count(*) = 0 from public.payments));
select pg_temp.chk('auditor: لا يكتب في السجل', pg_temp.denied($$insert into public.audit_log (entity_type, action) values ('x','y')$$));
select pg_temp.chk('auditor: لا يستدعي set_order_status', pg_temp.err_is($$select public.set_order_status(pg_temp.c('o1'), 'cancelled', 'x')$$, '%not_allowed%'));
select pg_temp.chk('auditor: لا يعدّل منتجاً', pg_temp.denied($$update public.products set name = 'x' where slug = 't-p1'$$));
reset role;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000005', 'aal1');
select pg_temp.chk('auditor بدون 2FA: لا يقرأ السجل', (select count(*) = 0 from public.audit_log));
reset role;

-- ===== السجل Append-Only حتى من أعلى صلاحية =====
select pg_temp.chk('postgres: لا يعدّل السجل', pg_temp.err_is($$update public.audit_log set action = 'x' where id is not null$$, '%append-only%'));
select pg_temp.chk('postgres: لا يحذف من السجل', pg_temp.err_is($$delete from public.audit_log where id is not null$$, '%append-only%'));
select pg_temp.chk('postgres: لا يفرّغ السجل', pg_temp.err_is($$truncate public.audit_log$$, '%append-only%'));
set local role service_role;
select pg_temp.chk('service_role: لا يعدّل السجل', pg_temp.denied($$update public.audit_log set action = 'x' where id is not null$$));
select pg_temp.chk('service_role: لا يحذف من السجل', pg_temp.denied($$delete from public.audit_log where id is not null$$));
select pg_temp.chk('service_role: لا يكتب في السجل', pg_temp.denied($$insert into public.audit_log (entity_type, action) values ('x','y')$$));
select pg_temp.chk('service_role: يقرأ السجل', (select count(*) > 0 from public.audit_log));
reset role;

-- ===== Outbox: الإداري يرى المتعثّر فقط =====
update public.outbox_events set status = 'failed', last_error = 'x' where id = (select id from public.outbox_events order by created_at limit 1);
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
select pg_temp.chk('admin: يرى outbox المتعثّر فقط', (select count(*) = 1 from public.outbox_events) and (select bool_and(status in ('failed','dead')) from public.outbox_events));
select pg_temp.chk('admin: لا يكتب في outbox مباشرة', pg_temp.denied($$update public.outbox_events set status = 'sent' where id is not null$$));
reset role;
select pg_temp.chk('مفتاح idempotency فريد (لا تكرار)', (select count(*) = count(distinct idempotency_key) from public.outbox_events));

-- ===== مخازن الإيصالات خاصة بلا سياسات =====
select pg_temp.chk('bucket receipts خاص بحدود 5MB وأنواع محددة', (select not public and file_size_limit = 5242880 and allowed_mime_types @> array['application/pdf','image/png'] and not allowed_mime_types @> array['image/svg+xml'] from storage.buckets where id = 'receipts'));
select pg_temp.chk('لا سياسات storage تمنح وصولاً لـ receipts', (select count(*) = 0 from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual,'') ilike '%receipts%' or coalesce(with_check,'') ilike '%receipts%')));
select pg_temp.chk('bucket custom-refs خاص', (select not public from storage.buckets where id = 'custom-refs'));

-- ===== صلاحيات الدوال =====
select pg_temp.act_anon();
select pg_temp.chk('anon: لا ينفّذ submit_payment', pg_temp.denied($$select public.submit_payment(gen_random_uuid(), 'x')$$));
select pg_temp.chk('anon: لا ينفّذ review_payment', pg_temp.denied($$select public.review_payment(gen_random_uuid(), 'confirmed')$$));
reset role;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('عميل: لا يستدعي النواة الداخلية مباشرة', pg_temp.denied($$select private.create_order_core(gen_random_uuid(), 'web', '{}')$$));
select pg_temp.chk('عميل: لا يستدعي apply_order_status', pg_temp.denied($$select private.apply_order_status(pg_temp.c('o1'), 'cancelled', null, 'x')$$));
reset role;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
       coalesce(string_agg(name, ' | ') filter (where not ok), '-') as failures from _t;
rollback;
