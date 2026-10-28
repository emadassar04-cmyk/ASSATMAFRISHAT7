-- اختبارات RLS للمرحلة 1: لكل دور × جدول × عملية.
-- تُشغَّل داخل معاملة وتُلغى (rollback) فلا تترك أثراً.
-- التشغيل: psql أو Supabase MCP execute_sql. الناتج: الملخص (يجب failed = 0) وأسماء الاختبارات الفاشلة.
begin;

create temp table _t (name text, ok boolean);
grant all on _t to public;

create function pg_temp.chk(p_name text, p_ok boolean) returns void
language plpgsql security definer as $$ begin insert into _t values (p_name, coalesce(p_ok, false)); end $$;

-- يعيد true إذا فشل الأمر (رفض صلاحية) أو لم يؤثر على أي صف (RLS)
create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$
declare n bigint;
begin execute p_sql; get diagnostics n = row_count; return n = 0;
exception when others then return true; end $$;

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.act_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;
grant execute on all functions in schema pg_temp to public;

-- ===== بيانات الاختبار (كـ postgres) =====
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','authenticated','authenticated','t-cust@x.local','{"phone":"+970590000001"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','authenticated','authenticated','t-mod@x.local','{"phone":"+970590000002"}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','authenticated','authenticated','t-admin@x.local','{"phone":"+970590000003"}'),
 ('aaaaaaaa-0000-0000-0000-000000000004','authenticated','authenticated','t-aud@x.local','{"phone":"+970590000004"}');
update public.profiles set role='moderator' where id='aaaaaaaa-0000-0000-0000-000000000002';
update public.profiles set role='admin'     where id='aaaaaaaa-0000-0000-0000-000000000003';
update public.profiles set role='auditor'   where id='aaaaaaaa-0000-0000-0000-000000000004';

insert into public.settings (key, value, is_public) values ('t.public','{"a":1}',true), ('t.private','{"a":2}',false);
insert into public.categories (id, slug, name, is_visible) values
 ('bbbbbbbb-0000-0000-0000-000000000001','t-cat-visible','ظاهر',true), ('bbbbbbbb-0000-0000-0000-000000000002','t-cat-hidden','مخفي',false);
insert into public.products (id, slug, name, base_price, is_visible) values
 ('cccccccc-0000-0000-0000-000000000001','t-p-visible','منتج ظاهر',100,true), ('cccccccc-0000-0000-0000-000000000002','t-p-hidden','منتج مخفي',100,false);
insert into public.product_variants (id, product_id, price) values ('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',100);
insert into public.branches (id, slug, name) values ('eeeeeeee-0000-0000-0000-000000000001','t-branch','فرع اختبار');
insert into public.branch_stock (variant_id, branch_id, quantity, low_threshold) values ('dddddddd-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001',1,2);

-- ===== triggers =====
select pg_temp.chk('handle_new_user ينشئ profile بدور customer', (select role = 'customer' from public.profiles where id='aaaaaaaa-0000-0000-0000-000000000001'));
select pg_temp.chk('handle_new_user ينشئ customer مرتبط بالحساب', exists (select 1 from public.customers where profile_id='aaaaaaaa-0000-0000-0000-000000000001'));
select pg_temp.chk('حالة المخزون limited عند كمية <= العتبة', (select status = 'limited' from public.branch_stock where branch_id='eeeeeeee-0000-0000-0000-000000000001'));
update public.branch_stock set quantity = 0 where branch_id='eeeeeeee-0000-0000-0000-000000000001';
select pg_temp.chk('حالة المخزون out_of_stock عند 0', (select status = 'out_of_stock' from public.branch_stock where branch_id='eeeeeeee-0000-0000-0000-000000000001'));
update public.branch_stock set status='made_to_order' where branch_id='eeeeeeee-0000-0000-0000-000000000001';
select pg_temp.chk('made_to_order يبقى كما هو', (select status = 'made_to_order' from public.branch_stock where branch_id='eeeeeeee-0000-0000-0000-000000000001'));
update public.branch_stock set quantity = 9, status='available' where branch_id='eeeeeeee-0000-0000-0000-000000000001';

-- ===== anon =====
select pg_temp.act_anon();
select pg_temp.chk('anon: يرى المنتج الظاهر فقط', (select count(*) from public.products where slug like 't-p-%') = 1);
select pg_temp.chk('anon: يرى القسم الظاهر فقط', (select count(*) from public.categories where slug like 't-cat-%') = 1);
select pg_temp.chk('anon: يرى الإعدادات العامة فقط', (select count(*) from public.settings where key like 't.%') = 1);
select pg_temp.chk('anon: لا يرى branch_stock', (select count(*) from public.branch_stock) = 0);
select pg_temp.chk('anon: لا يرى payment_methods', (select count(*) from public.payment_methods) = 0);
select pg_temp.chk('anon: لا يرى profiles', (select count(*) from public.profiles) = 0);
select pg_temp.chk('anon: لا يرى customers', (select count(*) from public.customers) = 0);
select pg_temp.chk('anon: لا يكتب في products', pg_temp.denied($$insert into public.products (slug,name,base_price) values ('x','x',1)$$));
select pg_temp.chk('anon: لا يكتب في settings', pg_temp.denied($$update public.settings set value='{}' where key='t.public'$$));
select pg_temp.chk('anon: RPC التوفر تعيد الحالة', (select count(*) from public.get_product_availability('cccccccc-0000-0000-0000-000000000001')) = 1);
select pg_temp.chk('anon: search_products تخفي المخفي', (select count(*) from public.search_products(p_q := 'منتج')) = 1);
select pg_temp.chk('anon: check_rate_limit غير متاحة', pg_temp.denied($$select public.check_rate_limit('k',1,1)$$));
reset role;

-- ===== customer =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('customer: يرى ملفه فقط', (select count(*) from public.profiles) = 1);
select pg_temp.chk('customer: لا يغيّر دوره', pg_temp.denied($$update public.profiles set role='admin' where id='aaaaaaaa-0000-0000-0000-000000000001'$$));
select pg_temp.chk('customer: يعدّل اسمه', not pg_temp.denied($$update public.profiles set full_name='س' where id='aaaaaaaa-0000-0000-0000-000000000001'$$));
select pg_temp.chk('customer: لا يعدّل ملف غيره', pg_temp.denied($$update public.profiles set full_name='x' where id='aaaaaaaa-0000-0000-0000-000000000002'$$));
select pg_temp.chk('customer: لا يستدعي admin_update_profile', pg_temp.denied($$select public.admin_update_profile('aaaaaaaa-0000-0000-0000-000000000001','admin',true,null,null)$$));
select pg_temp.chk('customer: لا يكتب في categories', pg_temp.denied($$insert into public.categories (slug,name) values ('y','y')$$));
select pg_temp.chk('customer: لا يرى branch_stock', (select count(*) from public.branch_stock) = 0);
select pg_temp.chk('customer: لا يرى زبائن آخرين', (select count(*) from public.customers) = 1);
select pg_temp.chk('customer: يضيف مفضلة لنفسه', not pg_temp.denied($$insert into public.favorites (customer_id, product_id) select id, 'cccccccc-0000-0000-0000-000000000001' from public.customers where profile_id = auth.uid()$$));
select pg_temp.chk('customer: لا يضيف مفضلة لغيره', pg_temp.denied($$insert into public.favorites (customer_id, product_id) values ('00000000-0000-0000-0000-00000000dead','cccccccc-0000-0000-0000-000000000001')$$));
reset role;

-- ===== moderator =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select pg_temp.chk('moderator: يرى المنتج المخفي', (select count(*) from public.products where slug like 't-p-%') = 2);
select pg_temp.chk('moderator: ينشئ قسماً', not pg_temp.denied($$insert into public.categories (slug,name) values ('t-mod-cat','م')$$));
select pg_temp.chk('moderator: يعدّل منتجاً', not pg_temp.denied($$update public.products set name='معدّل' where slug='t-p-visible'$$));
select pg_temp.chk('moderator: يعدّل مخزون الفرع', not pg_temp.denied($$update public.branch_stock set quantity=5 where branch_id='eeeeeeee-0000-0000-0000-000000000001'$$));
select pg_temp.chk('moderator: يقرأ branch_stock', (select count(*) from public.branch_stock where branch_id='eeeeeeee-0000-0000-0000-000000000001') = 1);
select pg_temp.chk('moderator: لا يرى الإعدادات الخاصة', (select count(*) from public.settings where key='t.private') = 0);
select pg_temp.chk('moderator: لا يعدّل الإعدادات', pg_temp.denied($$update public.settings set value='{"x":1}' where key='t.public'$$));
select pg_temp.chk('moderator: لا يكتب في الفروع', pg_temp.denied($$update public.branches set name='x' where id='eeeeeeee-0000-0000-0000-000000000001'$$));
select pg_temp.chk('moderator: لا يرى payment_methods', (select count(*) from public.payment_methods) = 0);
select pg_temp.chk('moderator: لا يرى ملفات الآخرين', (select count(*) from public.profiles) = 1);
select pg_temp.chk('moderator: لا يستدعي admin_update_profile', pg_temp.denied($$select public.admin_update_profile('aaaaaaaa-0000-0000-0000-000000000001','admin',true,null,null)$$));
select pg_temp.chk('moderator: لا يقرأ product_views', (select count(*) from public.product_views) = 0);
reset role;

-- ===== admin بدون 2FA (aal1) =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003', 'aal1');
select pg_temp.chk('admin aal1: لا يقرأ الإعدادات الخاصة', (select count(*) from public.settings where key='t.private') = 0);
select pg_temp.chk('admin aal1: لا ينشئ قسماً', pg_temp.denied($$insert into public.categories (slug,name) values ('t-adm1','x')$$));
select pg_temp.chk('admin aal1: لا يستدعي admin_update_profile', pg_temp.denied($$select public.admin_update_profile('aaaaaaaa-0000-0000-0000-000000000001','moderator',true,null,null)$$));
select pg_temp.chk('admin aal1: لا يرى كل الملفات', (select count(*) from public.profiles) = 1);
reset role;

-- ===== admin مع 2FA (aal2) =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003', 'aal2');
select pg_temp.chk('admin aal2: يقرأ الإعدادات الخاصة', (select count(*) from public.settings where key='t.private') = 1);
select pg_temp.chk('admin aal2: يعدّل الإعدادات', not pg_temp.denied($$update public.settings set value='{"a":3}' where key='t.private'$$));
select pg_temp.chk('admin aal2: ينشئ قسماً', not pg_temp.denied($$insert into public.categories (slug,name) values ('t-adm2','x')$$));
select pg_temp.chk('admin aal2: يرى كل الملفات', (select count(*) from public.profiles where email like 't-%@x.local') = 4);
select pg_temp.chk('admin aal2: يرقّي مستخدماً عبر RPC', not pg_temp.denied($$select public.admin_update_profile('aaaaaaaa-0000-0000-0000-000000000001','moderator',true,null,'اسم')$$));
select pg_temp.chk('admin aal2: لا ينزل صلاحياته', pg_temp.denied($$select public.admin_update_profile('aaaaaaaa-0000-0000-0000-000000000003','customer',true,null,null)$$));
select pg_temp.chk('admin aal2: لا يوقف نفسه', pg_temp.denied($$select public.admin_update_profile('aaaaaaaa-0000-0000-0000-000000000003','admin',false,null,null)$$));
reset role;
select pg_temp.chk('الترقية أثّرت فعلاً', (select role = 'moderator' from public.profiles where id='aaaaaaaa-0000-0000-0000-000000000001'));

-- ===== auditor (لا صلاحيات إدارة محتوى) =====
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004', 'aal2');
select pg_temp.chk('auditor: لا يكتب في products', pg_temp.denied($$update public.products set name='x' where slug='t-p-visible'$$));
select pg_temp.chk('auditor: لا يرى المخفي', (select count(*) from public.products where slug like 't-p-%') = 1);
select pg_temp.chk('auditor: لا يكتب في categories', pg_temp.denied($$insert into public.categories (slug,name) values ('t-aud','x')$$));
select pg_temp.chk('auditor: لا يرى الإعدادات الخاصة', (select count(*) from public.settings where key='t.private') = 0);
reset role;

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
       coalesce(string_agg(name, ' | ') filter (where not ok), '-') as failures from _t;
rollback;
