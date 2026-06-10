import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const TENANT = "00000000-0000-0000-0000-000000000001";

function mapsLinkFor(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

const LocationSource = z.enum(["device", "demo"]).default("device");

const TriggerInput = z.object({
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().min(0).max(100000).nullable().optional(),
  location_error: z.enum(["permission_denied", "timeout", "position_unavailable", "browser_restriction", "unknown"]).nullable().optional(),
  location_error_message: z.string().max(300).nullable().optional(),
  location_source: LocationSource.optional(),
  silent: z.boolean().default(false),
});

const RetryLocationInput = z.object({
  session_id: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000).nullable().optional(),
  source: LocationSource.optional(),
});

const LocationFailureInput = z.object({
  session_id: z.string().uuid(),
  reason: z.enum(["permission_denied", "timeout", "position_unavailable", "browser_restriction", "unknown"]),
  message: z.string().max(300).nullable().optional(),
});

/**
 * Patient-initiated SOS.
 * 1. Open emergency session with captured GPS.
 * 2. Audit SOS_TRIGGERED + LOCATION_CAPTURED.
 * 3. Notify every emergency contact in-app (real-time) with patient name,
 *    coordinates, Maps link, timestamp, session id, and the contact-token URL.
 * 4. Audit SOS_NOTIFICATION_SENT for each contact.
 */
export const triggerSos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TriggerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const triggeredAt = new Date().toISOString();

    // 1. Open session (RLS: patient_id = auth.uid())
    const { data: session, error: sessErr } = await supabase
      .from("emergency_sessions")
      .insert({
        patient_id: userId,
        status: "open",
        tenant_id: TENANT,
        gps_lat: data.lat ?? null,
        gps_lng: data.lng ?? null,
        gps_accuracy: data.accuracy ?? null,
        triggered_via: data.silent ? "sos_silent" : "sos",
        silent: data.silent,
        recording_status: "pending",
      })
      .select()
      .single();
    if (sessErr || !session) throw new Error(sessErr?.message ?? "Failed to open session");

    const hasLocation = data.lat != null && data.lng != null;

    // 2. Audit events
    await supabaseAdmin.from("audit_logs").insert([
      { action: "SOS_TRIGGERED", actor_user_id: userId, actor_role: "patient",
        entity_type: "emergency_session", entity_id: session.id, session_id: session.id,
        tenant_id: TENANT, metadata: { silent: data.silent, triggered_at: triggeredAt } },
      ...(hasLocation ? [{
        action: "LOCATION_CAPTURED" as const, actor_user_id: userId, actor_role: "patient" as const,
        entity_type: "emergency_session", entity_id: session.id, session_id: session.id,
        tenant_id: TENANT, metadata: { lat: data.lat, lng: data.lng, accuracy: data.accuracy, source: data.location_source ?? "device" },
      }] : [{
        action: "LOCATION_CAPTURE_FAILED" as any, actor_user_id: userId, actor_role: "patient" as const,
        entity_type: "emergency_session", entity_id: session.id, session_id: session.id,
        tenant_id: TENANT, metadata: { reason: data.location_error ?? "unknown", message: data.location_error_message ?? null },
      }]),
    ]);

    // 3. Fetch patient profile + contacts
    const [{ data: profile }, { data: contacts }] = await Promise.all([
      supabaseAdmin.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("emergency_contacts").select("id, name, phone, email, notify_token, patient_id").eq("patient_id", userId),
    ]);

    const maps_url = mapsLinkFor(data.lat, data.lng);
    const baseTitle = `SOS — ${profile?.full_name ?? "Patient"} needs help`;

    if (contacts && contacts.length > 0) {
      const rows = contacts.map((c) => ({
        audience: "emergency_contact" as const,
        channel: "in_app" as const,
        recipient_contact_id: c.id,
        tenant_id: TENANT,
        session_id: session.id,
        title: baseTitle,
        body: data.silent
          ? "Silent SOS triggered. Tap to view live status and location."
          : "SOS triggered. Tap to view live status, location, and recording.",
        payload: {
          kind: "sos",
          patient_name: profile?.full_name ?? null,
          patient_phone: profile?.phone ?? null,
          session_id: session.id,
          triggered_at: triggeredAt,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          accuracy: data.accuracy ?? null,
          location_status: hasLocation ? "captured" : "unavailable",
          location_source: hasLocation ? (data.location_source ?? "device") : null,
          location_error: hasLocation ? null : data.location_error ?? "unknown",
          location_error_message: hasLocation ? null : data.location_error_message ?? null,
          maps_url,
          notify_url: `/n/${c.notify_token}`,
          silent: data.silent,
          recording_status: "pending",
          ai_summary: null,
        },
      }));
      await supabaseAdmin.from("notifications").insert(rows);
      await supabaseAdmin.from("audit_logs").insert(
        contacts.map((c) => ({
          action: "SOS_NOTIFICATION_SENT" as const, actor_user_id: userId, actor_role: "patient" as const,
          entity_type: "emergency_contact", entity_id: c.id, session_id: session.id,
          tenant_id: TENANT, metadata: { contact_name: c.name },
        }))
      );
    }

    return { session_id: session.id, maps_url, notified: contacts?.length ?? 0 };
  });

export const updateSosLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RetryLocationInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const maps_url = mapsLinkFor(data.lat, data.lng);

    const { data: session, error } = await supabaseAdmin
      .from("emergency_sessions")
      .update({ gps_lat: data.lat, gps_lng: data.lng, gps_accuracy: data.accuracy ?? null })
      .eq("id", data.session_id)
      .eq("patient_id", userId)
      .select("id")
      .single();
    if (error || !session) throw new Error(error?.message ?? "Session not found");

    await supabaseAdmin.from("audit_logs").insert({
      action: "LOCATION_CAPTURED", actor_user_id: userId, actor_role: "patient",
      entity_type: "emergency_session", entity_id: data.session_id, session_id: data.session_id,
      tenant_id: TENANT, metadata: { lat: data.lat, lng: data.lng, accuracy: data.accuracy ?? null, source: data.source ?? "device" },
    });

    const { data: notifs } = await supabaseAdmin
      .from("notifications").select("id, payload").eq("session_id", data.session_id).eq("audience", "emergency_contact");
    if (notifs) {
      await Promise.all(notifs.map((n) => supabaseAdmin.from("notifications").update({
        payload: {
          ...(n.payload as any),
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy ?? null,
          location_status: "captured",
          location_source: data.source ?? "device",
          location_error: null,
          location_error_message: null,
          maps_url,
        },
      }).eq("id", n.id)));
    }

    return { ok: true, maps_url };
  });

export const recordSosLocationFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LocationFailureInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: session } = await supabaseAdmin
      .from("emergency_sessions").select("id, patient_id").eq("id", data.session_id).maybeSingle();
    if (!session || session.patient_id !== userId) throw new Error("Session not found");

    await supabaseAdmin.from("audit_logs").insert({
      action: "LOCATION_CAPTURE_FAILED" as any, actor_user_id: userId, actor_role: "patient",
      entity_type: "emergency_session", entity_id: data.session_id, session_id: data.session_id,
      tenant_id: TENANT, metadata: { reason: data.reason, message: data.message ?? null, source: "retry" },
    });

    return { ok: true };
  });

const UploadInput = z.object({
  session_id: z.string().uuid(),
  audio_base64: z.string().min(20).max(20_000_000), // ~15MB cap
  mime: z.string().min(3).max(60).default("audio/webm"),
  duration_sec: z.number().min(0).max(120).optional(),
});

/**
 * Uploads SOS audio + asks Lovable AI for a short summary, then patches all
 * pending SOS notifications for this session so contact pages update live.
 */
export const uploadSosRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // ownership check
    const { data: session } = await supabaseAdmin
      .from("emergency_sessions").select("id, patient_id, gps_lat, gps_lng")
      .eq("id", data.session_id).maybeSingle();
    if (!session || session.patient_id !== userId) throw new Error("Session not found");

    await supabaseAdmin.from("audit_logs").insert({
      action: "VOICE_RECORDING_STARTED", actor_user_id: userId, actor_role: "patient",
      entity_type: "emergency_session", entity_id: session.id, session_id: session.id, tenant_id: TENANT,
    });

    // Decode + upload
    const bytes = Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0));
    const ext = data.mime.includes("mp4") ? "m4a" : data.mime.includes("ogg") ? "ogg" : "webm";
    const path = `${userId}/sos-${session.id}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("voice-notes")
      .upload(path, bytes, { contentType: data.mime, upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    await supabaseAdmin.from("emergency_sessions")
      .update({ voice_note_path: path, recording_status: "uploaded" })
      .eq("id", session.id);

    await supabaseAdmin.from("audit_logs").insert({
      action: "VOICE_RECORDING_UPLOADED", actor_user_id: userId, actor_role: "patient",
      entity_type: "emergency_session", entity_id: session.id, session_id: session.id,
      tenant_id: TENANT, metadata: { path, duration_sec: data.duration_sec ?? null },
    });

    // 4. Try AI summary via Lovable AI Gateway (best-effort)
    let summary: string | null = null;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (aiKey) {
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "You analyze short emergency voice notes. Reply with a 1–3 sentence plain-text summary covering: stated emergency, perceived severity, location cues, and any specific help requested. No markdown, no headings.",
              },
              {
                role: "user",
                content: [
                  { type: "text", text: "Summarize this emergency voice note for the patient's emergency contact." },
                  { type: "input_audio", input_audio: { data: data.audio_base64, format: ext === "m4a" ? "mp4" : ext } },
                ],
              },
            ],
          }),
        });
        if (resp.ok) {
          const json: any = await resp.json();
          summary = json?.choices?.[0]?.message?.content?.toString().trim() ?? null;
        }
      } catch { /* keep summary null */ }
    }

    if (!summary) summary = "Voice recording received. Listen for full context.";

    await supabaseAdmin.from("emergency_sessions")
      .update({ ai_summary: summary, recording_status: "summarized" })
      .eq("id", session.id);

    // 5. Patch all SOS notifications for this session so contacts see the update live
    const { data: notifs } = await supabaseAdmin
      .from("notifications").select("id, payload").eq("session_id", session.id);
    if (notifs) {
      await Promise.all(notifs.map((n) => {
        const payload = { ...(n.payload as any), ai_summary: summary, recording_status: "summarized", voice_note_path: path };
        return supabaseAdmin.from("notifications").update({ payload }).eq("id", n.id);
      }));
    }

    return { ok: true, summary };
  });

const CancelInput = z.object({ session_id: z.string().uuid() });
export const cancelSos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CancelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await supabaseAdmin.from("emergency_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString(), recording_status: "cancelled" })
      .eq("id", data.session_id).eq("patient_id", userId);
    return { ok: true };
  });
