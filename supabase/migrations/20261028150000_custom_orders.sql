-- المرحلة 2 / Migration 5: طلبات التفصيل والعربون. كل الكتابة عبر دوال (لا تعديل مباشر).
-- التسعير والاتفاق بعده عبر واتساب/فيسبوك كالطلبات العادية؛ العربون يُحسب من إعدادات الموقع (deposit) وقت التسعير.

alter table public.custom_orders add column contact_phone text;
alter table public.custom_orders add column contact_preference text check (contact_preference in ('whatsapp', 'facebook'));
alter table public.custom_orders add column deposit_amount numeric(12,2);
alter table public.custom_orders add column quote_note text;
alter table public.custom_orders add column cancelled_reason text;

-- لا تعديل مباشر من أي دور (يزيل أيضاً صلاحيات الأعمدة)؛ الكتابة عبر الدوال أدناه
revoke update on public.custom_orders from authenticated;

create function private.custom_transition_ok(p_from public.custom_status, p_to public.custom_status)
returns boolean language sql immutable set search_path = '' as $$
  select case p_from
    when 'new' then p_to in ('cancelled')
    when 'quoted' then p_to in ('deposit_pending', 'in_progress', 'cancelled')
    when 'deposit_pending' then p_to in ('in_progress', 'cancelled')
    when 'in_progress' then p_to in ('ready', 'cancelled')
    when 'ready' then p_to = 'delivered'
    else false end
$$;

-- إنشاء طلب تفصيل (الزبون المسجّل)
create function public.create_custom_order(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_c uuid := private.my_customer_id();
  v_desc text := btrim(coalesce(p ->> 'description', ''));
  v_phone text := regexp_replace(coalesce(p ->> 'contact_phone', ''), '[\s().-]', '', 'g');
  v_pref text := nullif(p ->> 'contact_preference', '');
  v_branch uuid; v_paths text[] := '{}'; v_id uuid := gen_random_uuid(); x text;
begin
  if v_c is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if coalesce(p ->> 'policy_accepted', '') <> 'true' then raise exception 'policy_not_accepted'; end if;
  if char_length(v_desc) not between 10 and 2000 then raise exception 'invalid_description'; end if;
  if v_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'invalid_phone'; end if;
  if v_pref is not null and v_pref not in ('whatsapp', 'facebook') then raise exception 'invalid_contact_preference'; end if;
  if char_length(coalesce(p ->> 'dimensions', '')) > 120 or char_length(coalesce(p ->> 'material', '')) > 120
     or char_length(coalesce(p ->> 'color', '')) > 120 then raise exception 'invalid_field'; end if;

  if coalesce(p ->> 'branch_id', '') <> '' then
    if p ->> 'branch_id' !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid_branch'; end if;
    v_branch := (p ->> 'branch_id')::uuid;
    if not exists (select 1 from public.branches where id = v_branch and is_active) then raise exception 'invalid_branch'; end if;
  end if;

  -- الصور المرجعية: حتى 3، ومساراتها داخل مجلد هذا الزبون فقط
  if jsonb_typeof(p -> 'reference_image_paths') = 'array' then
    if jsonb_array_length(p -> 'reference_image_paths') > 3 then raise exception 'too_many_images'; end if;
    for x in select jsonb_array_elements_text(p -> 'reference_image_paths') loop
      if x !~ ('^customers/' || v_c || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'invalid_image_path'; end if;
      v_paths := v_paths || x;
    end loop;
  end if;

  -- حد منطقي: 5 طلبات جديدة غير مُسعَّرة لكل زبون خلال 24 ساعة
  if (select count(*) from public.custom_orders where customer_id = v_c and status = 'new' and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'too_many_requests'; end if;

  insert into public.custom_orders (id, customer_id, branch_id, source_channel, description, dimensions, material, color,
                                    reference_image_paths, contact_phone, contact_preference, policy_accepted_at)
  values (v_id, v_c, v_branch, 'web', v_desc, nullif(btrim(coalesce(p ->> 'dimensions', '')), ''),
          nullif(btrim(coalesce(p ->> 'material', '')), ''), nullif(btrim(coalesce(p ->> 'color', '')), ''),
          v_paths, v_phone, v_pref, now());

  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('custom_order.created', jsonb_build_object('custom_order_id', v_id, 'customer_id', v_c, 'branch_id', v_branch,
            'source_channel', 'web', 'contact_preference', v_pref), 'custom_order.created:' || v_id);
  return v_id;
end $$;

-- المشرف/الإداري (2FA للإداري): التسعير وحساب العربون من الإعدادات
create function public.quote_custom_order(p_id uuid, p_price numeric, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.custom_orders; v_dep jsonb; v_pct numeric; v_amount numeric(12,2);
begin
  if not private.staff_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_price is null or p_price <= 0 or p_price > 1000000 then raise exception 'invalid_price'; end if;
  select * into o from public.custom_orders where id = p_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status not in ('new', 'quoted', 'deposit_pending') then raise exception 'invalid_transition'; end if;

  select value into v_dep from public.settings where key = 'deposit';
  if coalesce((v_dep ->> 'enabled')::boolean, false) and coalesce((v_dep ->> 'percent')::numeric, 0) > 0 then
    v_pct := least((v_dep ->> 'percent')::numeric, 100);
    v_amount := round(p_price * v_pct / 100, 2);
  end if;

  update public.custom_orders set quoted_price = round(p_price, 2), deposit_percent = v_pct, deposit_amount = v_amount,
         quote_note = nullif(btrim(coalesce(p_note, '')), ''), status = 'quoted' where id = p_id;
  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('custom_order.quoted', jsonb_build_object('custom_order_id', o.id, 'customer_id', o.customer_id,
            'quoted_price', round(p_price, 2), 'deposit_amount', v_amount),
          'custom_order.quoted:' || o.id || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;

-- تغيير الحالة (موظف)
create function public.set_custom_order_status(p_id uuid, p_to public.custom_status, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.custom_orders; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.staff_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into o from public.custom_orders where id = p_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if not private.custom_transition_ok(o.status, p_to) then raise exception 'invalid_transition'; end if;
  if p_to = 'cancelled' and v_reason is null then raise exception 'cancel_reason_required'; end if;
  if p_to in ('deposit_pending', 'in_progress') and o.quoted_price is null then raise exception 'quote_required'; end if;
  update public.custom_orders set status = p_to, cancelled_reason = case when p_to = 'cancelled' then v_reason else cancelled_reason end where id = p_id;
  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('custom_order.status_changed', jsonb_build_object('custom_order_id', o.id, 'customer_id', o.customer_id, 'from', o.status, 'to', p_to, 'reason', v_reason),
          'custom_order.status:' || o.id || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;

-- الزبون يلغي طلبه قبل البدء بالتنفيذ
create function public.cancel_my_custom_order(p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_c uuid := private.my_customer_id(); o public.custom_orders;
begin
  if v_c is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into o from public.custom_orders where id = p_id and customer_id = v_c for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status not in ('new', 'quoted') then raise exception 'invalid_transition'; end if;
  update public.custom_orders set status = 'cancelled', cancelled_reason = coalesce(nullif(btrim(p_reason), ''), 'إلغاء من الزبون') where id = p_id;
  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('custom_order.status_changed', jsonb_build_object('custom_order_id', o.id, 'customer_id', o.customer_id, 'from', o.status, 'to', 'cancelled'),
          'custom_order.status:' || o.id || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;

revoke all on function private.custom_transition_ok(public.custom_status, public.custom_status) from public;
revoke all on function public.create_custom_order(jsonb) from public, anon;
revoke all on function public.quote_custom_order(uuid, numeric, text) from public, anon;
revoke all on function public.set_custom_order_status(uuid, public.custom_status, text) from public, anon;
revoke all on function public.cancel_my_custom_order(uuid, text) from public, anon;
grant execute on function public.create_custom_order(jsonb) to authenticated;
grant execute on function public.quote_custom_order(uuid, numeric, text) to authenticated;
grant execute on function public.set_custom_order_status(uuid, public.custom_status, text) to authenticated;
grant execute on function public.cancel_my_custom_order(uuid, text) to authenticated;
