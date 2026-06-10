import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "voice-notes";

export async function createVoiceNoteSignedUrl(path: string | null | undefined) {
  if (!path) return null;
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function resolveSosVoiceNotePath({
  patientId,
  sessionId,
  fallbackPath,
}: {
  patientId: string;
  sessionId: string;
  fallbackPath?: string | null;
}) {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(patientId, { limit: 10, search: `sos-${sessionId}` });
  const found = data?.find((obj) => obj.name.startsWith(`sos-${sessionId}.`));
  if (found) return `${patientId}/${found.name}`;
  return fallbackPath?.includes(`/sos-${sessionId}`) ? fallbackPath : null;
}

export async function getLatestEmtVoiceNotePath(sessionId: string, fallbackPath?: string | null) {
  const { data } = await supabaseAdmin
    .from("audit_logs")
    .select("metadata")
    .eq("session_id", sessionId)
    .eq("action", "VOICE_RECORDING_UPLOADED")
    .eq("actor_role", "emt")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const auditPath = (data?.metadata as any)?.storage_path as string | undefined;
  if (auditPath) return auditPath;
  return fallbackPath && !fallbackPath.includes("/sos-") ? fallbackPath : null;
}