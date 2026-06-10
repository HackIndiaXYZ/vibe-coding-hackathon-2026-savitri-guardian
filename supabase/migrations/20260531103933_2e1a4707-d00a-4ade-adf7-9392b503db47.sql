
-- Extend audit_action enum with SOS-related events
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'SOS_TRIGGERED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'LOCATION_CAPTURED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'VOICE_RECORDING_STARTED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'VOICE_RECORDING_UPLOADED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'SOS_NOTIFICATION_SENT';

-- Extend emergency_sessions with SOS metadata
ALTER TABLE public.emergency_sessions
  ADD COLUMN IF NOT EXISTS gps_lat double precision,
  ADD COLUMN IF NOT EXISTS gps_lng double precision,
  ADD COLUMN IF NOT EXISTS gps_accuracy double precision,
  ADD COLUMN IF NOT EXISTS triggered_via text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS silent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS voice_note_path text,
  ADD COLUMN IF NOT EXISTS recording_status text;

-- Allow patient to open their own session (for SOS)
DROP POLICY IF EXISTS "patient opens own session" ON public.emergency_sessions;
CREATE POLICY "patient opens own session"
  ON public.emergency_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS "patient updates own session" ON public.emergency_sessions;
CREATE POLICY "patient updates own session"
  ON public.emergency_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = patient_id);
