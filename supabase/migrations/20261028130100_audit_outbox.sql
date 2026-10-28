-- المرحلة 2 / Migration 2: Outbox (لا يضيع حدث إذا توقف n8n) + سجل التدقيق (Append-Only).

create type public.outbox_status as enum ('pending','sent','failed','dead');

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,               -- order.created, payment.receipt_uploaded, payment.reviewed, order.status_changed, audit.sensitive ...
  payload jsonb not null,
  idempotency_key text unique not null,
  status public.outbox_status not null default 'pending',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.outbox_events (status, next_attempt_at) where status in ('pending','failed');

create table public.processed_webhook_events (
  provider text not null,
  external_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, external_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,                                   -- لا FK: يبقى السجل حتى لو حُذف المستخدم
  actor_name text,
  actor_role public.app_role,
  branch_id uuid,
  entity_type text not null,
  entity_id text,
  action text not null,                            -- insert | update | delete | status_change | price_change
  old_values jsonb,
  new_values jsonb,
  is_sensitive boolean not null default false,
  source text not null default 'dashboard'         -- dashboard | system
);
create index on public.audit_log (occurred_at desc);
create index on public.audit_log (actor_id, occurred_at desc);
create index on public.audit_log (entity_type, occurred_at desc);
create index on public.audit_log (branch_id, occurred_at desc);
create index on public.audit_log (is_sensitive, occurred_at desc) where is_sensitive;

-- ===== RLS =====
alter table public.outbox_events enable row level security;
alter table public.outbox_events force row level security;
alter table public.processed_webhook_events enable row level security;
alter table public.processed_webhook_events force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

revoke all on public.outbox_events, public.processed_webhook_events, public.audit_log from anon, authenticated;
grant select on public.outbox_events, public.audit_log to authenticated;

-- الإداري يرى الأحداث المتعثرة فقط
create policy outbox_admin_failed on public.outbox_events for select to authenticated
  using (private.admin_ok() and status in ('failed','dead'));
-- الإداري والمدقق (مع 2FA) يقرآن السجل؛ لا سياسة كتابة لأي دور
create policy audit_select on public.audit_log for select to authenticated
  using (private.admin_ok() or (private.app_role() = 'auditor' and private.is_aal2()));

-- ===== منع التعديل/الحذف/التفريغ حتى من service_role =====
create function private.audit_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'audit_log is append-only' using errcode = '42501'; end $$;
create trigger trg_audit_log_immutable before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();
create trigger trg_audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_immutable();
revoke all on public.audit_log from service_role;
grant select on public.audit_log to service_role;

-- ===== trigger عام للتدقيق: يُسجَّل القديم والجديد (الأعمدة المتغيّرة فقط عند التعديل) =====
create function private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_entity text := tg_argv[0];
  v_actor uuid := (select auth.uid());
  v_name text; v_role public.app_role; v_actor_branch uuid;
  v_old jsonb; v_new jsonb; v_row jsonb;
  v_action text; v_sensitive boolean := false;
  v_branch uuid; v_audit_id bigint;
begin
  if v_actor is not null then
    select coalesce(p.full_name, p.email), p.role, p.branch_id into v_name, v_role, v_actor_branch
      from public.profiles p where p.id = v_actor;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'insert'; v_new := to_jsonb(new); v_row := v_new;
  elsif tg_op = 'DELETE' then
    v_action := 'delete'; v_old := to_jsonb(old); v_row := v_old;
  else
    v_old := (select coalesce(jsonb_object_agg(o.key, o.value), '{}'::jsonb)
                from jsonb_each(to_jsonb(old)) o where (to_jsonb(new) -> o.key) is distinct from o.value) - 'updated_at';
    v_new := (select coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb)
                from jsonb_each(to_jsonb(new)) n where (to_jsonb(old) -> n.key) is distinct from n.value) - 'updated_at';
    if v_new = '{}'::jsonb then return new; end if;      -- تغيير updated_at وحده لا يُسجَّل
    v_action := 'update'; v_row := to_jsonb(new);
  end if;

  -- الحالات الحساسة (تنبيه تلجرام لاحقاً عبر outbox)
  if v_entity = 'product' then
    if tg_op = 'DELETE' then v_sensitive := true;
    elsif tg_op = 'UPDATE' and v_new ? 'base_price' then v_action := 'price_change'; v_sensitive := true; end if;
  elsif v_entity = 'variant' then
    if tg_op = 'UPDATE' and v_new ? 'price' then v_action := 'price_change'; v_sensitive := true; end if;
    if tg_op = 'DELETE' then v_sensitive := true; end if;
  elsif v_entity = 'order' then
    if tg_op = 'UPDATE' and v_new ? 'status' then v_action := 'status_change'; v_sensitive := (v_new ->> 'status') = 'cancelled'; end if;
  elsif v_entity = 'payment' then
    if tg_op = 'UPDATE' and v_new ? 'status' then v_action := 'status_change'; v_sensitive := (v_new ->> 'status') = 'confirmed'; end if;
  elsif v_entity = 'user' then
    if tg_op = 'UPDATE' and v_new ? 'role' then v_action := 'role_change'; v_sensitive := true; end if;
  end if;

  v_branch := coalesce(nullif(v_row ->> 'branch_id', '')::uuid, v_actor_branch);

  insert into public.audit_log (actor_id, actor_name, actor_role, branch_id, entity_type, entity_id, action,
                                old_values, new_values, is_sensitive, source)
  values (v_actor, v_name, v_role, v_branch, v_entity,
          coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'provider'),
          v_action, v_old, v_new, v_sensitive, case when v_actor is null then 'system' else 'dashboard' end)
  returning id into v_audit_id;

  if v_sensitive then
    insert into public.outbox_events (event_type, payload, idempotency_key)
    values ('audit.sensitive',
            jsonb_build_object('audit_id', v_audit_id, 'entity_type', v_entity, 'entity_id', coalesce(v_row ->> 'id', v_row ->> 'key'),
                               'action', v_action, 'actor_name', v_name, 'old_values', v_old, 'new_values', v_new, 'branch_id', v_branch),
            'audit:' || v_audit_id);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function private.audit_row_change() from public, anon, authenticated;

do $$ declare r record; begin
  for r in select * from (values
    ('products','product'), ('product_variants','variant'), ('categories','category'), ('offers','offer'),
    ('settings','setting'), ('branches','branch'), ('payment_methods','payment_method'), ('delivery_zones','delivery_zone'),
    ('profiles','user'), ('orders','order'), ('payments','payment'), ('custom_orders','custom_order'), ('integrations','integration')
  ) as t(tbl, ent) loop
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function private.audit_row_change(%L)', r.tbl, r.ent);
  end loop; end $$;
