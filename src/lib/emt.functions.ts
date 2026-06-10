import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEMO_MODE } from "@/lib/demo-mode";
import { createVoiceNoteSignedUrl, getLatestEmtVoiceNotePath, resolveSosVoiceNotePath } from "@/lib/voice-notes.server";
import { z } from "zod";

// Exported for regression tests — must stay in sync with the equivalent
// extractToken() in src/routes/emt/scan.tsx (manual paste + camera path).
export function normalizeTokenInput(raw: string): string {
  const cleaned = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .trim();
  const m = cleaned.match(/\/e\/([A-Za-z0-9]+)/);
  return (m ? m[1] : cleaned.replace(/[?#].*$/, "")).trim();
}

/**
 * Plain-column token lookup used by scanEmergencyToken().
 *
 * REGRESSION NOTE (Savitri Emergency Workflow incident, May 2026):
 *   A previous implementation used a PostgREST embed
 *     .select("*, patient:patient_id(*)")
 *   on emergency_tokens. No FK from emergency_tokens.patient_id to profiles
 *   is registered in the PostgREST schema cache, so the embed silently
 *   errored and returned `null` even when an active token row existed.
 *   The EMT UI then displayed "QR not recognized" for valid scans.
 *
 *   This helper MUST keep using plain-column selects. The patient profile is
 *   fetched separately by the caller. Do not reintroduce embedded
 *   relationship queries here.
 */
export async function findActiveTokenRow(
  client: { from: (t: string) => any },
  token: string,
): Promise<{
  tok: { id: string; token: string; active: boolean; patient_id: string } | null;
  inactiveExisted: boolean;
}> {
  const { data: tok } = await client
    .from("emergency_tokens")
    .select("id, token, active, patient_id")
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();
  if (tok) return { tok, inactiveExisted: false };

  const { data: inactive } = await client
    .from("emergency_tokens")
    .select("id, active")
    .eq("token", token)
    .maybeSingle();
  return { tok: null, inactiveExisted: !!inactive && inactive.active === false };
}

// traceEmergencyToken was removed in v1.0 release-candidate cleanup.
// It was a DEMO_MODE-only diagnostic added during the May 2026 EMT QR
// incident investigation; the regression is now covered by the test suite
// in tests/scanEmergencyToken.test.ts (see RELEASE_NOTES_v1.0.md).

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
const DEMO_PATIENT_EMAIL = "demo.patient@savitri.app";

function getMaskedDemoTokenParts(token: string) {
  const match = token.match(/^([A-Za-z0-9]{8})(?:…|\.\.\.)([A-Za-z0-9]{6})$/);
  return match ? { prefix: match[1], suffix: match[2] } : null;
}

// EMT: scan a QR token, get emergency profile, start session
async function ensureEmtRow(userId: string): Promise<boolean> {
  const { data: emt } = await supabaseAdmin
    .from("emts").select("user_id").eq("user_id", userId).maybeSingle();
  if (emt) return true;
  // Auto-enroll any user that already holds the `emt` role.
  const { data: role } = await supabaseAdmin
    .from("user_roles").select("user_id").eq("user_id", userId).eq("role", "emt").maybeSingle();
  if (!role) return false;
  await supabaseAdmin.from("emts").insert({
    user_id: userId, tenant_id: DEFAULT_TENANT,
    badge_no: `EMT-${userId.slice(0, 6).toUpperCase()}`, agency: "Savitri EMS",
  });
  return true;
}

export const scanEmergencyToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z
          .string()
          .max(500)
          // QR may encode a raw token or a full /e/<token> URL; also strip
          // stray quotes, whitespace, zero-width chars, and trailing
          // query/fragment that copy-paste sometimes drags along.
          .transform((s) => {
            const cleaned = s
              .replace(/[\u200B-\u200D\uFEFF]/g, "")
              .replace(/^["'`\s]+|["'`\s]+$/g, "")
              .trim();
            const m = cleaned.match(/\/e\/([A-Za-z0-9]+)/);
            return (m ? m[1] : cleaned.replace(/[?#].*$/, "")).trim();
          })
          .pipe(z.string().min(8, "QR token is too short or unreadable").max(200)),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    console.info("[scanEmergencyToken] SCAN_FN_ENTER");
    const { userId } = context;
    // verify (or auto-enroll) EMT
    const ok = await ensureEmtRow(userId);
    if (!ok) {
      console.warn("[scanEmergencyToken] SCAN_FN_EXIT_FAIL: not authorized as EMT");
      throw new Error("Not authorized as EMT");
    }

    const inputPreview =
      data.token.length > 14
        ? `${data.token.slice(0, 8)}…${data.token.slice(-6)} (len=${data.token.length})`
        : `${data.token} (len=${data.token.length})`;
    console.info("[scanEmergencyToken] RESOLVER_INPUT:", inputPreview);

    // NOTE: avoid PostgREST embed (`patient:patient_id(*)`) — there is no
    // declared FK from emergency_tokens.patient_id to profiles, so the embed
    // returns an error and a null row even when the token exists. The patient
    // profile is fetched separately below.
    let { data: tok, error: tokErr } = await supabaseAdmin.from("emergency_tokens")
      .select("id, token, active, patient_id").eq("token", data.token).eq("active", true).maybeSingle();
    if (tokErr) console.warn("[scanEmergencyToken] primary query error:", tokErr.message);

    console.info("[scanEmergencyToken] TOKEN_FOUND:", !!tok);

    let inactiveExisted = false;
    if (!tok) {
      const { data: inactive } = await supabaseAdmin.from("emergency_tokens")
        .select("id, active").eq("token", data.token).maybeSingle();
      inactiveExisted = !!inactive && inactive.active === false;
      console.info("[scanEmergencyToken] inactive-token exists:", inactiveExisted);
    }

    const maskedParts = getMaskedDemoTokenParts(data.token);
    if (!tok && DEMO_MODE && maskedParts) {
      const { data: matches } = await supabaseAdmin.from("emergency_tokens")
        .select("id, token, active, patient_id")
        .eq("active", true)
        .ilike("token", `${maskedParts.prefix}%${maskedParts.suffix}`)
        .limit(2);
      tok = matches?.length === 1 ? matches[0] : null;
      console.info("[scanEmergencyToken] masked fallback:", !!tok);
    }

    if (!tok && DEMO_MODE) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const demoPatientId = users?.users.find((u) => u.email === DEMO_PATIENT_EMAIL)?.id;
      if (demoPatientId) {
        const { data: demoToken } = await supabaseAdmin.from("emergency_tokens")
          .select("id, token, active, patient_id")
          .eq("patient_id", demoPatientId)
          .eq("active", true)
          .maybeSingle();
        tok = demoToken ?? null;
        console.info("[scanEmergencyToken] demo-patient fallback:", !!tok);
      }
    }

    console.info("[scanEmergencyToken] RESOLVED_TOKEN patient_id:", tok?.patient_id ?? "(none)");


    if (!tok) {
      const friendly = [
        "QR not recognized.",
        "",
        "Possible reasons:",
        "• Patient generated a newer QR",
        "• Token is invalid",
        "• Token belongs to another environment",
        "",
        "For demo use: Patient → My QR → Copy Token.",
      ].join("\n");
      return {
        ok: false as const,
        error: maskedParts
          ? "That is an abbreviated display token. Use 'Copy Token' on the patient's QR screen or scan the QR code."
          : friendly,
        revoked: inactiveExisted,
      };
    }

    if (DEMO_MODE) console.info("[scanEmergencyToken] resolved patient_id:", tok.patient_id);

    const patientId = tok.patient_id;
    const [profile, medical, contacts] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", patientId).maybeSingle(),
      supabaseAdmin.from("patient_profiles").select("*").eq("user_id", patientId).maybeSingle(),
      supabaseAdmin.from("emergency_contacts").select("*").eq("patient_id", patientId),
    ]);

    await supabaseAdmin.from("audit_logs").insert([
      { action: "QR_SCANNED", actor_user_id: userId, actor_role: "emt",
        entity_type: "patient", entity_id: patientId, tenant_id: DEFAULT_TENANT },
    ]);

    console.info("[scanEmergencyToken] PATIENT_FOUND:", patientId);
    console.info("[scanEmergencyToken] SCAN_FN_EXIT_SUCCESS");
    return {
      ok: true as const,
      patient: profile.data,
      medical: medical.data,
      contacts: contacts.data ?? [],
      patient_id: patientId,
    };
  });

export const startEmergencySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ patient_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const ok = await ensureEmtRow(userId);
    if (!ok) throw new Error("Not authorized");


    // reuse existing open session?
    const { data: existing } = await supabaseAdmin.from("emergency_sessions")
      .select("*").eq("patient_id", data.patient_id).eq("status", "open").maybeSingle();
    if (existing) return existing;

    const { data: session, error } = await supabaseAdmin.from("emergency_sessions")
      .insert({ patient_id: data.patient_id, started_by_emt_id: userId, tenant_id: DEFAULT_TENANT })
      .select().single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      action: "EMERGENCY_SESSION_CREATED", actor_user_id: userId, actor_role: "emt",
      entity_type: "emergency_session", entity_id: session.id, session_id: session.id, tenant_id: DEFAULT_TENANT,
    });


    // notify contacts (link-based, in-app log only)
    const { data: contacts } = await supabaseAdmin.from("emergency_contacts")
      .select("*").eq("patient_id", data.patient_id);
    if (contacts?.length) {
      await supabaseAdmin.from("notifications").insert(contacts.map((c) => ({
        tenant_id: DEFAULT_TENANT,
        audience: "emergency_contact" as const,
        channel: "in_app" as const,
        recipient_contact_id: c.id,
        title: "Emergency alert",
        body: `An emergency session was started for your contact. Open the secure link to view status.`,
        session_id: session.id,
        payload: { notify_token: c.notify_token, contact_name: c.name },
      })));
      await supabaseAdmin.from("audit_logs").insert({
        action: "CONTACT_NOTIFIED", actor_user_id: userId, actor_role: "emt",
        entity_type: "emergency_session", entity_id: session.id, session_id: session.id, tenant_id: DEFAULT_TENANT,
        metadata: { contact_count: contacts.length },
      });
    }
    // notify patient
    await supabaseAdmin.from("notifications").insert({
      tenant_id: DEFAULT_TENANT, audience: "patient", channel: "in_app",
      recipient_user_id: data.patient_id,
      title: "Emergency session started",
      body: "An EMT has started an emergency session on your behalf.",
      session_id: session.id,
    });
    return session;
  });

const ReportInput = z.object({
  session_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  transcript: z.string().max(8000).optional().nullable(),
  observations: z.string().max(4000).optional().nullable(),
  incident_type: z.string().max(80).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  recommended_department: z.string().max(80).optional().nullable(),
  ai_summary: z.record(z.string(), z.any()).optional().nullable(),
  hospital_id: z.string().uuid(),
  submission_mode: z.enum(["ai", "manual"]).optional().nullable(),
  confidence: z.enum(["high", "medium", "low"]).optional().nullable(),
});

const VALIDATION_ACTIONS = [
  "TRANSCRIPT_VALIDATION_FAILED",
  "AI_SUMMARY_VALIDATION_FAILED",
  "MANUAL_INCIDENT_ASSESSMENT",
] as const;

export const recordEmtValidationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    session_id: z.string().uuid(),
    incident_id: z.string().uuid().optional().nullable(),
    action: z.enum(VALIDATION_ACTIONS),
    metadata: z.record(z.string(), z.any()).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await supabaseAdmin.from("audit_logs").insert({
      action: data.action,
      actor_user_id: userId,
      actor_role: "emt",
      entity_type: "emergency_session",
      entity_id: data.session_id,
      session_id: data.session_id,
      incident_id: data.incident_id ?? null,
      tenant_id: DEFAULT_TENANT,
      metadata: { ...(data.metadata ?? {}), at: new Date().toISOString() },
    });
    return { ok: true as const };
  });

export const submitIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: emt } = await supabaseAdmin.from("emts").select("*").eq("user_id", userId).maybeSingle();
    if (!emt) throw new Error("Not authorized");

    // Submission quality gate (server-side defense in depth).
    const missing: string[] = [];
    if (!data.observations?.trim()) missing.push("observations");
    if (!data.incident_type?.trim()) missing.push("incident_type");
    if (!data.recommended_department?.trim()) missing.push("recommended_department");
    if (!data.priority) missing.push("priority");
    if (data.submission_mode !== "manual" && (!data.transcript || data.transcript.trim().length <= 20)) {
      missing.push("transcript");
    }
    if (missing.length) {
      throw new Error(`Cannot submit: missing required fields (${missing.join(", ")}).`);
    }

    const now = new Date().toISOString();
    const emtVoiceNotePath = await getLatestEmtVoiceNotePath(data.session_id, null);
    // upsert by session_id
    const { data: existing } = await supabaseAdmin.from("incidents").select("id").eq("session_id", data.session_id).maybeSingle();

    const mergedAiSummary = {
      ...(data.ai_summary ?? {}),
      confidence: data.confidence ?? (data.ai_summary as any)?.confidence ?? "medium",
      submission_mode: data.submission_mode ?? "ai",
    };

    const payload = {
      session_id: data.session_id,
      patient_id: data.patient_id,
      emt_id: userId,
      hospital_id: data.hospital_id,
      transcript: data.transcript ?? null,
      observations: data.observations ?? null,
      incident_type: data.incident_type ?? null,
      priority: data.priority,
      recommended_department: data.recommended_department ?? null,
      ai_summary: mergedAiSummary,
      voice_note_url: emtVoiceNotePath,
      status: "pending" as const,
      submitted_at: now,
      tenant_id: DEFAULT_TENANT,
    };

    let incident;
    if (existing) {
      const { data: u, error } = await supabaseAdmin.from("incidents")
        .update(payload).eq("id", existing.id).select().single();
      if (error) throw new Error(error.message);
      incident = u;
    } else {
      const { data: i, error } = await supabaseAdmin.from("incidents")
        .insert(payload).select().single();
      if (error) throw new Error(error.message);
      incident = i;
    }

    await supabaseAdmin.from("audit_logs").insert([
      { action: "REPORT_SUBMITTED", actor_user_id: userId, actor_role: "emt",
        entity_type: "incident", entity_id: incident.id, incident_id: incident.id, session_id: data.session_id, tenant_id: DEFAULT_TENANT,
        metadata: { event: "EMT_REPORT_SUBMITTED", submitted_by_emt: userId, hospital_owner_id: data.hospital_id, submitted_at: now } },
      { action: "HOSPITAL_ALERTED", actor_user_id: userId, actor_role: "emt",
        entity_type: "hospital", entity_id: data.hospital_id, incident_id: incident.id, session_id: data.session_id, tenant_id: DEFAULT_TENANT },
    ]);

    // Ownership transfer: close the session so it leaves the hospital
    // "possible emergencies" queue and surfaces as a confirmed incident.
    await supabaseAdmin.from("emergency_sessions")
      .update({ status: "closed", closed_at: now })
      .eq("id", data.session_id);

    // notify hospital staff
    const { data: staff } = await supabaseAdmin.from("hospital_staff").select("user_id").eq("hospital_id", data.hospital_id);
    if (staff?.length) {
      await supabaseAdmin.from("notifications").insert(staff.map((s) => ({
        tenant_id: DEFAULT_TENANT, audience: "hospital" as const, channel: "in_app" as const,
        recipient_user_id: s.user_id, title: `Incoming ${data.priority.toUpperCase()} incident`,
        body: data.incident_type || "Incident report submitted",
        incident_id: incident.id, session_id: data.session_id,
      })));
    }

    // notify emergency contacts
    const { data: contacts } = await supabaseAdmin.from("emergency_contacts")
      .select("id, notify_token, name").eq("patient_id", data.patient_id);
    if (contacts?.length) {
      await supabaseAdmin.from("notifications").insert(contacts.map((c) => ({
        tenant_id: DEFAULT_TENANT, audience: "emergency_contact" as const, channel: "in_app" as const,
        recipient_contact_id: c.id, title: "Emergency report submitted",
        body: "An EMT has submitted an incident report. The hospital has been alerted.",
        incident_id: incident.id, session_id: data.session_id,
        payload: { notify_token: c.notify_token, contact_name: c.name, status: "submitted" },
      })));
      await supabaseAdmin.from("audit_logs").insert({
        action: "CONTACT_NOTIFIED", actor_user_id: userId, actor_role: "emt",
        entity_type: "incident", entity_id: incident.id, incident_id: incident.id,
        session_id: data.session_id, tenant_id: DEFAULT_TENANT,
        metadata: { contact_count: contacts.length, on: "report_submitted" },
      });
    }

    // patient notification
    await supabaseAdmin.from("notifications").insert({
      tenant_id: DEFAULT_TENANT, audience: "patient", channel: "in_app",
      recipient_user_id: data.patient_id,
      title: "Hospital has been alerted",
      body: `Your EMT submitted a ${data.priority.toUpperCase()} report to the hospital.`,
      incident_id: incident.id, session_id: data.session_id,
    });

    return incident;
  });

/* Attach an uploaded voice note to a session (storage upload happens client-side). */
export const attachVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    session_id: z.string().uuid(),
    storage_path: z.string().min(3).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const ok = await ensureEmtRow(userId);
    if (!ok) throw new Error("Not authorized");

    const { data: session } = await supabaseAdmin.from("emergency_sessions")
      .select("id, voice_note_path")
      .eq("id", data.session_id)
      .maybeSingle();

    const updatePayload: { recording_status?: string; voice_note_path?: string } = {};
    if (!session?.voice_note_path || !session.voice_note_path.includes(`/sos-${data.session_id}`)) {
      updatePayload.recording_status = "uploaded";
      updatePayload.voice_note_path = data.storage_path;
    }

    if (Object.keys(updatePayload).length) {
      await supabaseAdmin.from("emergency_sessions")
        .update(updatePayload)
        .eq("id", data.session_id);
    }

    const { data: incident } = await supabaseAdmin.from("incidents")
      .select("id").eq("session_id", data.session_id).maybeSingle();
    if (incident) {
      await supabaseAdmin.from("incidents")
        .update({ voice_note_url: data.storage_path }).eq("id", incident.id);
    }

    await supabaseAdmin.from("audit_logs").insert({
      action: "VOICE_RECORDING_UPLOADED", actor_user_id: userId, actor_role: "emt",
      entity_type: "emergency_session", entity_id: data.session_id,
      session_id: data.session_id, tenant_id: DEFAULT_TENANT,
      metadata: { storage_path: data.storage_path },
    });

    return { ok: true as const, storage_path: data.storage_path };
  });

// AI analysis via Lovable AI Gateway
const AIInput = z.object({
  transcript: z.string().min(1).max(8000),
  observations: z.string().max(4000).optional().nullable(),
});

export const analyzeIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AIInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway unavailable");

    const system = `You are an emergency medical triage assistant. Given an EMT's voice transcript and observations, return STRICT JSON only with this shape:
{
 "priority": "low" | "medium" | "high" | "critical",
 "incident_type": "short label (e.g. Road Accident, Cardiac Arrest, Fall, Burn)",
 "observations": "concise clinical summary, max 2 sentences",
 "recommended_department": "one of: Emergency Medicine, Trauma, Cardiology, Neurology, Orthopedics, Burns, Pediatrics, Obstetrics"
}
Return JSON only, no prose.`;

    const userMsg = `Transcript:\n${data.transcript}\n\nAdditional observations:\n${data.observations || "(none)"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI error: ${res.status} ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return parsed;
    } catch {
      return { priority: "medium", incident_type: "Unknown", observations: text.slice(0, 280), recommended_department: "Emergency Medicine" };
    }
  });

export const getEmtSessionDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: session } = await supabaseAdmin.from("emergency_sessions").select("*").eq("id", data.session_id).maybeSingle();
    if (!session) throw new Error("Session not found");
    const isOwner = session.started_by_emt_id === userId || (session as any).assigned_emt_id === userId;
    if (!isOwner) {
      // Caller must be an EMT to view/claim a session they don't own
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "emt").maybeSingle();
      if (!roleRow) throw new Error("Not authorized");
      // Auto-claim sessions that have no assigned EMT yet
      if (!session.started_by_emt_id && !(session as any).assigned_emt_id) {
        await supabaseAdmin.from("emergency_sessions")
          .update({ assigned_emt_id: userId }).eq("id", session.id);
        (session as any).assigned_emt_id = userId;
      } else {
        throw new Error("Not authorized");
      }
    }
    const [profile, medical, incident, hospitals, sosSessions] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", session.patient_id).maybeSingle(),
      supabaseAdmin.from("patient_profiles").select("*").eq("user_id", session.patient_id).maybeSingle(),
      supabaseAdmin.from("incidents").select("*, hospitals(name, address, city)").eq("session_id", session.id).maybeSingle(),
      supabaseAdmin.from("hospitals").select("*").order("name"),
      supabaseAdmin.from("emergency_sessions")
        .select("id, opened_at, voice_note_path, ai_summary, recording_status, triggered_via, silent")
        .eq("patient_id", session.patient_id)
        .in("triggered_via", ["sos", "sos_silent"])
        .not("voice_note_path", "is", null)
        .order("opened_at", { ascending: false })
        .limit(5),
    ]);
    const sos_recordings = await Promise.all(((sosSessions.data ?? []) as any[]).map(async (s) => {
      const sosPath = await resolveSosVoiceNotePath({ patientId: session.patient_id, sessionId: s.id, fallbackPath: s.voice_note_path });
      return { ...s, voice_note_path: sosPath, voice_note_url: await createVoiceNoteSignedUrl(sosPath) };
    }));
    const emtPath = await getLatestEmtVoiceNotePath(session.id, (incident.data as any)?.voice_note_url ?? session.voice_note_path);
    return {
      session, patient: profile.data, medical: medical.data,
      incident: incident.data, hospitals: hospitals.data ?? [],
      emt_recording: { voice_note_path: emtPath, voice_note_url: await createVoiceNoteSignedUrl(emtPath) },
      sos_recordings,
    };
  });

/**
 * EMT dashboard: assigned cases (hospital-dispatched) + cases the EMT started
 * themselves. Surfaces patient + reporter info so the EMT can act immediately.
 */
export const getEmtDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    await ensureEmtRow(userId);

    // Sessions assigned by hospital OR started by this EMT, still open.
    const { data: sessions } = await supabaseAdmin
      .from("emergency_sessions")
      .select("id, patient_id, status, opened_at, assigned_emt_id, assigned_at, started_by_emt_id, triggered_via, gps_lat, gps_lng, scanner_phone, scanner_type")
      .or(`assigned_emt_id.eq.${userId},started_by_emt_id.eq.${userId}`)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(50);

    // Incidents this EMT owns (any status).
    const { data: incidents } = await supabaseAdmin
      .from("incidents")
      .select("id, session_id, patient_id, status, priority, incident_type, submitted_at, hospital_id, hospitals(name, city)")
      .eq("emt_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(50);

    const patientIds = Array.from(new Set([
      ...(sessions ?? []).map((s) => s.patient_id),
      ...(incidents ?? []).map((i) => i.patient_id),
    ]));
    const { data: patients } = patientIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", patientIds)
      : { data: [] as any[] };
    const patientById = Object.fromEntries((patients ?? []).map((p: any) => [p.id, p]));
    const incidentSessionIds = new Set((incidents ?? []).map((i) => i.session_id));

    const assigned_sessions = (sessions ?? [])
      .filter((s) => !incidentSessionIds.has(s.id))
      .map((s) => ({
        ...s,
        patient: patientById[s.patient_id] ?? null,
        is_assigned_by_hospital: s.assigned_emt_id === userId,
      }));

    const my_incidents = (incidents ?? []).map((i) => ({
      ...i, patient: patientById[i.patient_id] ?? null,
    }));

    return { assigned_sessions, my_incidents };
  });

