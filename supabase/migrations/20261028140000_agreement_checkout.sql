-- المرحلة 2 / Migration 4: الدفع والتوصيل «بالاتفاق» عبر واتساب أو فيسبوك.
-- الطلب يُقدَّم بدون دفع فوري؛ طريقة الدفع الافتراضية «بالاتفاق»، ورسوم التوصيل تُحدَّد من الإدارة بعد الاتفاق.

alter table public.delivery_zones add column fee_on_agreement boolean not null default false;
alter table public.orders add column delivery_fee_pending boolean not null default false;
alter table public.orders add column contact_preference text check (contact_preference in ('whatsapp', 'facebook'));

-- بيانات إعداد (تُعدَّل من لوحة الإدارة): طريقة دفع ومنطقة توصيل «بالاتفاق»
insert into public.payment_methods (code, name, instructions, details, is_active, sort_order)
values ('agreement', 'الاتفاق عبر واتساب أو فيسبوك', 'سنتواصل معك لتأكيد طريقة الدفع بعد استلام طلبك', '{}', true, 0)
on conflict (code) do nothing;
insert into public.delivery_zones (name, fee, is_active, fee_on_agreement)
select 'التوصيل بالاتفاق', 0, true, true
 where not exists (select 1 from public.delivery_zones where fee_on_agreement);

create or replace function private.create_order_core(p_customer uuid, p_source public.channel_type, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_branch uuid; v_fulfil public.fulfillment_type; v_pm uuid; v_zone uuid;
  v_phone text; v_addr text; v_note text; v_items jsonb := p -> 'items';
  v_fee numeric(10,2) := 0; v_fee_pending boolean := false; v_pref text;
  v_sub numeric(12,2) := 0; v_total numeric(12,2);
  v_lines jsonb := '[]'::jsonb; v_reserved boolean; v_opts text;
  v_order uuid := gen_random_uuid(); v_number text; v_policy_version text;
  it record; v record; st record; z record;
begin
  if coalesce(p ->> 'exchange_policy_accepted', '') <> 'true' then raise exception 'policy_not_accepted'; end if;

  if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) not between 1 and 50 then
    raise exception 'invalid_items'; end if;
  if exists (select 1 from jsonb_array_elements(v_items) e
              where jsonb_typeof(e) <> 'object'
                 or coalesce(e ->> 'variant_id', '') !~ '^[0-9a-fA-F-]{36}$'
                 or case when coalesce(e ->> 'quantity', '') ~ '^[0-9]{1,2}$'
                         then (e ->> 'quantity')::int not between 1 and 99 else true end) then
    raise exception 'invalid_items'; end if;

  if coalesce(p ->> 'branch_id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid_branch'; end if;
  v_branch := (p ->> 'branch_id')::uuid;
  if not exists (select 1 from public.branches where id = v_branch and is_active) then raise exception 'invalid_branch'; end if;

  v_fulfil := case coalesce(p ->> 'fulfillment', 'pickup') when 'pickup' then 'pickup' when 'delivery' then 'delivery'
              else null end::public.fulfillment_type;
  if v_fulfil is null then raise exception 'invalid_fulfillment'; end if;

  if v_fulfil = 'delivery' then
    if not coalesce((select (value ->> 'enabled')::boolean from public.settings where key = 'delivery'), false) then
      raise exception 'delivery_disabled'; end if;
    if coalesce(p ->> 'delivery_zone_id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid_zone'; end if;
    select * into z from public.delivery_zones where id = (p ->> 'delivery_zone_id')::uuid and is_active;
    if not found then raise exception 'invalid_zone'; end if;
    v_zone := z.id;
    v_fee_pending := z.fee_on_agreement;
    v_fee := case when z.fee_on_agreement then 0 else z.fee end;
    v_addr := nullif(btrim(coalesce(p ->> 'delivery_address', '')), '');
    if v_addr is null or char_length(v_addr) < 5 or char_length(v_addr) > 300 then raise exception 'invalid_address'; end if;
  end if;

  v_phone := regexp_replace(coalesce(p ->> 'contact_phone', ''), '[\s().-]', '', 'g');
  if v_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'invalid_phone'; end if;

  -- الدفع: طريقة محددة، أو «بالاتفاق» افتراضياً
  if coalesce(p ->> 'payment_method_id', '') = '' then
    select id into v_pm from public.payment_methods where code = 'agreement' and is_active;
    if v_pm is null then raise exception 'invalid_payment_method'; end if;
  else
    if p ->> 'payment_method_id' !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid_payment_method'; end if;
    v_pm := (p ->> 'payment_method_id')::uuid;
    if not exists (select 1 from public.payment_methods where id = v_pm and is_active) then raise exception 'invalid_payment_method'; end if;
  end if;

  v_pref := nullif(p ->> 'contact_preference', '');
  if v_pref is not null and v_pref not in ('whatsapp', 'facebook') then raise exception 'invalid_contact_preference'; end if;

  v_note := nullif(btrim(coalesce(p ->> 'customer_note', '')), '');
  if v_note is not null and char_length(v_note) > 500 then raise exception 'note_too_long'; end if;

  for it in
    select (e ->> 'variant_id')::uuid as vid, sum((e ->> 'quantity')::int)::int as qty
      from jsonb_array_elements(v_items) e group by 1 order by 1
  loop
    if it.qty > 99 then raise exception 'invalid_items'; end if;
    select pv.price, pv.is_active, pr.name, pr.is_visible into v
      from public.product_variants pv join public.products pr on pr.id = pv.product_id where pv.id = it.vid;
    if not found then raise exception 'item_unavailable'; end if;
    if not v.is_active or not v.is_visible then raise exception 'item_unavailable'; end if;

    select string_agg(ov.value, ' / ' order by ot.sort_order, ov.sort_order) into v_opts
      from public.variant_options vo join public.option_values ov on ov.id = vo.value_id
      join public.option_types ot on ot.id = ov.type_id where vo.variant_id = it.vid;

    select quantity, status into st from public.branch_stock
     where variant_id = it.vid and branch_id = v_branch for update;
    if not found then raise exception 'insufficient_stock' using detail = v.name; end if;
    if st.status = 'out_of_stock' then raise exception 'insufficient_stock' using detail = v.name; end if;
    if st.status = 'made_to_order' then
      v_reserved := false;
    else
      if st.quantity < it.qty then raise exception 'insufficient_stock' using detail = v.name; end if;
      update public.branch_stock set quantity = quantity - it.qty where variant_id = it.vid and branch_id = v_branch;
      v_reserved := true;
    end if;

    v_sub := v_sub + v.price * it.qty;
    v_lines := v_lines || jsonb_build_object('variant_id', it.vid, 'name', v.name, 'options', v_opts,
                                             'price', v.price, 'qty', it.qty, 'reserved', v_reserved);
  end loop;
  v_total := v_sub + v_fee;

  select md5(coalesce(value::text, '')) into v_policy_version from public.settings where key = 'policy.exchange';

  insert into public.orders (id, customer_id, branch_id, source_channel, fulfillment, delivery_zone_id, delivery_address,
                             contact_phone, delivery_fee, delivery_fee_pending, contact_preference, payment_method_id,
                             subtotal, total, customer_note, exchange_policy_accepted_at, exchange_policy_version)
  values (v_order, p_customer, v_branch, p_source, v_fulfil, v_zone, v_addr, v_phone, v_fee, v_fee_pending, v_pref, v_pm,
          v_sub, v_total, v_note, now(), coalesce(v_policy_version, ''))
  returning order_number into v_number;

  insert into public.order_items (order_id, variant_id, product_name, options_text, unit_price, quantity, line_total, stock_reserved)
  select v_order, (l ->> 'variant_id')::uuid, l ->> 'name', l ->> 'options', (l ->> 'price')::numeric,
         (l ->> 'qty')::int, (l ->> 'price')::numeric * (l ->> 'qty')::int, (l ->> 'reserved')::boolean
    from jsonb_array_elements(v_lines) l;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (v_order, null, 'new', (select auth.uid()), null);

  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('order.created',
          jsonb_build_object('order_id', v_order, 'order_number', v_number, 'customer_id', p_customer, 'branch_id', v_branch,
                             'source_channel', p_source, 'fulfillment', v_fulfil, 'subtotal', v_sub,
                             'delivery_fee', v_fee, 'delivery_fee_pending', v_fee_pending,
                             'contact_preference', v_pref, 'total', v_total),
          'order.created:' || v_order);

  return jsonb_build_object('order_id', v_order, 'order_number', v_number, 'subtotal', v_sub, 'delivery_fee', v_fee,
                            'delivery_fee_pending', v_fee_pending, 'total', v_total);
end $$;

-- الإداري (2FA): تحديد رسوم التوصيل بعد الاتفاق مع الزبون
create function public.set_delivery_fee(p_order uuid, p_fee numeric, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  if not private.admin_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_fee is null or p_fee < 0 or p_fee > 10000 then raise exception 'invalid_fee'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.fulfillment <> 'delivery' then raise exception 'not_delivery_order'; end if;
  if o.status in ('cancelled', 'delivered', 'picked_up') then raise exception 'order_closed'; end if;

  update public.orders set delivery_fee = round(p_fee, 2), total = o.subtotal + round(p_fee, 2), delivery_fee_pending = false
   where id = p_order;
  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('order.fee_set',
          jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'customer_id', o.customer_id,
                             'source_channel', o.source_channel, 'delivery_fee', round(p_fee, 2),
                             'total', o.subtotal + round(p_fee, 2), 'note', nullif(btrim(coalesce(p_note, '')), '')),
          'order.fee:' || o.id || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;
revoke all on function public.set_delivery_fee(uuid, numeric, text) from public, anon;
grant execute on function public.set_delivery_fee(uuid, numeric, text) to authenticated;
