-- صندوق المحادثات للموظفين: القراءة بـ RLS ودوال الرد/الاستلام/الإعادة للبوت/الإغلاق.
-- تُشغَّل داخل معاملة وتُلغى. يجب failed = 0. التشغيل: psql أو Supabase MCP execute_sql (جلسة واحدة).
-- (النتيجة المسجّلة: 14/14 على مشروع التطوير بعد حصر فحص الصلاحيات بمخطط public.)
begin;
create temp table _t (name text, ok boolean); grant all on _t to public;
create temp table _ctx (k text primary key, v text); grant all on _ctx to public;
create function pg_temp.chk(p_name text, p_ok boolean) returns void language plpgsql security definer as $$ begin insert into _t values (p_name, coalesce(p_ok,false)); end $$;
create function pg_temp.err_is(p_sql text, p_like text) returns boolean language plpgsql as $$ begin execute p_sql; return false; exception when others then return sqlerrm like p_like; end $$;
create function pg_temp.c(p_k text) returns text language sql stable as $$ select v from _ctx where k = p_k $$;
create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true); execute 'set local role authenticated'; end $$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','authenticated','authenticated','t-cust@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','authenticated','authenticated','t-mod@x.local','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000005','authenticated','authenticated','t-aud@x.local','{}');
update public.profiles set role='moderator' where id='aaaaaaaa-0000-0000-0000-000000000003';
update public.profiles set role='auditor' where id='aaaaaaaa-0000-0000-0000-000000000005';
insert into public.conversations (id, channel, external_thread_id, status, last_customer_message_at)
  values ('bbbbbbbb-0000-0000-0000-000000000001','whatsapp','t-inbox-1','waiting', now());
insert into public.messages (conversation_id, direction, sender, body) values ('bbbbbbbb-0000-0000-0000-000000000001','inbound','customer','مرحبا');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.chk('الزبون لا يرى المحادثات', (select count(*) = 0 from public.conversations) and (select count(*) = 0 from public.messages));
select pg_temp.chk('الزبون لا يرد', pg_temp.err_is($$select public.staff_reply('bbbbbbbb-0000-0000-0000-000000000001','x')$$, '%not_allowed%'));
reset role;
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000005', 'aal2');
select pg_temp.chk('المدقق لا يرى المحادثات ولا يرد', (select count(*) = 0 from public.conversations) and pg_temp.err_is($$select public.staff_reply('bbbbbbbb-0000-0000-0000-000000000001','x')$$, '%not_allowed%'));
reset role;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select pg_temp.chk('المشرف يرى المحادثة ورسائلها', (select count(*) = 1 from public.conversations) and (select count(*) = 1 from public.messages));
select pg_temp.chk('رد فارغ مرفوض', pg_temp.err_is($$select public.staff_reply('bbbbbbbb-0000-0000-0000-000000000001','   ')$$, '%invalid_message%'));
insert into _ctx select 'msg', public.staff_reply('bbbbbbbb-0000-0000-0000-000000000001','أهلاً، كيف أساعدك؟')::text;
select pg_temp.chk('المشرف لا يكتب مباشرة في messages', not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'messages' and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')));
reset role;

select pg_temp.chk('الرد: يصبح human ويُسند ويُسجَّل أول رد', (select status = 'human' and assigned_to = 'aaaaaaaa-0000-0000-0000-000000000003' and first_staff_response_at is not null and waiting_since is null from public.conversations where id = 'bbbbbbbb-0000-0000-0000-000000000001'));
select pg_temp.chk('الرد: رسالة صادرة من staff', exists (select 1 from public.messages where id = pg_temp.c('msg')::uuid and direction = 'outbound' and sender = 'staff' and sender_profile_id = 'aaaaaaaa-0000-0000-0000-000000000003'));
select pg_temp.chk('outbox: staff.reply مع نافذة واتساب مفتوحة', exists (select 1 from public.outbox_events where event_type = 'staff.reply' and payload ->> 'message_id' = pg_temp.c('msg') and (payload ->> 'whatsapp_window_open')::boolean));

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select public.return_to_bot('bbbbbbbb-0000-0000-0000-000000000001');
reset role;
select pg_temp.chk('إعادة للبوت: status=bot وبلا إسناد', (select status = 'bot' and assigned_to is null from public.conversations where id = 'bbbbbbbb-0000-0000-0000-000000000001'));
select pg_temp.chk('outbox: conversation.returned_to_bot', exists (select 1 from public.outbox_events where event_type = 'conversation.returned_to_bot'));
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select public.assign_conversation('bbbbbbbb-0000-0000-0000-000000000001');
select public.close_conversation('bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.chk('رد على محادثة مغلقة مرفوض', pg_temp.err_is($$select public.staff_reply('bbbbbbbb-0000-0000-0000-000000000001','x')$$, '%conversation_closed%'));
select pg_temp.chk('محادثة غير موجودة', pg_temp.err_is($$select public.close_conversation(gen_random_uuid())$$, '%conversation_not_found%'));
reset role;
select pg_temp.chk('الإغلاق مطبّق', (select status = 'closed' from public.conversations where id = 'bbbbbbbb-0000-0000-0000-000000000001'));

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, coalesce(string_agg(name,' | ') filter (where not ok),'-') as failures from _t;
rollback;
