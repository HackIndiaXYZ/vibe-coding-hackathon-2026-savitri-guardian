
-- Lock search_path and tighten EXECUTE grants on SECURITY DEFINER functions

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin new.updated_at = now(); return new; end;
$$;

-- has_role: only callable by signed-in users via policies; revoke broad EXECUTE
revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to service_role;

-- handle_new_user: trigger-only; revoke EXECUTE so it cannot be called via API
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- touch_updated_at: trigger-only; revoke EXECUTE
revoke all on function public.touch_updated_at() from public, anon, authenticated;
