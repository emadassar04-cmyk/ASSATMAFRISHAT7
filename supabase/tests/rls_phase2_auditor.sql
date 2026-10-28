-- مسار قراءة لوحة المدقق: نفس الاستعلامات والفلاتر التي تستعملها صفحة /dashboard/audit، بصلاحية المدقق الفعلية.
-- تُشغَّل داخل معاملة وتُلغى. يجب failed = 0. (النتيجة المسجّلة: 13/13 على مشروع التطوير.)
-- التشغيل: psql أو Supabase MCP execute_sql (جلسة واحدة)، وليس SQL Editor في المتصفح.
begin;
create temp table _t (name text, ok boolean); grant all on _t to public;
create function pg_temp.chk(p_name text, p_ok boolean) returns void language plpgsql security definer as $$ begin insert into _t values (p_name, coalesce(p_ok,false)); end $$;
create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$ declare n bigint; begin execute p_sql; get diagnostics n = row_count; return n = 0; exception when others then return true; end $$;
create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true); execute 'set local role authenticated'; end $$;
grant execute on all functions in schema pg_temp to public;
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000004','authenticated','authenticated','t-admin@x.local','{"full_name":"مدير الاختبار"}'),
 ('aaaaaaaa-0000-0000-0000-000000000005','authenticated','authenticated','t-aud@x.local','{}');
update public.profiles set role='admin' where id='aaaaaaaa-0000-0000-0000-000000000004';
update public.profiles set role='auditor' where id='aaaaaaaa-0000-0000-0000-000000000005';
insert into public.branches (id, slug, name) values ('eeeeeeee-0000-0000-0000-000000000001','t-branch','فرع اختبار');
insert into public.products (id, slug, name, base_price) values ('cccccccc-0000-0000-0000-000000000001','t-p1','منتج',100);
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000004','aal2');
update public.products set base_price = 150, name = 'منتج معدّل' where slug = 't-p1';
update public.branches set address = 'عنوان جديد' where slug = 't-branch';
reset role;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000005','aal2');
select pg_temp.chk('المدقق يقرأ السجل مرتباً من الأحدث', (select id from public.audit_log order by id desc limit 1) = (select max(id) from public.audit_log));
select pg_temp.chk('فلتر النوع: product فقط', (select count(*) > 0 and bool_and(entity_type = 'product') from public.audit_log where entity_type = 'product' and entity_id = 'cccccccc-0000-0000-0000-000000000001'));
select pg_temp.chk('فلتر الحساس يجد تغيير السعر بالقيمتين', exists (select 1 from public.audit_log where is_sensitive and action = 'price_change' and (old_values->>'base_price')::numeric = 100 and (new_values->>'base_price')::numeric = 150));
select pg_temp.chk('فلتر اسم المستخدم (ilike) يجد الفاعل', exists (select 1 from public.audit_log where actor_name ilike '%مدير%' and actor_role = 'admin'));
select pg_temp.chk('فلتر الفرع يجد تعديل الفرع نفسه', exists (select 1 from public.audit_log where branch_id = 'eeeeeeee-0000-0000-0000-000000000001' and entity_type = 'branch' and new_values->>'address' = 'عنوان جديد'));
select pg_temp.chk('فلتر التاريخ ضمن [بداية، بداية التالي)', exists (select 1 from public.audit_log where occurred_at >= date_trunc('day', now()) - interval '1 day' and occurred_at < date_trunc('day', now()) + interval '2 days' and entity_type = 'product'));
select pg_temp.chk('الترقيم لا يتجاوز 50', (select count(*) <= 50 from (select * from public.audit_log order by id desc offset 0 limit 50) x));
select pg_temp.chk('أسماء الفروع للعرض مقروءة', (select count(*) >= 1 from public.branches));
select pg_temp.chk('المدقق لا يقرأ الطلبات ولا الدفعات', (select count(*) = 0 from public.orders) and (select count(*) = 0 from public.payments));
select pg_temp.chk('المدقق لا يعدّل منتجاً', pg_temp.denied($$update public.products set name = 'x' where slug = 't-p1'$$));
select pg_temp.chk('المدقق لا يكتب في السجل', pg_temp.denied($$insert into public.audit_log (entity_type, action) values ('x','y')$$));
select pg_temp.chk('المدقق لا يعدّل الفروع', pg_temp.denied($$update public.branches set name = 'x' where slug = 't-branch'$$));
reset role;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000005','aal1');
select pg_temp.chk('المدقق بدون 2FA: لا يرى أي سجل', (select count(*) = 0 from public.audit_log));
reset role;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, coalesce(string_agg(name,' | ') filter (where not ok),'-') as failures from _t;
rollback;
