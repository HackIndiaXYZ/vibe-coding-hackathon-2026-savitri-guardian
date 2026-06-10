import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const TENANT = "00000000-0000-0000-0000-000000000001";

export const getEmergencyTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: logs } = await supabaseAdmin.from("audit_logs")
      .select("*").eq("session_id", data.session_id).order("created_at", { ascending: true });
    const { data: incident } = await supabaseAdmin.from("incidents")
      .select("*, hospitals(name)").eq("session_id", data.session_id).maybeSingle();
    return { logs: logs ?? [], incident };
  });

/**
 * Audit a voice-note playback. Used by EMT + Hospital views.
 * Captures listener_user, listener_role, session_id, source (sos|emt), timestamp.
 */
export const logVoiceNotePlayed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    session_id: z.string().uuid(),
    source: z.enum(["sos", "emt"]),
    listener_role: z.enum(["emt", "hospital", "patient", "emergency_contact"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await supabaseAdmin.from("audit_logs").insert({
      action: "VOICE_NOTE_PLAYED" as any,
      actor_user_id: userId,
      actor_role: data.listener_role as any,
      entity_type: "emergency_session",
      entity_id: data.session_id,
      session_id: data.session_id,
      tenant_id: TENANT,
      metadata: {
        listener_user: userId,
        listener_role: data.listener_role,
        source: data.source,
        played_at: new Date().toISOString(),
      },
    });
    return { ok: true as const };
  });

/**
 * Token-based playback audit for the public emergency-contact page.
 */
export const logContactVoiceNotePlayed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string().min(1).max(200),
    session_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { data: contact } = await supabaseAdmin
      .from("emergency_contacts")
      .select("id, patient_id")
      .eq("notify_token", data.token)
      .maybeSingle();
    if (!contact) return { ok: false as const };
    // ensure session belongs to this contact's patient
    const { data: sess } = await supabaseAdmin
      .from("emergency_sessions")
      .select("id, patient_id")
      .eq("id", data.session_id)
      .maybeSingle();
    if (!sess || sess.patient_id !== contact.patient_id) return { ok: false as const };
    await supabaseAdmin.from("audit_logs").insert({
      action: "VOICE_NOTE_PLAYED" as any,
      actor_role: "emergency_contact" as any,
      entity_type: "emergency_session",
      entity_id: data.session_id,
      session_id: data.session_id,
      tenant_id: TENANT,
      metadata: {
        listener_role: "emergency_contact",
        listener_contact_id: contact.id,
        source: "sos",
        played_at: new Date().toISOString(),
      },
    });
    return { ok: true as const };
  });
