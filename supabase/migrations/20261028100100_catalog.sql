-- المرحلة 1 / Migration 2: الكتالوج (أقسام، منتجات، خصائص، Variants، مخزون الفروع، عروض)

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  slug text unique not null,
  name text not null,
  description text,
  image_path text,
  icon text,
  is_visible boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.categories (parent_id, sort_order);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  slug text unique not null,
  name text not null,
  description text,
  base_price numeric(12,2) not null check (base_price >= 0),
  is_visible boolean not null default true,
  is_featured boolean not null default false,
  is_custom_orderable boolean not null default false,
  view_count bigint not null default 0,
  search tsvector generated always as (
    to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,''))) stored,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.products (category_id) where is_visible;
create index on public.products using gin (search);
create index on public.products using gin (name extensions.gin_trgm_ops);
create trigger trg_products_updated before update on public.products
  for each row execute function private.set_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  path text not null,
  variants jsonb not null default '{}',  -- مقاسات/WebP مولّدة لاحقاً (المرحلة 4)
  alt text,
  sort_order int not null default 0
);
create index on public.product_images (product_id, sort_order);

create table public.option_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int not null default 0
);
create table public.option_values (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.option_types(id) on delete cascade,
  value text not null,
  swatch text,
  sort_order int not null default 0,
  unique (type_id, value)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text unique,
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2),
  is_active boolean not null default true,
  sort_order int not null default 0
);
create index on public.product_variants (product_id);

create table public.variant_options (
  variant_id uuid references public.product_variants(id) on delete cascade,
  value_id uuid references public.option_values(id) on delete restrict,
  primary key (variant_id, value_id)
);
create index on public.variant_options (value_id);

create table public.branch_stock (
  variant_id uuid references public.product_variants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  quantity int not null default 0 check (quantity >= 0),
  low_threshold int not null default 2,
  status public.availability not null default 'available',
  updated_at timestamptz not null default now(),
  primary key (variant_id, branch_id)
);
create index on public.branch_stock (branch_id, status);

-- الحالة تُحسب تلقائياً من الكمية، ما عدا "حسب الطلب" التي تُحدَّد يدوياً
create function private.compute_stock_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  if new.status <> 'made_to_order' then
    new.status := case
      when new.quantity <= 0 then 'out_of_stock'::public.availability
      when new.quantity <= new.low_threshold then 'limited'::public.availability
      else 'available'::public.availability end;
  end if;
  return new;
end $$;
create trigger trg_stock_status before insert or update on public.branch_stock
  for each row execute function private.compute_stock_status();

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_path text,
  discount_type text check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2),
  starts_at timestamptz,
  ends_at timestamptz,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.offer_products (
  offer_id uuid references public.offers(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  primary key (offer_id, product_id)
);
create index on public.offer_products (product_id);

create table public.favorites (
  customer_id uuid references public.customers(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, product_id)
);

create index on public.favorites (product_id);

create table public.product_views (
  product_id uuid references public.products(id) on delete cascade,
  day date not null default current_date,
  views int not null default 0,
  primary key (product_id, day)
);

-- ===== RLS =====
do $$ declare t text; begin
  foreach t in array array['categories','products','product_images','option_types','option_values',
    'product_variants','variant_options','branch_stock','offers','offer_products','favorites','product_views'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop; end $$;

-- قراءة عامة للمرئي، وإدارة كاملة للمشرف والإداري
create policy categories_public_read on public.categories for select to anon, authenticated using (is_visible);
create policy categories_staff_all on public.categories for all to authenticated
  using (private.staff_ok()) with check (private.staff_ok());

create policy products_public_read on public.products for select to anon, authenticated using (is_visible);
create policy products_staff_all on public.products for all to authenticated
  using (private.staff_ok()) with check (private.staff_ok());

create policy images_public_read on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_visible));
create policy images_staff_all on public.product_images for all to authenticated
  using (private.staff_ok()) with check (private.staff_ok());

create policy opt_types_public_read on public.option_types for select to anon, authenticated using (true);
create policy opt_types_staff_all on public.option_types for all to authenticated
  using (private.staff_ok()) with check (private.staff_ok());
create policy opt_values_public_read on public.option_values for select to anon, authenticated using (true);
create policy opt_values_staff_all on public.option_values for all to authenticated
  using (private.staff_ok()) with check (private.staff_ok());

create policy variants_public_read on public.product_variants for select to anon, authenticated
  using (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_visible));
create policy variants_staff_all on public.product_variants for all to authenticated
  using (private.staff_ok()) with check (private.staff_ok());
create policy variant_opts_public_read on public.variant_options for select to anon, authenticated
  using (exists (select 1 from public.product_variants v where v.id = variant_id and v.is_active));
create policy variant_opts_staff_all on public.variant_options for all to authenticated
  using (private.staff_ok()) with check (private.staff_ok());

-- المخزون (الكميات) للموظفين فقط؛ العام يرى الحالة عبر RPC
create policy stock_staff_all on public.branch_stock for all to authenticated
  using (private.staff_ok()) with check (private.staff_ok());

create policy offers_public_read on public.offers for select to anon, authenticated
  using (is_visible and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()));
create policy offers_staff_all on public.offers for all to authenticated
  using (private.staff_ok()) with check (private.staff_ok());
create policy offer_products_public_read on public.offer_products for select to anon, authenticated using (true);
create policy offer_products_staff_all on public.offer_products for all to authenticated
  using (private.staff_ok()) with check (private.staff_ok());

create policy favorites_own on public.favorites for all to authenticated
  using (customer_id in (select c.id from public.customers c where c.profile_id = (select auth.uid())))
  with check (customer_id in (select c.id from public.customers c where c.profile_id = (select auth.uid())));

-- المشاهدات: إداري فقط للقراءة (الكتابة عبر RPC)
create policy views_admin_read on public.product_views for select to authenticated using (private.admin_ok());

-- ===== RPC عامة =====

-- توفر المنتج لكل Variant وفرع (بدون كشف الكميات)
create function public.get_product_availability(p_product_id uuid)
returns table (variant_id uuid, branch_id uuid, status public.availability)
language sql stable security definer set search_path = '' as $$
  select s.variant_id, s.branch_id, s.status
  from public.branch_stock s
  join public.product_variants v on v.id = s.variant_id and v.is_active
  join public.products p on p.id = v.product_id and p.is_visible
  join public.branches b on b.id = s.branch_id and b.is_active
  where p.id = p_product_id
$$;

-- بحث وفلترة المنتجات: القسم (مع الأبناء)، السعر، الفرع، التوفر
create function public.search_products(
  p_q text default null, p_category uuid default null, p_branch uuid default null,
  p_min numeric default null, p_max numeric default null,
  p_availability public.availability default null,
  p_sort text default 'new', p_limit int default 24, p_offset int default 0)
returns table (
  id uuid, slug text, name text, category_id uuid, price_from numeric, price_to numeric,
  best_status public.availability, image_path text, is_featured boolean)
language sql stable security definer set search_path = '' as $$
  with recursive cats as (
    select c.id from public.categories c where c.id = p_category
    union all
    select c.id from public.categories c join cats on c.parent_id = cats.id
  ),
  base as (
    select p.id, p.slug, p.name, p.category_id, p.is_featured, p.created_at, p.view_count,
      coalesce((select min(v.price) from public.product_variants v where v.product_id = p.id and v.is_active), p.base_price) as price_from,
      coalesce((select max(v.price) from public.product_variants v where v.product_id = p.id and v.is_active), p.base_price) as price_to,
      (select s.status from public.branch_stock s
         join public.product_variants v on v.id = s.variant_id and v.is_active
         join public.branches b on b.id = s.branch_id and b.is_active
        where v.product_id = p.id and (p_branch is null or s.branch_id = p_branch)
        order by case s.status when 'available' then 1 when 'limited' then 2
                               when 'made_to_order' then 3 else 4 end
        limit 1) as best_status,
      (select i.path from public.product_images i where i.product_id = p.id order by i.sort_order, i.id limit 1) as image_path
    from public.products p
    where p.is_visible
      and (p_category is null or p.category_id in (select cats.id from cats))
      and (p_q is null or p_q = '' or p.name ilike '%' || p_q || '%'
           or p.search @@ plainto_tsquery('simple', p_q))
  )
  select b.id, b.slug, b.name, b.category_id, b.price_from, b.price_to,
         coalesce(b.best_status, 'out_of_stock'::public.availability), b.image_path, b.is_featured
  from base b
  where (p_min is null or b.price_to >= p_min)
    and (p_max is null or b.price_from <= p_max)
    and (p_availability is null or coalesce(b.best_status, 'out_of_stock'::public.availability) = p_availability)
    and (p_branch is null or b.best_status is not null)
  order by
    case when p_sort = 'price_asc' then b.price_from end asc,
    case when p_sort = 'price_desc' then b.price_from end desc,
    case when p_sort = 'popular' then b.view_count end desc,
    b.created_at desc
  limit least(greatest(p_limit,1),100) offset greatest(p_offset,0)
$$;

-- تسجيل مشاهدة منتج (خفيف)
create function public.track_product_view(p_product_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.products where id = p_product_id and is_visible) then return; end if;
  insert into public.product_views (product_id, day, views) values (p_product_id, current_date, 1)
    on conflict (product_id, day) do update set views = public.product_views.views + 1;
  update public.products set view_count = view_count + 1 where id = p_product_id;
end $$;

revoke execute on function public.get_product_availability, public.search_products, public.track_product_view from public;
grant execute on function public.get_product_availability, public.search_products, public.track_product_view to anon, authenticated;

-- ===== التخزين (Buckets عامة للصور) =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('branding','branding',true,5242880,array['image/jpeg','image/png','image/webp','image/svg+xml']),
  ('category-images','category-images',true,5242880,array['image/jpeg','image/png','image/webp']),
  ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "staff write catalog images" on storage.objects for insert to authenticated
  with check (bucket_id in ('category-images','product-images') and private.staff_ok());
create policy "staff update catalog images" on storage.objects for update to authenticated
  using (bucket_id in ('category-images','product-images') and private.staff_ok());
create policy "staff delete catalog images" on storage.objects for delete to authenticated
  using (bucket_id in ('category-images','product-images') and private.staff_ok());
create policy "admin write branding" on storage.objects for all to authenticated
  using (bucket_id = 'branding' and private.admin_ok()) with check (bucket_id = 'branding' and private.admin_ok());
