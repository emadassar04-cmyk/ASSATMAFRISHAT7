-- الدخول عبر Google (Gmail) بدل الجوال/OTP
-- الهوية الأساسية = البريد؛ الجوال اختياري ويُدار كبيانات اتصال فقط.

alter table public.profiles alter column phone drop not null;
alter table public.profiles add column email text;
create unique index profiles_email_key on public.profiles (lower(email));

-- ترحيل أي حسابات قائمة: بريدها الفعلي من auth.users (الاصطناعي @phone.alassar.local يُتجاهل)
update public.profiles p set email = lower(u.email)
  from auth.users u
  where u.id = p.id and u.email is not null and u.email not like '%@phone.alassar.local';

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(new.email);
  v_name  text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name');
begin
  if v_email is null then return new; end if;
  -- الدور دائماً customer؛ الترقية عبر admin_update_profile فقط
  insert into public.profiles (id, email, full_name) values (new.id, v_email, v_name);
  insert into public.customers (profile_id, full_name) values (new.id, v_name)
    on conflict (profile_id) do nothing;
  return new;
end $$;

-- لا حاجة لرموز OTP بعد الآن
drop table if exists public.otp_requests;
