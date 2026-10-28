-- المرحلة 1 / Migration 3: Rate Limiting (OTP والنماذج)
create table public.rate_limit_hits (
  key text not null,
  hit_at timestamptz not null default now()
);
create index on public.rate_limit_hits (key, hit_at desc);
alter table public.rate_limit_hits enable row level security;
alter table public.rate_limit_hits force row level security;
-- بلا سياسات: service_role فقط

-- يسجّل المحاولة ويعيد false إن تجاوز الحد خلال النافذة
create function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  delete from public.rate_limit_hits where hit_at < now() - interval '1 day';
  select count(*) into v_count from public.rate_limit_hits
    where key = p_key and hit_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then return false; end if;
  insert into public.rate_limit_hits (key) values (p_key);
  return true;
end $$;
revoke execute on function public.check_rate_limit from public, anon, authenticated;
grant execute on function public.check_rate_limit to service_role;
