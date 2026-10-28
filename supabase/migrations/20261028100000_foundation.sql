-- المرحلة 1 / Migration 1: الأساس (الهوية، الإعدادات، الفروع، طرق الدفع)
-- ملاحظة: الدوال المساعدة للـ RLS في schema خاص `private` غير مكشوف عبر API.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
grant usage on schema private to anon, authenticated;

create type public.app_role     as enum ('customer','moderator','admin','auditor');
create type public.channel_type as enum ('web','facebook','whatsapp','telegram');
create type public.availability as enum ('available','limited','out_of_stock','made_to_order');

-- trigger عام لتحديث updated_at
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ===== الفروع =====
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  address text,
  phone text,
  whatsapp text,
  map_url text,
  lat numeric(9,6),
  lng numeric(9,6),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ===== الهوية =====
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  phone text unique not null,
  full_name text,
  role public.app_role not null default 'customer',
  branch_id uuid references public.branches(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function private.set_updated_at();

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  full_name text,
  profile_id uuid unique references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.customer_identities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel public.channel_type not null,
  external_id text not null,
  display_name text,
  created_at timestamptz not null default now(),
  unique (channel, external_id)
);
create index on public.customer_identities (customer_id);

-- رموز OTP: service_role فقط (لا سياسات)
create table public.otp_requests (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  channel public.channel_type not null check (channel in ('whatsapp','telegram')),
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.otp_requests (phone, created_at desc);

-- ===== دوال الصلاحيات (خاصة) =====
create function private.app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = (select auth.uid()) and p.is_active),
    'customer'::public.app_role)
$$;

create function private.is_aal2() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

-- المشرف أو الإداري (الإداري يتطلب 2FA)
create function private.staff_ok() returns boolean
language sql stable set search_path = '' as $$
  select case private.app_role()
    when 'moderator' then true
    when 'admin' then private.is_aal2()
    else false end
$$;

-- الإداري فقط مع 2FA
create function private.admin_ok() returns boolean
language sql stable set search_path = '' as $$
  select private.app_role() = 'admin' and private.is_aal2()
$$;

grant execute on function private.app_role(), private.is_aal2(), private.staff_ok(), private.admin_ok()
  to anon, authenticated;

-- ===== إنشاء الملف الشخصي تلقائياً عند أول دخول =====
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_phone text := coalesce(new.phone, new.raw_user_meta_data ->> 'phone');
begin
  if v_phone is null then return new; end if;
  -- الدور دائماً customer؛ الترقية عبر admin_update_profile فقط
  insert into public.profiles (id, phone) values (new.id, v_phone);
  insert into public.customers (phone, profile_id) values (v_phone, new.id)
    on conflict (phone) do update set profile_id = excluded.profile_id;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- تعديل المستخدمين: للإداري فقط (لا تصعيد ذاتي للصلاحيات)
create function public.admin_update_profile(
  p_id uuid, p_role public.app_role, p_is_active boolean, p_branch_id uuid, p_full_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.admin_ok() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_id = (select auth.uid()) and (p_role <> 'admin' or not p_is_active) then
    raise exception 'cannot demote self' using errcode = '42501';
  end if;
  update public.profiles
     set role = p_role, is_active = p_is_active, branch_id = p_branch_id, full_name = p_full_name
   where id = p_id;
end $$;
revoke execute on function public.admin_update_profile from public, anon;
grant execute on function public.admin_update_profile to authenticated;

-- ===== الإعدادات =====
create table public.settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.branch_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = الأحد
  opens_at time not null,
  closes_at time not null
);
create index on public.branch_hours (branch_id, weekday);

create table public.branch_holidays (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade, -- null = كل الفروع
  on_date date not null,
  reason text
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  instructions text,
  details jsonb not null default '{}',
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fee numeric(10,2) not null default 0,
  is_active boolean not null default false
);

-- ===== RLS =====
do $$ declare t text; begin
  foreach t in array array['profiles','customers','customer_identities','otp_requests','settings',
    'branches','branch_hours','branch_holidays','payment_methods','delivery_zones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop; end $$;

-- profiles
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_admin on public.profiles for select to authenticated
  using (private.admin_ok());
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- customers
create policy customers_select_own on public.customers for select to authenticated
  using (profile_id = (select auth.uid()));
create policy customers_select_staff on public.customers for select to authenticated
  using (private.staff_ok());
create policy customers_update_staff on public.customers for update to authenticated
  using (private.staff_ok()) with check (private.staff_ok());

create policy identities_select_own on public.customer_identities for select to authenticated
  using (customer_id in (select c.id from public.customers c where c.profile_id = (select auth.uid())));
create policy identities_select_staff on public.customer_identities for select to authenticated
  using (private.staff_ok());

-- settings: العام للجميع، والباقي للإداري
create policy settings_public_read on public.settings for select to anon, authenticated
  using (is_public);
create policy settings_admin_all on public.settings for all to authenticated
  using (private.admin_ok()) with check (private.admin_ok());

-- الفروع: القراءة العامة للنشطة
create policy branches_public_read on public.branches for select to anon, authenticated
  using (is_active);
create policy branches_admin_all on public.branches for all to authenticated
  using (private.admin_ok()) with check (private.admin_ok());

create policy hours_public_read on public.branch_hours for select to anon, authenticated using (true);
create policy hours_admin_all on public.branch_hours for all to authenticated
  using (private.admin_ok()) with check (private.admin_ok());
create policy holidays_public_read on public.branch_holidays for select to anon, authenticated using (true);
create policy holidays_admin_all on public.branch_holidays for all to authenticated
  using (private.admin_ok()) with check (private.admin_ok());

-- طرق الدفع وتوصيل: إداري فقط الآن (العرض العام في المرحلة 2 عبر RPC)
create policy payment_methods_admin_all on public.payment_methods for all to authenticated
  using (private.admin_ok()) with check (private.admin_ok());
create policy delivery_zones_admin_all on public.delivery_zones for all to authenticated
  using (private.admin_ok()) with check (private.admin_ok());
