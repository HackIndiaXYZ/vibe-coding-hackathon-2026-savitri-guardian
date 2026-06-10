
-- Tighten voice-notes storage policies and enable RLS on realtime.messages

DROP POLICY IF EXISTS "authenticated can read voice notes" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can upload voice notes" ON storage.objects;

-- Uploads must be scoped under the uploader's own user id folder: {auth.uid()}/...
CREATE POLICY "voice-notes: user uploads own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'voice-notes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "voice-notes: user updates own folder"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'voice-notes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "voice-notes: user deletes own folder"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Reads restricted to incident participants (patient, EMT, assigned hospital staff)
-- or the uploader themselves.
CREATE POLICY "voice-notes: participants read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.voice_note_url IS NOT NULL
        AND i.voice_note_url LIKE '%' || storage.objects.name
        AND (
          i.patient_id = auth.uid()
          OR i.emt_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.hospital_staff hs
            WHERE hs.user_id = auth.uid() AND hs.hospital_id = i.hospital_id
          )
        )
    )
  )
);

-- Realtime channel authorization: enable RLS and deny broadcast/presence by default.
-- Postgres_changes subscriptions continue to be gated by RLS on the underlying tables.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
