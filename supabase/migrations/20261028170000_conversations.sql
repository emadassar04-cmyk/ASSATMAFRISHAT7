-- المرحلة 3 / Migration 1: المحادثات والرسائل ونصوص البوت وقاعدة المعرفة والمنشورات.
-- الكتابة من البوت/n8n عبر دوال service_role (Migration 2)؛ الموظف يرد/يحوّل عبر دوال أدناه. لا تعديل مباشر.
-- قاعدة المعرفة: بحث نصي كامل الآن. عمود المتجهات (pgvector) يُضاف بعد اختيار مزوّد الذكاء الاصطناعي (البعد يتبعه).

create type public.conv_status as enum ('bot', 'human', 'waiting', 'closed');
create type public.msg_direction as enum ('inbound', 'outbound');
create type public.msg_sender as enum ('customer', 'bot', 'staff', 'system');
create type public.post_status as enum ('draft', 'pending_approval', 'editing', 'approved', 'published', 'rejected', 'failed');

-- نصوص البوت القابلة للتعديل (تدعم متغيرات مثل {{opening_time}})
create table public.bot_messages (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,59}$'),
  body text not null check (char_length(body) between 1 and 2000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger trg_bot_messages_updated before update on public.bot_messages
  for each row execute function private.set_updated_at();
insert into public.bot_messages (key, body) values
  ('greeting', 'أهلاً فيك 🌷 كيف بقدر أساعدك؟'),
  ('handoff_open', 'تمام 🌷 حولتك لأحد موظفينا، رح يرد عليك بأقرب وقت.'),
  ('handoff_after_hours', 'أهلاً فيك 🌷 دوامنا انتهى اليوم، وأحد موظفينا رح يتواصل معك بكرة الساعة {{opening_time}} إن شاء الله. بتقدر تكمل أسئلتك معي هلأ.'),
  ('unknown_answer', 'ما عندي معلومة مؤكدة عن هذا الموضوع. بحوّلك لأحد موظفينا ليساعدك.')
on conflict (key) do nothing;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  channel public.channel_type not null,
  external_thread_id text not null check (char_length(external_thread_id) between 1 and 200),
  status public.conv_status not null default 'bot',
  assigned_to uuid references public.profiles(id) on delete set null,
  handoff_reason text,
  waiting_since timestamptz,                 -- طلب موظف خارج الدوام
  first_staff_response_at timestamptz,       -- لحساب متوسط وقت الرد
  handoff_at timestamptz,
  last_customer_message_at timestamptz,      -- لنافذة واتساب 24 ساعة
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (channel, external_thread_id)
);
create index on public.conversations (status, last_message_at desc);
create index on public.conversations (customer_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction public.msg_direction not null,
  sender public.msg_sender not null,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  body text check (char_length(body) <= 8000),
  attachments jsonb not null default '[]',
  external_id text,                          -- معرّف الرسالة لدى المنصة (منع التكرار)
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (conversation_id, external_id)
);
create index on public.messages (conversation_id, created_at);

-- قاعدة المعرفة (أسئلة شائعة/سياسات/معلومات) للبوت
create table public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('faq', 'policy', 'info')),
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 8000),
  is_active boolean not null default true,
  search tsvector generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))) stored,
  updated_at timestamptz not null default now()
);
create index on public.kb_documents using gin (search);
create index on public.kb_documents using gin (title gin_trgm_ops);
create trigger trg_kb_updated before update on public.kb_documents
  for each row execute function private.set_updated_at();

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  hashtags text[] not null default '{}',
  image_paths text[] not null default '{}',
  targets text[] not null default '{facebook}',
  status public.post_status not null default 'draft',
  requested_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  telegram_approval_msg_id text,
  fb_post_id text, fb_post_url text, tg_message_id text,
  reject_reason text, error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_social_posts_updated before update on public.social_posts
  for each row execute function private.set_updated_at();

-- ===== RLS =====
do $$ declare t text; begin
  foreach t in array array['bot_messages', 'conversations', 'messages', 'kb_documents', 'social_posts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop; end $$;

-- المحادثات والرسائل: المشرف والإداري (2FA) يقرآن؛ لا كتابة مباشرة (دوال فقط)
create policy conversations_select_staff on public.conversations for select to authenticated using (private.staff_ok());
create policy messages_select_staff on public.messages for select to authenticated using (private.staff_ok());

-- نصوص البوت: الإداري (2FA)
create policy bot_messages_admin_all on public.bot_messages for all to authenticated
  using (private.admin_ok()) with check (private.admin_ok());
grant insert, update, delete on public.bot_messages to authenticated;

-- قاعدة المعرفة: المشرف والإداري يقرآن ويضيفان ويعدّلان؛ الحذف للإداري
create policy kb_select_staff on public.kb_documents for select to authenticated using (private.staff_ok());
create policy kb_insert_staff on public.kb_documents for insert to authenticated with check (private.staff_ok());
create policy kb_update_staff on public.kb_documents for update to authenticated using (private.staff_ok()) with check (private.staff_ok());
create policy kb_delete_admin on public.kb_documents for delete to authenticated using (private.admin_ok());
grant insert, update on public.kb_documents to authenticated;
grant delete on public.kb_documents to authenticated;

-- المنشورات: القراءة للمشرف والإداري؛ الكتابة والموافقات عبر دوال (لاحقاً)
create policy social_posts_select_staff on public.social_posts for select to authenticated using (private.staff_ok());

-- ===== دوال الموظف =====
-- رد الموظف: يُسجَّل ثم يُرسل إلى القناة عبر n8n (Outbox). نافذة واتساب 24 ساعة تُذكر في الحدث.
create function public.staff_reply(p_conv uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.conversations; v_body text := btrim(coalesce(p_body, '')); v_msg uuid := gen_random_uuid();
begin
  if not private.staff_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'invalid_message'; end if;
  select * into c from public.conversations where id = p_conv for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if c.status = 'closed' then raise exception 'conversation_closed'; end if;

  insert into public.messages (id, conversation_id, direction, sender, sender_profile_id, body)
  values (v_msg, c.id, 'outbound', 'staff', (select auth.uid()), v_body);
  update public.conversations
     set status = 'human', assigned_to = coalesce(assigned_to, (select auth.uid())),
         first_staff_response_at = coalesce(first_staff_response_at, now()), last_message_at = now(),
         handoff_at = coalesce(handoff_at, now()), waiting_since = null
   where id = c.id;
  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('staff.reply', jsonb_build_object('conversation_id', c.id, 'message_id', v_msg, 'channel', c.channel,
            'external_thread_id', c.external_thread_id, 'body', v_body,
            'whatsapp_window_open', c.channel = 'whatsapp' and c.last_customer_message_at > now() - interval '24 hours'),
          'staff.reply:' || v_msg);
  return v_msg;
end $$;

create function public.assign_conversation(p_conv uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.staff_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.conversations set assigned_to = (select auth.uid()), status = 'human', handoff_at = coalesce(handoff_at, now()), waiting_since = null
   where id = p_conv and status <> 'closed';
  if not found then raise exception 'conversation_not_found'; end if;
end $$;

-- «إعادة للبوت»: يستأنف البوت الرد على الزبون
create function public.return_to_bot(p_conv uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.conversations;
begin
  if not private.staff_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into c from public.conversations where id = p_conv for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if c.status = 'closed' then raise exception 'conversation_closed'; end if;
  update public.conversations set status = 'bot', assigned_to = null, waiting_since = null where id = c.id;
  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('conversation.returned_to_bot', jsonb_build_object('conversation_id', c.id, 'channel', c.channel),
          'conv.bot:' || c.id || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;

create function public.close_conversation(p_conv uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.staff_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.conversations set status = 'closed' where id = p_conv;
  if not found then raise exception 'conversation_not_found'; end if;
end $$;

revoke all on function public.staff_reply(uuid, text) from public, anon;
revoke all on function public.assign_conversation(uuid) from public, anon;
revoke all on function public.return_to_bot(uuid) from public, anon;
revoke all on function public.close_conversation(uuid) from public, anon;
grant execute on function public.staff_reply(uuid, text) to authenticated;
grant execute on function public.assign_conversation(uuid) to authenticated;
grant execute on function public.return_to_bot(uuid) to authenticated;
grant execute on function public.close_conversation(uuid) to authenticated;

-- تدقيق تعديلات نصوص البوت وقاعدة المعرفة
create trigger trg_audit after insert or update or delete on public.bot_messages
  for each row execute function private.audit_row_change('bot_message');
create trigger trg_audit after insert or update or delete on public.kb_documents
  for each row execute function private.audit_row_change('kb_document');
