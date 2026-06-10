CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  v_role := coalesce(
    nullif(new.raw_user_meta_data->>'role','')::public.app_role,
    'patient'::public.app_role
  );

  if v_role in ('patient','emt','hospital') then
    insert into public.user_roles (user_id, role, tenant_id)
    values (new.id, v_role, '00000000-0000-0000-0000-000000000001'::uuid)
    on conflict (user_id, role, tenant_id) do nothing;
  end if;

  return new;
end;
$$;