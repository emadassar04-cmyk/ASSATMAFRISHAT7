-- المرحلة 2 / Migration 3: دوال الطلب والدفع. كل الكتابة على orders/payments تمر من هنا فقط.
-- الأسعار تُقرأ من قاعدة البيانات دائماً؛ أي سعر يرسله العميل يُتجاهل.

-- مخطط الانتقالات المسموح بين الحالات
create function private.order_transition_ok(p_from public.order_status, p_to public.order_status, p_fulfillment public.fulfillment_type)
returns boolean language sql immutable set search_path = '' as $$
  select case p_from
    when 'new' then p_to in ('awaiting_payment_confirmation','confirmed','cancelled')
    when 'awaiting_payment_confirmation' then p_to in ('confirmed','new','cancelled')
    when 'confirmed' then p_to in ('in_preparation','cancelled')
    when 'in_preparation' then
      (p_to = 'ready_for_pickup' and p_fulfillment = 'pickup')
      or (p_to = 'out_for_delivery' and p_fulfillment = 'delivery')
      or p_to = 'cancelled'
    when 'ready_for_pickup' then p_to = 'picked_up'
    when 'out_for_delivery' then p_to = 'delivered'
    else false end
$$;

-- تطبيق تغيير الحالة (قفل الصف، تحقق الانتقال، إعادة المخزون عند الإلغاء، السجل، Outbox)
create function private.apply_order_status(p_order uuid, p_to public.order_status, p_by uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; it record; v_hist bigint; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if not private.order_transition_ok(o.status, p_to, o.fulfillment) then raise exception 'invalid_transition'; end if;

  if p_to = 'cancelled' then
    if v_note is null then raise exception 'cancel_reason_required'; end if;
    for it in select variant_id, quantity from public.order_items
               where order_id = p_order and stock_reserved and variant_id is not null order by variant_id loop
      update public.branch_stock set quantity = quantity + it.quantity
       where variant_id = it.variant_id and branch_id = o.branch_id;
    end loop;
    update public.order_items set stock_reserved = false where order_id = p_order;
  end if;

  update public.orders set status = p_to,
         cancelled_reason = case when p_to = 'cancelled' then v_note else cancelled_reason end
   where id = p_order;
  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (p_order, o.status, p_to, p_by, v_note) returning id into v_hist;

  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('order.status_changed',
          jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'customer_id', o.customer_id,
                             'source_channel', o.source_channel, 'fulfillment', o.fulfillment,
                             'from', o.status, 'to', p_to, 'note', v_note),
          'order.status:' || o.id || ':' || v_hist);
end $$;

-- إنشاء الطلب (النواة: تُستخدم من الويب الآن ومن البوت لاحقاً عبر service_role)
create function private.create_order_core(p_customer uuid, p_source public.channel_type, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_branch uuid; v_fulfil public.fulfillment_type; v_pm uuid; v_zone uuid;
  v_phone text; v_addr text; v_note text; v_items jsonb := p -> 'items';
  v_fee numeric(10,2) := 0; v_sub numeric(12,2) := 0; v_total numeric(12,2);
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
    v_zone := z.id; v_fee := z.fee;
    v_addr := nullif(btrim(coalesce(p ->> 'delivery_address', '')), '');
    if v_addr is null or char_length(v_addr) < 5 or char_length(v_addr) > 300 then raise exception 'invalid_address'; end if;
  end if;

  v_phone := regexp_replace(coalesce(p ->> 'contact_phone', ''), '[\s().-]', '', 'g');
  if v_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'invalid_phone'; end if;

  if coalesce(p ->> 'payment_method_id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'invalid_payment_method'; end if;
  v_pm := (p ->> 'payment_method_id')::uuid;
  if not exists (select 1 from public.payment_methods where id = v_pm and is_active) then raise exception 'invalid_payment_method'; end if;

  v_note := nullif(btrim(coalesce(p ->> 'customer_note', '')), '');
  if v_note is not null and char_length(v_note) > 500 then raise exception 'note_too_long'; end if;

  -- البنود: السعر من قاعدة البيانات فقط، وخصم المخزون بقفل الصف (بترتيب ثابت لتفادي deadlock)
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
                             contact_phone, delivery_fee, payment_method_id, subtotal, total, customer_note,
                             exchange_policy_accepted_at, exchange_policy_version)
  values (v_order, p_customer, v_branch, p_source, v_fulfil, v_zone, v_addr, v_phone, v_fee, v_pm, v_sub, v_total, v_note,
          now(), coalesce(v_policy_version, ''))
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
                             'delivery_fee', v_fee, 'total', v_total),
          'order.created:' || v_order);

  return jsonb_build_object('order_id', v_order, 'order_number', v_number, 'subtotal', v_sub, 'delivery_fee', v_fee, 'total', v_total);
end $$;

-- واجهة الويب: الزبون المسجّل فقط
create function public.create_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_c uuid := private.my_customer_id();
begin
  if v_c is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return private.create_order_core(v_c, 'web', p);
end $$;

-- رفع الإيصال: المسار يجب أن يكون داخل مجلد الطلب (يُولَّد من الخادم عبر رابط رفع موقّع)
create function public.submit_payment(p_order uuid, p_receipt_path text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_c uuid := private.my_customer_id(); o public.orders; v_pay uuid;
begin
  if v_c is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order and customer_id = v_c for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status not in ('new', 'awaiting_payment_confirmation') then raise exception 'order_not_payable'; end if;
  if o.payment_method_id is null then raise exception 'invalid_payment_method'; end if;
  if p_receipt_path !~ ('^orders/' || o.id || '/[A-Za-z0-9._-]{1,100}\.(jpg|jpeg|png|webp|pdf)$') then
    raise exception 'invalid_receipt_path'; end if;
  if exists (select 1 from public.payments where order_id = o.id and status in ('pending', 'confirmed')) then
    raise exception 'payment_already_submitted'; end if;

  insert into public.payments (order_id, method_id, amount, receipt_path)
  values (o.id, o.payment_method_id, o.total, p_receipt_path) returning id into v_pay;
  if o.status = 'new' then
    perform private.apply_order_status(o.id, 'awaiting_payment_confirmation', (select auth.uid()), null);
  end if;
  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('payment.receipt_uploaded',
          jsonb_build_object('payment_id', v_pay, 'order_id', o.id, 'order_number', o.order_number,
                             'customer_id', o.customer_id, 'source_channel', o.source_channel, 'amount', o.total),
          'payment.receipt:' || v_pay);
  return v_pay;
end $$;

-- إلغاء الزبون لطلبه قبل تأكيد الدفع
create function public.cancel_my_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_c uuid := private.my_customer_id(); o public.orders;
begin
  if v_c is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order and customer_id = v_c for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status not in ('new', 'awaiting_payment_confirmation') then raise exception 'invalid_transition'; end if;
  update public.payments set status = 'rejected', reject_reason = 'order cancelled', reviewed_at = now()
   where order_id = o.id and status = 'pending';
  perform private.apply_order_status(o.id, 'cancelled', (select auth.uid()), coalesce(nullif(btrim(p_reason), ''), 'إلغاء من الزبون'));
end $$;

-- الإداري (2FA): تغيير حالة الطلب
create function public.set_order_status(p_order uuid, p_to public.order_status, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.admin_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform private.apply_order_status(p_order, p_to, (select auth.uid()), p_note);
end $$;

-- الإداري (2FA): تأكيد/رفض الدفعة
create function public.review_payment(p_payment uuid, p_decision text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare pay public.payments; o public.orders; v_uid uuid := (select auth.uid()); v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.admin_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_decision not in ('confirmed', 'rejected') then raise exception 'invalid_decision'; end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found'; end if;
  if pay.status <> 'pending' then raise exception 'payment_already_reviewed'; end if;
  if pay.order_id is null then raise exception 'unsupported_payment'; end if;
  select * into o from public.orders where id = pay.order_id for update;

  if p_decision = 'confirmed' then
    update public.payments set status = 'confirmed', reviewed_by = v_uid, reviewed_at = now() where id = pay.id;
    perform private.apply_order_status(o.id, 'confirmed', v_uid, 'payment confirmed');
  else
    if v_reason is null then raise exception 'reject_reason_required'; end if;
    update public.payments set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), reject_reason = v_reason where id = pay.id;
    if o.status = 'awaiting_payment_confirmation' then
      perform private.apply_order_status(o.id, 'new', v_uid, 'payment rejected: ' || v_reason);
    end if;
  end if;

  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('payment.reviewed',
          jsonb_build_object('payment_id', pay.id, 'order_id', o.id, 'order_number', o.order_number, 'decision', p_decision,
                             'reason', v_reason, 'customer_id', o.customer_id, 'source_channel', o.source_channel),
          'payment.reviewed:' || pay.id);
end $$;

-- الصلاحيات: RPC مفتوحة للمسجّلين فقط (والتحقق من الملكية/الدور داخل كل دالة)
revoke all on function private.order_transition_ok(public.order_status, public.order_status, public.fulfillment_type) from public;
revoke all on function private.apply_order_status(uuid, public.order_status, uuid, text) from public, anon, authenticated;
revoke all on function private.create_order_core(uuid, public.channel_type, jsonb) from public, anon, authenticated;
revoke all on function public.create_order(jsonb) from public, anon;
revoke all on function public.submit_payment(uuid, text) from public, anon;
revoke all on function public.cancel_my_order(uuid, text) from public, anon;
revoke all on function public.set_order_status(uuid, public.order_status, text) from public, anon;
revoke all on function public.review_payment(uuid, text, text) from public, anon;
grant execute on function public.create_order(jsonb) to authenticated;
grant execute on function public.submit_payment(uuid, text) to authenticated;
grant execute on function public.cancel_my_order(uuid, text) to authenticated;
grant execute on function public.set_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.review_payment(uuid, text, text) to authenticated;
