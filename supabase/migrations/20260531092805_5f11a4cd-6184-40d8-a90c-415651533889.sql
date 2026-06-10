
-- =========================================
-- SAVITRI MVP — full schema
-- =========================================

-- Extensions
create extension if not exists pgcrypto;

-- ===== ENUMS =====
create type public.app_role as enum (
  'patient','emt','hospital',
  'super_admin','ops_admin','tech_admin','provider','emergency_contact'
);

create type public.incident_status as enum (
  'pending','accepted','arrived','completed','rejected'
);

create type public.incident_priority as enum ('low','medium','high','critical');

create type public.session_status as enum ('open','closed');

create type public.notification_channel as enum ('in_app','sms','email');

create type public.notification_audience as enum ('patient','emergency_contact','hospital','emt');

create type public.audit_action as enum (
  'PROFILE_CREATED','PROFILE_UPDATED','QR_GENERATED','QR_SCANNED',
  'PATIENT_NOTIFIED','CONTACT_NOTIFIED','EMERGENCY_SESSION_CREATED',
  'REPORT_SUBMITTED','HOSPITAL_ALERTED','HOSPITAL_ACCEPTED','PATIENT_ARRIVED'
);

-- ===== TENANTS =====
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.tenants enable row level security;
grant select on public.tenants to authenticated;
grant all on public.tenants to service_role;
create policy "tenants readable by authenticated" on public.tenants
  for select to authenticated using (true);

-- Single demo tenant
insert into public.tenants (id, name)
values ('00000000-0000-0000-0000-000000000001','Savitri Demo');

-- ===== PROFILES =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) default '00000000-0000-0000-0000-000000000001',
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
create policy "users read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "users insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- ===== USER ROLES =====
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  tenant_id uuid not null references public.tenants(id) default '00000000-0000-0000-0000-000000000001',
  created_at timestamptz not null default now(),
  unique (user_id, role, tenant_id)
);
alter table public.user_roles enable row level security;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
create policy "users read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ===== PATIENT PROFILES =====
create table public.patient_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) default '00000000-0000-0000-0000-000000000001',
  date_of_birth date,
  blood_group text,
  allergies text[] not null default '{}',
  conditions text[] not null default '{}',
  insurance_provider text,
  insurance_policy_no text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.patient_profiles enable row level security;
grant select, insert, update on public.patient_profiles to authenticated;
grant all on public.patient_profiles to service_role;
create policy "patient reads own medical" on public.patient_profiles
  for select to authenticated using (auth.uid() = user_id);
create policy "patient writes own medical" on public.patient_profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "patient updates own medical" on public.patient_profiles
  for update to authenticated using (auth.uid() = user_id);

-- ===== EMERGENCY CONTACTS =====
create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relation text,
  phone text,
  email text,
  notify_token text not null unique default encode(gen_random_bytes(24),'hex'),
  created_at timestamptz not null default now()
);
alter table public.emergency_contacts enable row level security;
grant select, insert, update, delete on public.emergency_contacts to authenticated;
grant all on public.emergency_contacts to service_role;
create policy "patient manages own contacts" on public.emergency_contacts
  for all to authenticated using (auth.uid() = patient_id) with check (auth.uid() = patient_id);

-- ===== EMERGENCY TOKENS (QR) =====
create table public.emergency_tokens (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24),'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.emergency_tokens enable row level security;
grant select, insert, update on public.emergency_tokens to authenticated;
grant all on public.emergency_tokens to service_role;
create policy "patient reads own tokens" on public.emergency_tokens
  for select to authenticated using (auth.uid() = patient_id);
create policy "patient creates own tokens" on public.emergency_tokens
  for insert to authenticated with check (auth.uid() = patient_id);
create policy "patient updates own tokens" on public.emergency_tokens
  for update to authenticated using (auth.uid() = patient_id);

-- ===== EMTs =====
create table public.emts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) default '00000000-0000-0000-0000-000000000001',
  badge_no text,
  agency text,
  created_at timestamptz not null default now()
);
alter table public.emts enable row level security;
grant select on public.emts to authenticated;
grant all on public.emts to service_role;
create policy "emt reads own row" on public.emts
  for select to authenticated using (auth.uid() = user_id);

-- ===== HOSPITALS =====
create table public.hospitals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default '00000000-0000-0000-0000-000000000001',
  name text not null,
  address text,
  city text,
  phone text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
alter table public.hospitals enable row level security;
grant select on public.hospitals to authenticated;
grant all on public.hospitals to service_role;
-- All authenticated users (EMT picking destination, hospital staff, patients viewing route) can read hospitals
create policy "hospitals readable by authenticated" on public.hospitals
  for select to authenticated using (true);

create table public.hospital_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, hospital_id)
);
alter table public.hospital_staff enable row level security;
grant select on public.hospital_staff to authenticated;
grant all on public.hospital_staff to service_role;
create policy "staff reads own assignment" on public.hospital_staff
  for select to authenticated using (auth.uid() = user_id);

-- ===== EMERGENCY SESSIONS =====
create table public.emergency_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default '00000000-0000-0000-0000-000000000001',
  patient_id uuid not null references auth.users(id) on delete cascade,
  started_by_emt_id uuid references auth.users(id),
  status public.session_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
alter table public.emergency_sessions enable row level security;
grant select on public.emergency_sessions to authenticated;
grant all on public.emergency_sessions to service_role;
create policy "patient reads own sessions" on public.emergency_sessions
  for select to authenticated using (auth.uid() = patient_id);
create policy "emt reads sessions they started" on public.emergency_sessions
  for select to authenticated using (auth.uid() = started_by_emt_id);
-- Hospital staff read via incident → session policy below (handled in incidents)

-- ===== INCIDENTS =====
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default '00000000-0000-0000-0000-000000000001',
  session_id uuid not null references public.emergency_sessions(id) on delete cascade,
  patient_id uuid not null references auth.users(id),
  emt_id uuid not null references auth.users(id),
  hospital_id uuid references public.hospitals(id),
  status public.incident_status not null default 'pending',
  priority public.incident_priority,
  incident_type text,
  observations text,
  recommended_department text,
  transcript text,
  voice_note_url text,
  ai_summary jsonb,
  registration_number text unique,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  accepted_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz
);
alter table public.incidents enable row level security;
grant select, update on public.incidents to authenticated;
grant all on public.incidents to service_role;
create policy "patient reads own incidents" on public.incidents
  for select to authenticated using (auth.uid() = patient_id);
create policy "emt reads own incidents" on public.incidents
  for select to authenticated using (auth.uid() = emt_id);
create policy "hospital staff reads assigned incidents" on public.incidents
  for select to authenticated using (
    exists(
      select 1 from public.hospital_staff hs
      where hs.user_id = auth.uid() and hs.hospital_id = incidents.hospital_id
    )
  );
create policy "hospital staff updates assigned incidents" on public.incidents
  for update to authenticated using (
    exists(
      select 1 from public.hospital_staff hs
      where hs.user_id = auth.uid() and hs.hospital_id = incidents.hospital_id
    )
  );

-- Allow hospital staff to read the parent session for incidents assigned to them
create policy "hospital staff reads sessions of assigned incidents" on public.emergency_sessions
  for select to authenticated using (
    exists(
      select 1 from public.incidents i
      join public.hospital_staff hs on hs.hospital_id = i.hospital_id
      where i.session_id = emergency_sessions.id and hs.user_id = auth.uid()
    )
  );

-- ===== NOTIFICATIONS =====
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default '00000000-0000-0000-0000-000000000001',
  audience public.notification_audience not null,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_contact_id uuid references public.emergency_contacts(id) on delete cascade,
  channel public.notification_channel not null default 'in_app',
  incident_id uuid references public.incidents(id) on delete cascade,
  session_id uuid references public.emergency_sessions(id) on delete cascade,
  title text not null,
  body text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
create policy "recipient reads own notifications" on public.notifications
  for select to authenticated using (auth.uid() = recipient_user_id);
create policy "recipient marks own notifications" on public.notifications
  for update to authenticated using (auth.uid() = recipient_user_id);

-- ===== AUDIT LOGS =====
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default '00000000-0000-0000-0000-000000000001',
  actor_user_id uuid references auth.users(id),
  actor_role public.app_role,
  action public.audit_action not null,
  entity_type text,
  entity_id uuid,
  session_id uuid references public.emergency_sessions(id) on delete cascade,
  incident_id uuid references public.incidents(id) on delete cascade,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
-- Patients read audit logs for their sessions; EMTs and hospital staff via shared session
create policy "audit readable by session participants" on public.audit_logs
  for select to authenticated using (
    session_id is not null and exists (
      select 1 from public.emergency_sessions s
      where s.id = audit_logs.session_id and (
        s.patient_id = auth.uid()
        or s.started_by_emt_id = auth.uid()
        or exists (
          select 1 from public.incidents i
          join public.hospital_staff hs on hs.hospital_id = i.hospital_id
          where i.session_id = s.id and hs.user_id = auth.uid()
        )
      )
    )
  );

-- ===== TRIGGERS =====
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger trg_patient_profiles_updated before update on public.patient_profiles
  for each row execute function public.touch_updated_at();

-- ===== REALTIME =====
alter publication supabase_realtime add table public.incidents;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.audit_logs;
alter publication supabase_realtime add table public.emergency_sessions;

-- ===== STORAGE BUCKET =====
insert into storage.buckets (id, name, public)
values ('voice-notes','voice-notes', false)
on conflict (id) do nothing;

-- EMTs (authenticated) can upload to voice-notes; readers use signed URLs from server fns
create policy "authenticated can upload voice notes"
on storage.objects for insert to authenticated
with check (bucket_id = 'voice-notes');

create policy "authenticated can read voice notes"
on storage.objects for select to authenticated
using (bucket_id = 'voice-notes');

-- ===== SEED HOSPITALS =====
insert into public.hospitals (id, name, address, city, phone)
values
  ('11111111-1111-1111-1111-111111111111','Savitri General Hospital','12 Greenline Avenue','Bengaluru','+91-80-4000-1111'),
  ('22222222-2222-2222-2222-222222222222','Greenline Trauma Center','45 Emergency Road','Bengaluru','+91-80-4000-2222');
