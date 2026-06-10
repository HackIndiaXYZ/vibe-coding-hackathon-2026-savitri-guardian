
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;

  -- Default role for self-signup is patient. EMT/Hospital are seeded explicitly.
  v_role := coalesce(
    nullif(new.raw_user_meta_data->>'role','')::public.app_role,
    'patient'::public.app_role
  );

  if v_role in ('patient','emt','hospital') then
    insert into public.user_roles (user_id, role)
    values (new.id, v_role)
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;
