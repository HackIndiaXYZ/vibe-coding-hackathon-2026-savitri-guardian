-- New audit actions
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PUBLIC_EMERGENCY_REPORTED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PATIENT_USER_EMERGENCY_REPORTED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'EMT_ACCESS_GRANTED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'HOSPITAL_ACCESS_GRANTED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'MEDICAL_INFO_DISCLOSED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'EMERGENCY_CALL_INITIATED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'EMERGENCY_CALL_SIMULATED';

-- Scanner identity + demo-mode columns on emergency_sessions
ALTER TABLE public.emergency_sessions
  ADD COLUMN IF NOT EXISTS scanner_type text,
  ADD COLUMN IF NOT EXISTS scanner_user_id uuid,
  ADD COLUMN IF NOT EXISTS scanner_phone text,
  ADD COLUMN IF NOT EXISTS scanner_verification_method text,
  ADD COLUMN IF NOT EXISTS location_source text NOT NULL DEFAULT 'device',
  ADD COLUMN IF NOT EXISTS demo_mode boolean NOT NULL DEFAULT false;

-- Document accepted values; not enforced as enums to keep flexibility for hackathon iteration.
COMMENT ON COLUMN public.emergency_sessions.scanner_type IS 'emt | hospital | patient_user | public | null';
COMMENT ON COLUMN public.emergency_sessions.scanner_verification_method IS 'authenticated | otp | demo_verification | null';
COMMENT ON COLUMN public.emergency_sessions.location_source IS 'device | demo';