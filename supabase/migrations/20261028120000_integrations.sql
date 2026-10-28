-- ربط واتساب للأعمال وفيسبوك من لوحة الإدارة.
-- الإعدادات غير السرية في integrations (إداري فقط، قراءة). الأسرار (التوكنات) في Supabase Vault مشفّرة،
-- ولا تُقرأ ولا تُكتب إلا عبر دوال service_role (من الخادم بعد requireAdmin) — لا تعود للمتصفح أبداً.

create table public.integrations (
  provider text primary key check (provider in ('whatsapp','facebook')),
  config jsonb not null default '{}',
  secret_names text[] not null default '{}',   -- أسماء الأسرار المحفوظة فقط، لا قيمها
  status text not null default 'not_configured' check (status in ('not_configured','saved','connected','error')),
  last_checked_at timestamptz,
  last_error text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger trg_integrations_updated before update on public.integrations
  for each row execute function private.set_updated_at();

alter table public.integrations enable row level security;
alter table public.integrations force row level security;
-- قراءة للإداري (مع 2FA) فقط. لا سياسات كتابة: الكتابة من الخادم عبر service_role.
create policy integrations_admin_select on public.integrations for select to authenticated
  using (private.admin_ok());
revoke all on public.integrations from anon, authenticated;
grant select on public.integrations to authenticated;

create function public.set_integration_secret(p_name text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_name !~ '^integration:(whatsapp|facebook):[a-z_]+$' then raise exception 'invalid secret name'; end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then perform vault.create_secret(p_value, p_name, 'integration');
  else perform vault.update_secret(v_id, p_value, p_name, 'integration'); end if;
end $$;

create function public.get_integration_secret(p_name text) returns text
language sql security definer set search_path = '' stable as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = p_name and p_name ~ '^integration:(whatsapp|facebook):[a-z_]+$'
$$;

create function public.delete_integration_secret(p_name text) returns void
language sql security definer set search_path = '' as $$
  delete from vault.secrets where name = p_name and p_name ~ '^integration:(whatsapp|facebook):[a-z_]+$'
$$;

revoke all on function public.set_integration_secret(text, text) from public, anon, authenticated;
revoke all on function public.get_integration_secret(text) from public, anon, authenticated;
revoke all on function public.delete_integration_secret(text) from public, anon, authenticated;
grant execute on function public.set_integration_secret(text, text) to service_role;
grant execute on function public.get_integration_secret(text) to service_role;
grant execute on function public.delete_integration_secret(text) to service_role;

insert into public.integrations (provider) values ('whatsapp'), ('facebook');
