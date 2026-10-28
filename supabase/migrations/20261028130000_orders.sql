-- المرحلة 2 / Migration 1: الطلبات والدفع (مع التوصيل) وطلبات التفصيل.
-- الكتابة على orders/payments/order_items تتم حصراً عبر RPC (Migration 3)؛ الزبون لا يكتب مباشرة (يمنع تزوير السعر).

create type public.fulfillment_type as enum ('pickup','delivery');
create type public.order_status as enum (
  'new','awaiting_payment_confirmation','confirmed','in_preparation',
  'ready_for_pickup','out_for_delivery','picked_up','delivered','cancelled');
create type public.payment_status as enum ('pending','confirmed','rejected');
create type public.custom_status as enum ('new','quoted','deposit_pending','in_progress','ready','delivered','cancelled');

create sequence public.order_number_seq start 1001;

-- التوصيل: يُفعَّل/يُعطَّل من الإعدادات، والمناطق والأسعار من جدول delivery_zones (لا قيم في الكود)
insert into public.settings (key, value, is_public) values ('delivery', '{"enabled":true}', true)
  on conflict (key) do nothing;

-- العميل الحالي (من الجلسة)
create function private.my_customer_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.customers c
   join public.profiles p on p.id = c.profile_id and p.is_active
  where c.profile_id = (select auth.uid())
$$;
grant execute on function private.my_customer_id() to authenticated;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null default ('ORD-' || nextval('public.order_number_seq')),
  customer_id uuid not null references public.customers(id),
  branch_id uuid not null references public.branches(id),            -- فرع الاستلام/مصدر المخزون
  source_channel public.channel_type not null,
  fulfillment public.fulfillment_type not null default 'pickup',
  delivery_zone_id uuid references public.delivery_zones(id),
  delivery_address text,
  contact_phone text not null,
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  status public.order_status not null default 'new',
  payment_method_id uuid references public.payment_methods(id),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  total numeric(12,2) not null check (total >= 0),
  customer_note text,
  exchange_policy_accepted_at timestamptz not null,
  exchange_policy_version text not null,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fulfillment <> 'delivery' or (delivery_zone_id is not null and delivery_address is not null))
);
create index on public.orders (customer_id, created_at desc);
create index on public.orders (branch_id, status, created_at desc);
create trigger trg_orders_updated before update on public.orders
  for each row execute function private.set_updated_at();

create table public.order_items (                    -- لقطة (Snapshot) وقت الطلب
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  options_text text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity int not null check (quantity > 0),
  line_total numeric(12,2) not null,
  stock_reserved boolean not null default false     -- هل خُصمت كمية من مخزون الفرع (يُعاد عند الإلغاء)
);
create index on public.order_items (order_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references public.profiles(id) on delete set null,   -- null = النظام/البوت
  note text,
  created_at timestamptz not null default now()
);
create index on public.order_status_history (order_id, id);

create table public.custom_orders (                  -- طلبات التفصيل
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  branch_id uuid references public.branches(id),
  source_channel public.channel_type not null,
  description text not null,
  dimensions text, material text, color text,
  reference_image_paths text[] not null default '{}',
  quoted_price numeric(12,2),
  deposit_percent numeric(5,2),
  status public.custom_status not null default 'new',
  policy_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.custom_orders (customer_id, created_at desc);
create trigger trg_custom_orders_updated before update on public.custom_orders
  for each row execute function private.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  custom_order_id uuid references public.custom_orders(id) on delete cascade,
  method_id uuid not null references public.payment_methods(id),
  amount numeric(12,2) not null check (amount > 0),
  is_deposit boolean not null default false,
  receipt_path text,                                -- Bucket خاص receipts
  status public.payment_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  check (num_nonnulls(order_id, custom_order_id) = 1)
);
create index on public.payments (status, created_at);
create index on public.payments (order_id);

-- ===== RLS =====
do $$ declare t text; begin
  foreach t in array array['orders','order_items','order_status_history','custom_orders','payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop; end $$;

-- orders: الزبون يقرأ طلباته، والإداري (2FA) يقرأ الكل. لا كتابة مباشرة لأحد (RPC فقط).
create policy orders_select_own on public.orders for select to authenticated
  using (customer_id = private.my_customer_id());
create policy orders_select_admin on public.orders for select to authenticated
  using (private.admin_ok());

-- البنود/السجل/الدفعات تتبع رؤية الطلب (RLS على orders يُطبَّق داخل exists)
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_history_select on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy payments_select_order on public.payments for select to authenticated
  using (order_id is not null and exists (select 1 from public.orders o where o.id = order_id));
create policy payments_select_custom on public.payments for select to authenticated
  using (custom_order_id is not null and exists (select 1 from public.custom_orders c where c.id = custom_order_id));

-- طلبات التفصيل: الزبون يقرأ طلباته، المشرف والإداري يقرآن ويعدّلان الحالة والسعر المعروض
create policy custom_orders_select_own on public.custom_orders for select to authenticated
  using (customer_id = private.my_customer_id());
create policy custom_orders_select_staff on public.custom_orders for select to authenticated
  using (private.staff_ok());
create policy custom_orders_update_staff on public.custom_orders for update to authenticated
  using (private.staff_ok()) with check (private.staff_ok());
grant update (status, quoted_price, deposit_percent, branch_id) on public.custom_orders to authenticated;

-- ===== مخازن خاصة (بلا سياسات: الرفع/القراءة عبر روابط موقّعة من الخادم فقط) =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('receipts', 'receipts', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('custom-refs', 'custom-refs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
