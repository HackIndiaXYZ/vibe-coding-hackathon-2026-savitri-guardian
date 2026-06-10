
-- Add hospital workflow audit actions
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'EMT_ASSIGNED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'SCANNER_CALL_INITIATED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PATIENT_CALL_INITIATED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'EMERGENCY_CONTACT_CALL_INITIATED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'SCANNER_CALL_SIMULATED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PATIENT_CALL_SIMULATED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'EMERGENCY_CONTACT_CALL_SIMULATED';

-- Track EMT assignment on the session so hospital can dispatch before incident creation
ALTER TABLE public.emergency_sessions
  ADD COLUMN IF NOT EXISTS assigned_emt_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS assigned_by uuid;
