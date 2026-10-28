-- اختبارات طلبات التفصيل والعربون: إنشاء، صور مرجعية، تسعير، عربون من الإعدادات، انتقالات، عزل الأدوار.
-- تُشغَّل داخل معاملة وتُلغى. يجب failed = 0. (النتيجة المسجّلة: 43/43 على مشروع التطوير.)
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
create function pg_temp.act_anon() returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', '{}', true); perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon'; end $$;
create function pg_temp.c(p_k text) returns uuid language sql stable as $$ select v::uuid from _ctx where k = p_k $$;
create function pg_temp.img(p_cust uuid, p_ext text default 'jpg') returns text language sql as $$ select 'customers/' || p_cust || '/' || gen_random_uuid() || '.' || p_ext $$;
create function pg_temp.pl(p_extra jsonb default '{}') returns jsonb language sql stable as $$
  select (jsonb_build_object('description', 'كنب ركنة مقاس 3×2.5 متر بخامة قطيفة', 'contact_phone', '0599123456', 'policy_accepted', true)) || p_extra $$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','authenticated','authenticated','t-custa@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','authenticated','authenticated','t-custb@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','authenticated','authenticated','t-mod@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000004','authenticated','authenticated','t-admin@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000005','authenticated','authenticated','t-aud@x.local','{}');
update public.profiles set role='moderator' where id='aaaaaaaa-0000-0000-0000-000000000003';
update public.profiles set role='admin' where id='aaaaaaaa-0000-0000-0000-000000000004';
update public.profiles set role='auditor' where id='aaaaaaaa-0000-0000-0000-000000000005';
insert into _ctx select 'ca', id::text from public.customers where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into _ctx select 'cb', id::text from public.customers where profile_id = 'aaaaaaaa-0000-0000-0000-000000000002';
insert into public.settings (key, value, is_public) values ('deposit', '{"enabled":true,"percent":30}', true) on conflict (key) do update set value = excluded.value;

select pg_temp.act_anon();
select pg_temp.chk('anon: لا ينشئ طلب تفصيل', pg_temp.denied($$select public.create_custom_order(pg_temp.pl())$$));
select pg_temp.chk('anon: لا يرى custom_orders', pg_temp.denied($$select 1 from public.custom_orders$$));
reset role;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('بدون موافقة سياسة التفصيل مرفوض', pg_temp.err_is($$select public.create_custom_order(pg_temp.pl('{"policy_accepted":false}'))$$, '%policy_not_accepted%'));
select pg_temp.chk('وصف قصير مرفوض', pg_temp.err_is($$select public.create_custom_order(pg_temp.pl('{"description":"قصير"}'))$$, '%invalid_description%'));
select pg_temp.chk('وصف طويل جداً مرفوض', pg_temp.err_is($$select public.create_custom_order(pg_temp.pl(jsonb_build_object('description', repeat('س', 2001))))$$, '%invalid_description%'));
select pg_temp.chk('جوال غير صالح مرفوض', pg_temp.err_is($$select public.create_custom_order(pg_temp.pl('{"contact_phone":"12"}'))$$, '%invalid_phone%'));
select pg_temp.chk('فرع غير موجود مرفوض', pg_temp.err_is($$select public.create_custom_order(pg_temp.pl('{"branch_id":"00000000-0000-0000-0000-00000000dead"}'))$$, '%invalid_branch%'));
select pg_temp.chk('أكثر من 3 صور مرفوض', pg_temp.err_is(format($f$select public.create_custom_order(pg_temp.pl(jsonb_build_object('reference_image_paths', jsonb_build_array(%L,%L,%L,%L))))$f$, pg_temp.img(pg_temp.c('ca')), pg_temp.img(pg_temp.c('ca')), pg_temp.img(pg_temp.c('ca')), pg_temp.img(pg_temp.c('ca'))), '%too_many_images%'));
select pg_temp.chk('صورة في مجلد زبون آخر مرفوضة', pg_temp.err_is(format($f$select public.create_custom_order(pg_temp.pl(jsonb_build_object('reference_image_paths', jsonb_build_array(%L))))$f$, pg_temp.img(pg_temp.c('cb'))), '%invalid_image_path%'));
select pg_temp.chk('امتداد غير مسموح للصورة مرفوض', pg_temp.err_is(format($f$select public.create_custom_order(pg_temp.pl(jsonb_build_object('reference_image_paths', jsonb_build_array(%L))))$f$, pg_temp.img(pg_temp.c('ca'), 'svg')), '%invalid_image_path%'));
select pg_temp.chk('مسار traversal للصورة مرفوض', pg_temp.err_is(format($f$select public.create_custom_order(pg_temp.pl(jsonb_build_object('reference_image_paths', jsonb_build_array(%L))))$f$, 'customers/' || pg_temp.c('ca') || '/../x.jpg'), '%invalid_image_path%'));
select pg_temp.chk('تفضيل تواصل غير معروف مرفوض', pg_temp.err_is($$select public.create_custom_order(pg_temp.pl('{"contact_preference":"sms"}'))$$, '%invalid_contact_preference%'));
insert into _ctx select 'co1', public.create_custom_order(pg_temp.pl(jsonb_build_object('dimensions','3×2.5م','material','قطيفة','color','رمادي','contact_preference','whatsapp','reference_image_paths', jsonb_build_array(pg_temp.img(pg_temp.c('ca'))))))::text;
reset role;
select pg_temp.chk('الطلب أُنشئ بحالة new ومحفوظ بكل حقوله', (select status = 'new' and dimensions = '3×2.5م' and material = 'قطيفة' and contact_preference = 'whatsapp' and array_length(reference_image_paths, 1) = 1 and policy_accepted_at is not null and source_channel = 'web' from public.custom_orders where id = pg_temp.c('co1')));
select pg_temp.chk('outbox: custom_order.created', exists (select 1 from public.outbox_events where idempotency_key = 'custom_order.created:' || pg_temp.c('co1')));
select pg_temp.chk('تدقيق: إنشاء الطلب مسجّل', exists (select 1 from public.audit_log where entity_type = 'custom_order' and action = 'insert' and entity_id = pg_temp.c('co1')::text));

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select public.create_custom_order(pg_temp.pl()) from generate_series(1, 4);
select pg_temp.chk('الحد: السادس خلال 24 ساعة مرفوض', pg_temp.err_is($$select public.create_custom_order(pg_temp.pl())$$, '%too_many_requests%'));
reset role;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select pg_temp.chk('B لا يرى طلبات A', (select count(*) = 0 from public.custom_orders));
select pg_temp.chk('B لا يلغي طلب A', pg_temp.err_is($$select public.cancel_my_custom_order(pg_temp.c('co1'))$$, '%order_not_found%'));
reset role;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('A يرى طلباته (5)', (select count(*) = 5 from public.custom_orders));
select pg_temp.chk('A لا يعدّل السعر مباشرة', pg_temp.denied($$update public.custom_orders set quoted_price = 1 where id = pg_temp.c('co1')$$));
select pg_temp.chk('A لا يغيّر الحالة مباشرة', pg_temp.denied($$update public.custom_orders set status = 'in_progress' where id = pg_temp.c('co1')$$));
select pg_temp.chk('A لا يسعّر', pg_temp.err_is($$select public.quote_custom_order(pg_temp.c('co1'), 100)$$, '%not_allowed%'));
select pg_temp.chk('A لا يغيّر الحالة عبر الدالة', pg_temp.err_is($$select public.set_custom_order_status(pg_temp.c('co1'), 'ready')$$, '%not_allowed%'));
reset role;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select pg_temp.chk('moderator يرى طلبات التفصيل', (select count(*) = 5 from public.custom_orders));
select pg_temp.chk('سعر صفر مرفوض', pg_temp.err_is($$select public.quote_custom_order(pg_temp.c('co1'), 0)$$, '%invalid_price%'));
select pg_temp.chk('سعر مبالغ به مرفوض', pg_temp.err_is($$select public.quote_custom_order(pg_temp.c('co1'), 1000001)$$, '%invalid_price%'));
select pg_temp.chk('لا بدء تنفيذ قبل التسعير', pg_temp.err_is($$select public.set_custom_order_status(pg_temp.c('co1'), 'in_progress')$$, '%invalid_transition%'));
select public.quote_custom_order(pg_temp.c('co1'), 1500.50, 'شامل التركيب');
reset role;
select pg_temp.chk('التسعير: الحالة quoted والعربون 30% = 450.15', (select status = 'quoted' and quoted_price = 1500.5 and deposit_percent = 30 and deposit_amount = 450.15 and quote_note = 'شامل التركيب' from public.custom_orders where id = pg_temp.c('co1')));
select pg_temp.chk('outbox: custom_order.quoted', exists (select 1 from public.outbox_events where event_type = 'custom_order.quoted' and (payload ->> 'deposit_amount')::numeric = 450.15));
select pg_temp.chk('تدقيق: التسعير والحالة بالقيمتين وباسم المشرف', exists (select 1 from public.audit_log where entity_type = 'custom_order' and entity_id = pg_temp.c('co1')::text and old_values ->> 'status' = 'new' and new_values ->> 'status' = 'quoted' and actor_role = 'moderator'));

update public.settings set value = '{"enabled":false,"percent":30}' where key = 'deposit';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
select public.quote_custom_order(pg_temp.c('co1'), 2000);
reset role;
select pg_temp.chk('العربون معطّل: لا نسبة ولا مبلغ', (select deposit_percent is null and deposit_amount is null and quoted_price = 2000 from public.custom_orders where id = pg_temp.c('co1')));
update public.settings set value = '{"enabled":true,"percent":250}' where key = 'deposit';
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
select public.quote_custom_order(pg_temp.c('co1'), 1000);
reset role;
select pg_temp.chk('نسبة عربون مبالغ بها تُقيَّد بـ 100%', (select deposit_percent = 100 and deposit_amount = 1000 from public.custom_orders where id = pg_temp.c('co1')));
update public.settings set value = '{"enabled":true,"percent":30}' where key = 'deposit';

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal1');
select pg_temp.chk('admin بدون 2FA: لا يسعّر', pg_temp.err_is($$select public.quote_custom_order(pg_temp.c('co1'), 100)$$, '%not_allowed%'));
select pg_temp.chk('admin بدون 2FA: لا يرى الطلبات', (select count(*) = 0 from public.custom_orders));
reset role;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000005', 'aal2');
select pg_temp.chk('auditor: لا يرى طلبات التفصيل', (select count(*) = 0 from public.custom_orders));
select pg_temp.chk('auditor: لا يسعّر', pg_temp.err_is($$select public.quote_custom_order(pg_temp.c('co1'), 100)$$, '%not_allowed%'));
reset role;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select public.set_custom_order_status(pg_temp.c('co1'), 'deposit_pending');
select public.set_custom_order_status(pg_temp.c('co1'), 'in_progress');
select pg_temp.chk('قفز من in_progress إلى delivered مرفوض', pg_temp.err_is($$select public.set_custom_order_status(pg_temp.c('co1'), 'delivered')$$, '%invalid_transition%'));
select pg_temp.chk('لا تسعير بعد بدء التنفيذ', pg_temp.err_is($$select public.quote_custom_order(pg_temp.c('co1'), 10)$$, '%invalid_transition%'));
select pg_temp.chk('إلغاء بلا سبب مرفوض', pg_temp.err_is($$select public.set_custom_order_status(pg_temp.c('co1'), 'cancelled')$$, '%cancel_reason_required%'));
select public.set_custom_order_status(pg_temp.c('co1'), 'ready');
select public.set_custom_order_status(pg_temp.c('co1'), 'delivered');
select pg_temp.chk('الحالة النهائية لا تتغير', pg_temp.err_is($$select public.set_custom_order_status(pg_temp.c('co1'), 'cancelled', 'x')$$, '%invalid_transition%'));
reset role;
select pg_temp.chk('الحالة النهائية delivered', (select status = 'delivered' from public.custom_orders where id = pg_temp.c('co1')));

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('الزبون لا يلغي طلباً منتهياً', pg_temp.err_is($$select public.cancel_my_custom_order(pg_temp.c('co1'))$$, '%invalid_transition%'));
insert into _ctx select 'co_new', id::text from public.custom_orders where status = 'new' limit 1;
select public.cancel_my_custom_order(pg_temp.c('co_new'), 'غيّرت رأيي');
reset role;
select pg_temp.chk('إلغاء الزبون لطلب جديد وسبب محفوظ', (select status = 'cancelled' and cancelled_reason = 'غيّرت رأيي' from public.custom_orders where id = pg_temp.c('co_new')));

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, coalesce(string_agg(name,' | ') filter (where not ok),'-') as failures from _t;
rollback;
