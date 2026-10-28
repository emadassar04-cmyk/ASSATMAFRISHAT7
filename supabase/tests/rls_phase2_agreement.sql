-- اختبارات الدفع/التوصيل «بالاتفاق»: طريقة دفع افتراضية، منطقة رسومها بالاتفاق، تفضيل التواصل، set_delivery_fee.
-- تُشغَّل داخل معاملة وتُلغى. يجب failed = 0. (النتيجة المسجّلة: 19/19 على مشروع التطوير.)
-- التشغيل: psql أو Supabase MCP execute_sql (جلسة واحدة)، وليس SQL Editor في المتصفح (لا يُبقي الجداول المؤقتة).
begin;
create temp table _t (name text, ok boolean);   grant all on _t to public;
create temp table _ctx (k text primary key, v text); grant all on _ctx to public;
create function pg_temp.chk(p_name text, p_ok boolean) returns void language plpgsql security definer as $$ begin insert into _t values (p_name, coalesce(p_ok, false)); end $$;
create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$ declare n bigint; begin execute p_sql; get diagnostics n = row_count; return n = 0; exception when others then return true; end $$;
create function pg_temp.err_is(p_sql text, p_like text) returns boolean language plpgsql as $$ begin execute p_sql; return false; exception when others then return sqlerrm like p_like; end $$;
create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.c(p_k text) returns uuid language sql stable as $$ select v::uuid from _ctx where k = p_k $$;
create function pg_temp.payload(p_extra jsonb default '{}') returns jsonb language sql stable as $$
  select (jsonb_build_object('branch_id', pg_temp.c('br'), 'fulfillment', 'pickup', 'contact_phone', '0599123456',
    'exchange_policy_accepted', true,
    'items', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.c('v1'), 'quantity', 2)))) || p_extra $$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','authenticated','authenticated','t-custa@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','authenticated','authenticated','t-mod@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000004','authenticated','authenticated','t-admin@x.local','{}');
update public.profiles set role='moderator' where id='aaaaaaaa-0000-0000-0000-000000000003';
update public.profiles set role='admin' where id='aaaaaaaa-0000-0000-0000-000000000004';
insert into public.branches (id, slug, name) values ('eeeeeeee-0000-0000-0000-000000000001','t-branch','فرع اختبار');
insert into public.products (id, slug, name, base_price) values ('cccccccc-0000-0000-0000-000000000001','t-p1','منتج اختبار',100);
insert into public.product_variants (id, product_id, price) values ('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',100);
insert into public.branch_stock (variant_id, branch_id, quantity) values ('dddddddd-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001',20);
insert into public.delivery_zones (id, name, fee, is_active) values ('77777777-0000-0000-0000-000000000001','منطقة ثابتة',15,true);
insert into _ctx values ('br','eeeeeeee-0000-0000-0000-000000000001'), ('v1','dddddddd-0000-0000-0000-000000000001'), ('zfix','77777777-0000-0000-0000-000000000001');
insert into _ctx select 'zagr', id::text from public.delivery_zones where fee_on_agreement and is_active limit 1;
insert into _ctx select 'pm_agr', id::text from public.payment_methods where code = 'agreement';
insert into public.settings (key, value, is_public) values ('policy.exchange', '{"title":"t","body":"t"}', true) on conflict (key) do nothing;

select pg_temp.chk('منطقة «بالاتفاق» وطريقة «بالاتفاق» موجودتان في الإعداد', (select count(*) = 1 from _ctx where k = 'zagr') and (select count(*) = 1 from _ctx where k = 'pm_agr'));

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into _ctx select 'o1', (public.create_order(pg_temp.payload(jsonb_build_object('fulfillment','delivery','delivery_zone_id', pg_temp.c('zagr'),'delivery_address','شارع الجلاء، غزة','contact_preference','facebook'))) ->> 'order_id');
insert into _ctx select 'o2', (public.create_order(pg_temp.payload(jsonb_build_object('fulfillment','delivery','delivery_zone_id', pg_temp.c('zfix'),'delivery_address','شارع الجلاء، غزة'))) ->> 'order_id');
insert into _ctx select 'o3', (public.create_order(pg_temp.payload()) ->> 'order_id');
select pg_temp.chk('تفضيل تواصل غير معروف مرفوض', pg_temp.err_is($$select public.create_order(pg_temp.payload('{"contact_preference":"sms"}'))$$, '%invalid_contact_preference%'));
reset role;

select pg_temp.chk('بدون طريقة دفع ← «بالاتفاق» تلقائياً', (select payment_method_id = pg_temp.c('pm_agr') from public.orders where id = pg_temp.c('o1')));
select pg_temp.chk('توصيل بالاتفاق: الرسوم 0 ومعلّقة والإجمالي = المجموع', (select delivery_fee = 0 and delivery_fee_pending and total = subtotal and total = 200 from public.orders where id = pg_temp.c('o1')));
select pg_temp.chk('تفضيل التواصل محفوظ', (select contact_preference = 'facebook' from public.orders where id = pg_temp.c('o1')));
select pg_temp.chk('منطقة بسعر ثابت تعمل كما قبل (15)', (select delivery_fee = 15 and not delivery_fee_pending and total = 215 from public.orders where id = pg_temp.c('o2')));
select pg_temp.chk('outbox يحمل delivery_fee_pending وتفضيل التواصل', exists (select 1 from public.outbox_events where event_type = 'order.created' and (payload ->> 'delivery_fee_pending')::boolean and payload ->> 'contact_preference' = 'facebook'));

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select pg_temp.chk('moderator: لا يحدد الرسوم', pg_temp.err_is($$select public.set_delivery_fee(pg_temp.c('o1'), 20)$$, '%not_allowed%'));
reset role;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('الزبون لا يحدد الرسوم', pg_temp.err_is($$select public.set_delivery_fee(pg_temp.c('o1'), 0)$$, '%not_allowed%'));
reset role;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal1');
select pg_temp.chk('admin بدون 2FA: لا يحدد الرسوم', pg_temp.err_is($$select public.set_delivery_fee(pg_temp.c('o1'), 20)$$, '%not_allowed%'));
reset role;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
select pg_temp.chk('رسوم سالبة مرفوضة', pg_temp.err_is($$select public.set_delivery_fee(pg_temp.c('o1'), -1)$$, '%invalid_fee%'));
select pg_temp.chk('رسوم مبالغ بها مرفوضة', pg_temp.err_is($$select public.set_delivery_fee(pg_temp.c('o1'), 10001)$$, '%invalid_fee%'));
select pg_temp.chk('طلب استلام لا رسوم له', pg_temp.err_is($$select public.set_delivery_fee(pg_temp.c('o3'), 10)$$, '%not_delivery_order%'));
select public.set_delivery_fee(pg_temp.c('o1'), 25.5, 'اتفقنا عبر ماسنجر');
reset role;
select pg_temp.chk('الرسوم بعد الاتفاق: 25.5 والإجمالي 225.5 وغير معلّقة', (select delivery_fee = 25.5 and total = 225.5 and not delivery_fee_pending from public.orders where id = pg_temp.c('o1')));
select pg_temp.chk('outbox: order.fee_set', exists (select 1 from public.outbox_events where event_type = 'order.fee_set' and (payload ->> 'delivery_fee')::numeric = 25.5));
select pg_temp.chk('تدقيق: تغيير الرسوم والإجمالي بالقيمتين ومن الإداري', exists (select 1 from public.audit_log where entity_type = 'order' and entity_id = pg_temp.c('o1')::text and (old_values ->> 'total')::numeric = 200 and (new_values ->> 'total')::numeric = 225.5 and actor_role = 'admin'));
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
select public.set_order_status(pg_temp.c('o1'), 'cancelled', 'اختبار');
select pg_temp.chk('طلب ملغى لا تُعدَّل رسومه', pg_temp.err_is($$select public.set_delivery_fee(pg_temp.c('o1'), 5)$$, '%order_closed%'));
reset role;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('الزبون لا يعدّل الرسوم مباشرة', pg_temp.denied($$update public.orders set delivery_fee = 0, total = 1 where id = pg_temp.c('o2')$$));
select pg_temp.chk('الزبون يرى طلباته الثلاثة فقط', (select count(*) = 3 from public.orders));
reset role;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, coalesce(string_agg(name,' | ') filter (where not ok),'-') as failures from _t;
rollback;
