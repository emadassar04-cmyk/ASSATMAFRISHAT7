-- إصلاح: تدقيق جدول الفروع يُسجَّل بمعرّف الفرع نفسه ليظهر عند الفلترة حسب الفرع.

create or replace function private.audit_row_change() returns trigger
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

  -- الفرع: عمود الصف إن وُجد، وللفروع نفسها معرّفها، وإلا فرع الموظف الفاعل
  v_branch := case when v_entity = 'branch' then (v_row ->> 'id')::uuid
                   else coalesce(nullif(v_row ->> 'branch_id', '')::uuid, v_actor_branch) end;

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
