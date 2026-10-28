-- المرحلة 3 / Migration 2: دوال البوت الضيقة (service_role فقط). الوكيل في n8n لا يملك SQL حراً؛
-- كل أدواته هنا: قراءة فقط (منتجات/أسعار/توفر/فروع/دوام/دفع/سياسات/معرفة/حالة طلب) + تسجيل الرسائل والتحويل وإنشاء الطلب.
-- لا تكشف هذه الدوال كميات المخزون الدقيقة (حالات التوفر فقط) ولا بيانات زبائن آخرين.

-- المنطقة الزمنية ورمز الدولة من الإعدادات (لا قيم متجر في الكود؛ الافتراضي لغزة/فلسطين)
insert into public.settings (key, value, is_public) values ('locale', '{"timezone":"Asia/Gaza","country_code":"970"}', false)
  on conflict (key) do nothing;

create function private.store_tz() returns text language sql stable set search_path = '' as $$
  select coalesce(nullif((select value ->> 'timezone' from public.settings where key = 'locale'), ''), 'Asia/Gaza') $$;

-- توحيد رقم الجوال إلى أرقام دولية (بلا +). يعيد null إن لم يكن رقماً صالحاً.
create function private.norm_phone(p text) returns text language plpgsql stable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
        cc text := coalesce(nullif((select value ->> 'country_code' from public.settings where key = 'locale'), ''), '970');
begin
  if d like '00%' then d := substr(d, 3);
  elsif d like '0%' then d := cc || substr(d, 2);
  elsif char_length(d) <= 9 then d := cc || d; end if;
  return case when char_length(d) between 10 and 15 then d else null end;
end $$;

-- هل الفرع مفتوح الآن؟ (توقيت المتجر، مع الإجازات)
create function private.branch_open(p_branch uuid, p_at timestamptz default now()) returns boolean
language plpgsql stable set search_path = '' as $$
declare ts timestamp := p_at at time zone private.store_tz();
begin
  if exists (select 1 from public.branch_holidays h where h.on_date = ts::date and (h.branch_id is null or h.branch_id = p_branch)) then return false; end if;
  return exists (select 1 from public.branch_hours bh where bh.branch_id = p_branch
                   and bh.weekday = extract(dow from ts)::int and ts::time >= bh.opens_at and ts::time < bh.closes_at);
end $$;

-- أقرب فتح قادم لأي فرع فعّال (توقيت المتجر المحلي) خلال 14 يوماً
create function private.next_opening(p_at timestamptz default now()) returns timestamp
language plpgsql stable set search_path = '' as $$
declare ts timestamp := p_at at time zone private.store_tz(); best timestamp; cand timestamp; r record; i int;
begin
  for i in 0..14 loop
    for r in select bh.branch_id, bh.opens_at from public.branch_hours bh join public.branches b on b.id = bh.branch_id and b.is_active
              where bh.weekday = extract(dow from (ts::date + i))::int loop
      if exists (select 1 from public.branch_holidays h where h.on_date = ts::date + i and (h.branch_id is null or h.branch_id = r.branch_id)) then continue; end if;
      cand := (ts::date + i) + r.opens_at;
      if cand > ts and (best is null or cand < best) then best := cand; end if;
    end loop;
    exit when best is not null;
  end loop;
  return best;
end $$;

-- ===== هوية الزبون الموحّدة عبر القنوات (بالرقم) =====
create function public.bot_resolve_customer(p_channel public.channel_type, p_external_id text, p_phone text default null, p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_phone text := private.norm_phone(p_phone); v_c uuid; v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if coalesce(p_external_id, '') = '' or char_length(p_external_id) > 200 then raise exception 'invalid_external_id'; end if;
  select customer_id into v_c from public.customer_identities where channel = p_channel and external_id = p_external_id;
  if v_c is null and v_phone is not null then
    select id into v_c from public.customers where phone = v_phone;
  end if;
  if v_c is null then
    insert into public.customers (phone, full_name) values (v_phone, v_name) returning id into v_c;
  elsif v_phone is not null then
    update public.customers set phone = v_phone where id = v_c and phone is null;
  end if;
  if v_name is not null then update public.customers set full_name = v_name where id = v_c and full_name is null; end if;
  insert into public.customer_identities (customer_id, channel, external_id, display_name)
  values (v_c, p_channel, p_external_id, v_name) on conflict (channel, external_id) do nothing;
  return v_c;
end $$;

-- ===== المحادثات =====
create function public.bot_upsert_conversation(p_channel public.channel_type, p_thread text, p_customer uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.conversations;
begin
  if coalesce(p_thread, '') = '' or char_length(p_thread) > 200 then raise exception 'invalid_thread'; end if;
  insert into public.conversations (channel, external_thread_id, customer_id) values (p_channel, p_thread, p_customer)
  on conflict (channel, external_thread_id) do update
    set customer_id = coalesce(public.conversations.customer_id, excluded.customer_id),
        status = case when public.conversations.status = 'closed' then 'bot'::public.conv_status else public.conversations.status end
  returning * into c;
  return jsonb_build_object('id', c.id, 'status', c.status, 'customer_id', c.customer_id, 'channel', c.channel,
                            'last_customer_message_at', c.last_customer_message_at);
end $$;

-- تسجيل رسالة بلا تكرار (external_id)؛ الرسالة الواردة تحدّث نافذة واتساب
create function public.bot_log_message(p_conv uuid, p_direction public.msg_direction, p_sender public.msg_sender, p_body text,
                                       p_external_id text default null, p_meta jsonb default '{}', p_attachments jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; c public.conversations;
begin
  select * into c from public.conversations where id = p_conv for update;
  if not found then raise exception 'conversation_not_found'; end if;
  insert into public.messages (conversation_id, direction, sender, body, external_id, meta, attachments)
  values (p_conv, p_direction, p_sender, left(p_body, 8000), nullif(p_external_id, ''), coalesce(p_meta, '{}'), coalesce(p_attachments, '[]'))
  on conflict (conversation_id, external_id) do nothing returning id into v_id;
  if v_id is null then return jsonb_build_object('duplicate', true, 'status', c.status); end if;
  update public.conversations set last_message_at = now(),
         last_customer_message_at = case when p_direction = 'inbound' and p_sender = 'customer' then now() else last_customer_message_at end,
         status = case when c.status = 'closed' and p_direction = 'inbound' then 'bot'::public.conv_status else c.status end
   where id = p_conv;
  return jsonb_build_object('duplicate', false, 'message_id', v_id, 'status', case when c.status = 'closed' and p_direction = 'inbound' then 'bot' else c.status::text end);
end $$;

create function public.bot_history(p_conv uuid, p_limit int default 10) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('sender', sender, 'body', body, 'at', created_at) order by created_at), '[]'::jsonb)
    from (select sender, body, created_at from public.messages where conversation_id = p_conv and body is not null
           order by created_at desc limit least(greatest(coalesce(p_limit, 10), 1), 30)) m
$$;

-- حالة الدوام الآن + أقرب فتح (لنص خارج الدوام الحرفي)
create function public.bot_open_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_open boolean; v_next timestamp;
begin
  select coalesce(bool_or(private.branch_open(id)), false) into v_open from public.branches where is_active;
  v_next := private.next_opening();
  return jsonb_build_object('open_now', v_open, 'opening_time', to_char(v_next, 'HH24:MI'), 'opening_date', to_char(v_next, 'YYYY-MM-DD'),
                            'timezone', private.store_tz(), 'now_local', to_char(now() at time zone private.store_tz(), 'YYYY-MM-DD HH24:MI'));
end $$;

-- تحويل لموظف: داخل الدوام ← human، خارجه ← waiting (ملخص الصباح لاحقاً). متكرر الاستدعاء بأمان.
create function public.bot_handoff(p_conv uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.conversations; v_open boolean; v_next timestamp; v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 200);
begin
  select * into c from public.conversations where id = p_conv for update;
  if not found then raise exception 'conversation_not_found'; end if;
  select coalesce(bool_or(private.branch_open(id)), false) into v_open from public.branches where is_active;
  v_next := private.next_opening();
  if c.status in ('human', 'waiting') then
    return jsonb_build_object('status', c.status, 'after_hours', c.status = 'waiting', 'already', true,
                              'opening_time', to_char(v_next, 'HH24:MI'), 'message_key', case when c.status = 'waiting' then 'handoff_after_hours' else 'handoff_open' end);
  end if;
  update public.conversations set status = case when v_open then 'human'::public.conv_status else 'waiting'::public.conv_status end,
         handoff_reason = v_reason, handoff_at = now(), waiting_since = case when v_open then null else now() end where id = c.id;
  insert into public.outbox_events (event_type, payload, idempotency_key)
  values ('conversation.handoff', jsonb_build_object('conversation_id', c.id, 'channel', c.channel, 'customer_id', c.customer_id,
            'reason', v_reason, 'after_hours', not v_open), 'conv.handoff:' || c.id || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
  return jsonb_build_object('status', case when v_open then 'human' else 'waiting' end, 'after_hours', not v_open, 'already', false,
                            'opening_time', to_char(v_next, 'HH24:MI'), 'message_key', case when v_open then 'handoff_open' else 'handoff_after_hours' end);
end $$;

-- نص بوت من الإعدادات مع استبدال المتغيرات {{name}}
create function public.bot_message(p_key text, p_vars jsonb default '{}') returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_body text; k text; v text;
begin
  select body into v_body from public.bot_messages where key = p_key;
  if v_body is null then return null; end if;
  for k, v in select * from jsonb_each_text(coalesce(p_vars, '{}')) loop
    v_body := replace(v_body, '{{' || k || '}}', v);
  end loop;
  return v_body;
end $$;

-- ===== أدوات القراءة =====
create function public.bot_search_products(p_q text, p_limit int default 8) returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (select btrim(coalesce(p_q, '')) as t),
  hits as (
    select p.id, p.slug, p.name, c.name as category,
           (select min(v.price) from public.product_variants v where v.product_id = p.id and v.is_active) as pf,
           (select max(v.price) from public.product_variants v where v.product_id = p.id and v.is_active) as pt,
           greatest(extensions.similarity(p.name, q.t), case when p.name ilike '%' || q.t || '%' then 1 else 0 end,
                    case when coalesce(p.description, '') ilike '%' || q.t || '%' then 0.5 else 0 end) as score
      from public.products p left join public.categories c on c.id = p.category_id, q
     where p.is_visible and char_length(q.t) between 1 and 80
       and (p.name ilike '%' || q.t || '%' or coalesce(p.description, '') ilike '%' || q.t || '%'
            or c.name ilike '%' || q.t || '%' or extensions.similarity(p.name, q.t) > 0.3)
     order by score desc, p.name limit least(greatest(coalesce(p_limit, 8), 1), 20))
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'category', category,
           'price_from', coalesce(pf, (select base_price from public.products where id = hits.id)), 'price_to', coalesce(pt, (select base_price from public.products where id = hits.id)),
           'availability', coalesce((select jsonb_agg(jsonb_build_object('branch', b.name, 'status', s.st))
              from (select bs.branch_id, (array_agg(bs.status order by case bs.status when 'available' then 1 when 'limited' then 2 when 'made_to_order' then 3 else 4 end))[1] as st
                      from public.branch_stock bs join public.product_variants v on v.id = bs.variant_id and v.is_active
                     where v.product_id = hits.id group by bs.branch_id) s join public.branches b on b.id = s.branch_id and b.is_active), '[]'::jsonb))
         order by score desc), '[]'::jsonb) from hits
$$;

create function public.bot_get_product(p_slug_or_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('slug', p.slug, 'name', p.name, 'description', p.description, 'category', c.name, 'base_price', p.base_price,
    'variants', coalesce((select jsonb_agg(jsonb_build_object('variant_id', v.id, 'sku', v.sku, 'price', v.price, 'compare_at_price', v.compare_at_price,
        'options', (select string_agg(ov.value, ' / ' order by ot.sort_order, ov.sort_order) from public.variant_options vo
                     join public.option_values ov on ov.id = vo.value_id join public.option_types ot on ot.id = ov.type_id where vo.variant_id = v.id),
        'stock', coalesce((select jsonb_agg(jsonb_build_object('branch', b.name, 'branch_id', b.id, 'status', bs.status))
                   from public.branch_stock bs join public.branches b on b.id = bs.branch_id and b.is_active where bs.variant_id = v.id), '[]'::jsonb))
        order by v.sort_order, v.price) from public.product_variants v where v.product_id = p.id and v.is_active), '[]'::jsonb))
  from public.products p left join public.categories c on c.id = p.category_id
 where p.is_visible and (p.slug = p_slug_or_id or p.id::text = p_slug_or_id) limit 1
$$;

create function public.bot_get_branches_and_hours() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'address', b.address, 'phone', b.phone, 'whatsapp', b.whatsapp, 'map_url', b.map_url,
    'open_now', private.branch_open(b.id),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', to_char(h.opens_at, 'HH24:MI'), 'closes_at', to_char(h.closes_at, 'HH24:MI')) order by h.weekday)
                         from public.branch_hours h where h.branch_id = b.id), '[]'::jsonb),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('date', hd.on_date, 'reason', hd.reason) order by hd.on_date)
                         from public.branch_holidays hd where (hd.branch_id is null or hd.branch_id = b.id)
                          and hd.on_date >= (now() at time zone private.store_tz())::date and hd.on_date < (now() at time zone private.store_tz())::date + 30), '[]'::jsonb))
    order by b.sort_order), '[]'::jsonb) from public.branches b where b.is_active
$$;

create function public.bot_get_payment_methods() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'instructions', instructions, 'details', details) order by sort_order), '[]'::jsonb)
    from public.payment_methods where is_active
$$;

create function public.bot_delivery_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('enabled', coalesce((select (value ->> 'enabled')::boolean from public.settings where key = 'delivery'), false),
    'zones', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'fee', fee, 'fee_on_agreement', fee_on_agreement) order by name)
                        from public.delivery_zones where is_active), '[]'::jsonb))
$$;

-- السياسات العامة فقط (is_public)؛ المفتاح اختياري: exchange | custom_orders | privacy | terms | data_deletion
create function public.bot_get_policies(p_key text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(substr(key, 8), value), '{}'::jsonb) from public.settings
   where is_public and key like 'policy.%' and (p_key is null or key = 'policy.' || p_key)
$$;

create function public.bot_search_kb(p_q text, p_limit int default 5) returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (select btrim(coalesce(p_q, '')) as t)
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'title', title, 'content', left(content, 1200)) order by score desc), '[]'::jsonb)
    from (select d.kind, d.title, d.content,
                 greatest(extensions.similarity(d.title, q.t), ts_rank(d.search, plainto_tsquery('simple', q.t)),
                          case when d.content ilike '%' || q.t || '%' then 0.4 else 0 end) as score
            from public.kb_documents d, q
           where d.is_active and char_length(q.t) between 1 and 200
             and (d.search @@ plainto_tsquery('simple', q.t) or extensions.similarity(d.title, q.t) > 0.25 or d.content ilike '%' || q.t || '%' or d.title ilike '%' || q.t || '%')
           order by score desc limit least(greatest(coalesce(p_limit, 5), 1), 10)) r
$$;

-- حالة طلب: لا تُعاد إلا بتطابق رقم الجوال (جوال الطلب أو جوال الزبون) — لا تسريب لوجود الطلب
create function public.bot_get_order_status(p_order_number text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o public.orders; v_phone text := private.norm_phone(p_phone);
begin
  if v_phone is null then return null; end if;
  select * into o from public.orders where order_number = upper(btrim(coalesce(p_order_number, '')));
  if not found then return null; end if;
  if private.norm_phone(o.contact_phone) is distinct from v_phone
     and not exists (select 1 from public.customers c where c.id = o.customer_id and c.phone = v_phone) then return null; end if;
  return jsonb_build_object('order_number', o.order_number, 'status', o.status, 'fulfillment', o.fulfillment, 'subtotal', o.subtotal,
    'delivery_fee', o.delivery_fee, 'delivery_fee_pending', o.delivery_fee_pending, 'total', o.total, 'created_at', o.created_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.product_name, 'options', i.options_text, 'quantity', i.quantity, 'line_total', i.line_total))
                         from public.order_items i where i.order_id = o.id), '[]'::jsonb));
end $$;

-- إنشاء طلب من البوت لزبون محدد (القناة مصدر الطلب). الموافقة على سياسة الاستبدال يجب أن تُمرَّر صراحة بعد موافقة الزبون.
create function public.bot_create_order(p_customer uuid, p_channel public.channel_type, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.customers where id = p_customer) then raise exception 'customer_not_found'; end if;
  return private.create_order_core(p_customer, p_channel, p);
end $$;

-- ===== الصلاحيات: service_role فقط =====
do $$ declare f text; begin
  foreach f in array array[
    'bot_resolve_customer(public.channel_type, text, text, text)', 'bot_upsert_conversation(public.channel_type, text, uuid)',
    'bot_log_message(uuid, public.msg_direction, public.msg_sender, text, text, jsonb, jsonb)', 'bot_history(uuid, int)',
    'bot_open_status()', 'bot_handoff(uuid, text)', 'bot_message(text, jsonb)', 'bot_search_products(text, int)', 'bot_get_product(text)',
    'bot_get_branches_and_hours()', 'bot_get_payment_methods()', 'bot_delivery_info()', 'bot_get_policies(text)', 'bot_search_kb(text, int)',
    'bot_get_order_status(text, text)', 'bot_create_order(uuid, public.channel_type, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop; end $$;
revoke all on function private.store_tz(), private.norm_phone(text), private.branch_open(uuid, timestamptz), private.next_opening(timestamptz) from public;
