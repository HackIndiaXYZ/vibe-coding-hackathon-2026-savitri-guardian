import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createVoiceNoteSignedUrl, resolveSosVoiceNotePath } from "@/lib/voice-notes.server";
import { z } from "zod";

export const resolveContactNotification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { data: contact } = await supabaseAdmin
      .from("emergency_contacts")
      .select("id, name, relation, patient_id")
      .eq("notify_token", data.token)
      .maybeSingle();
    if (!contact) return { contact: null, patient: null, incident: null, sos: null };

    const [{ data: patient }, incidentRes, { data: sosSession }, { data: latestSession }] = await Promise.all([
      supabaseAdmin.from("profiles").select("full_name, phone").eq("id", contact.patient_id).maybeSingle(),
      supabaseAdmin
        .from("incidents")
        .select("session_id, status, registration_number, hospital_id, submitted_at, accepted_at, arrived_at, priority, incident_type, observations, ai_summary, recommended_department")
        .eq("patient_id", contact.patient_id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("emergency_sessions")
        .select("id, opened_at, closed_at, status, gps_lat, gps_lng, gps_accuracy, triggered_via, silent, ai_summary, voice_note_path, recording_status")
        .eq("patient_id", contact.patient_id)
        .in("triggered_via", ["sos", "sos_silent"])
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("emergency_sessions")
        .select("id")
        .eq("patient_id", contact.patient_id)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    let incident: any = incidentRes.data ?? null;
    if (incident?.hospital_id) {
      const { data: hospital } = await supabaseAdmin
        .from("hospitals")
        .select("name, city, phone")
        .eq("id", incident.hospital_id)
        .maybeSingle();
      incident = { ...incident, hospitals: hospital };
    }

    let sos = null as null | (NonNullable<typeof sosSession> & { maps_url: string | null; voice_note_url: string | null; location_source: "device" | "demo" | null });
    if (sosSession) {
      const maps_url = sosSession.gps_lat != null && sosSession.gps_lng != null
        ? `https://www.google.com/maps?q=${sosSession.gps_lat},${sosSession.gps_lng}`
        : null;
      const voice_note_path = await resolveSosVoiceNotePath({ patientId: contact.patient_id, sessionId: sosSession.id, fallbackPath: sosSession.voice_note_path });
      const voice_note_url = await createVoiceNoteSignedUrl(voice_note_path);
      // derive location_source from most recent LOCATION_CAPTURED audit row
      let location_source: "device" | "demo" | null = null;
      if (sosSession.gps_lat != null && sosSession.gps_lng != null) {
        const { data: cap } = await supabaseAdmin
          .from("audit_logs")
          .select("metadata")
          .eq("session_id", sosSession.id)
          .eq("action", "LOCATION_CAPTURED")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const src = (cap?.metadata as any)?.source;
        location_source = src === "demo" ? "demo" : "device";
      }
      sos = { ...sosSession, voice_note_path, maps_url, voice_note_url, location_source };
    }

    const timelineSessionId = sosSession?.id ?? incident?.session_id ?? latestSession?.id ?? null;
    let timeline: Array<{ id: string; action: string; created_at: string; metadata: any }> = [];
    if (timelineSessionId) {
      const { data: logs } = await supabaseAdmin
        .from("audit_logs")
        .select("id, action, created_at, metadata")
        .eq("session_id", timelineSessionId)
        .order("created_at", { ascending: true });
      timeline = (logs ?? []) as typeof timeline;
    }

    // Reporter info pill — WHO reported the emergency and HOW confident we are.
    // Never expose scanner phone number to emergency contacts.
    let report:
      | null
      | {
          reporter_type: "public" | "patient_user" | "emt" | "patient_self" | null;
          reporter_label: string;
          confidence: "Public Report" | "Patient Report" | "EMT Confirmed";
          time_reported: string;
          demo_mode: boolean;
          location_source: "device" | "demo" | null;
        } = null;
    if (timelineSessionId) {
      const { data: latest } = await supabaseAdmin
        .from("emergency_sessions")
        .select("scanner_type, triggered_via, opened_at, demo_mode, location_source")
        .eq("id", timelineSessionId)
        .maybeSingle();
      if (latest) {
        const st = (latest.scanner_type as string | null) ?? null;
        const tv = latest.triggered_via;
        let rt: "public" | "patient_user" | "emt" | "patient_self" | null = null;
        if (st === "public") rt = "public";
        else if (st === "patient_user") rt = "patient_user";
        else if (st === "emt" || tv === "emt") rt = "emt";
        else if (tv === "sos" || tv === "sos_silent") rt = "patient_self";
        const confidence: "Public Report" | "Patient Report" | "EMT Confirmed" =
          incident?.status && incident.status !== "pending"
            ? "EMT Confirmed"
            : rt === "public"
              ? "Public Report"
              : rt === "emt"
                ? "EMT Confirmed"
                : "Patient Report";
        const labelMap: Record<string, string> = {
          public: "Public User",
          patient_user: "Patient User",
          emt: "EMT",
          patient_self: "Patient (self)",
        };
        report = {
          reporter_type: rt,
          reporter_label: rt ? labelMap[rt] : "Unknown",
          confidence,
          time_reported: latest.opened_at,
          demo_mode: !!latest.demo_mode,
          location_source: (latest.location_source as any) ?? null,
        };
      }
    }

    return { contact, patient, incident, sos, timeline, report };
  });
