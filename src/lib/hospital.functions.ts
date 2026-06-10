import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEMO_MODE } from "@/lib/demo-mode";
import { createVoiceNoteSignedUrl, getLatestEmtVoiceNotePath, resolveSosVoiceNotePath } from "@/lib/voice-notes.server";
import { z } from "zod";

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";

export const getHospitalDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: staff } = await supabaseAdmin.from("hospital_staff")
      .select("hospital_id, hospitals(*)").eq("user_id", userId).maybeSingle();
    if (!staff) throw new Error("Not assigned to a hospital");
    const { data: incidentsRaw } = await supabaseAdmin.from("incidents")
      .select("*")
      .eq("hospital_id", staff.hospital_id)
      .order("submitted_at", { ascending: false }).limit(50);

    const incidentPatientIds = Array.from(new Set((incidentsRaw ?? []).map((i: any) => i.patient_id)));
    const incidentEmtIds = Array.from(new Set((incidentsRaw ?? []).map((i: any) => i.emt_id).filter(Boolean)));
    const incidentSessionIds = Array.from(new Set((incidentsRaw ?? []).map((i: any) => i.session_id).filter(Boolean)));

    const [patientProfilesRes, emtProfilesRes, sessionsRes, sosRowsRes] = await Promise.all([
      incidentPatientIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", incidentPatientIds)
        : Promise.resolve({ data: [] as any[] }),
      incidentEmtIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name").in("id", incidentEmtIds)
        : Promise.resolve({ data: [] as any[] }),
      incidentSessionIds.length
        ? supabaseAdmin.from("emergency_sessions").select("id, voice_note_path").in("id", incidentSessionIds)
        : Promise.resolve({ data: [] as any[] }),
      incidentPatientIds.length
        ? supabaseAdmin.from("emergency_sessions")
            .select("patient_id, opened_at, voice_note_path")
            .in("patient_id", incidentPatientIds)
            .in("triggered_via", ["sos", "sos_silent"])
            .not("voice_note_path", "is", null)
            .order("opened_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const emtNameById: Record<string, string | null> = Object.fromEntries(
      (emtProfilesRes.data ?? []).map((p: any) => [p.id, p.full_name]),
    );
    const patientById: Record<string, any> = Object.fromEntries(
      (patientProfilesRes.data ?? []).map((p: any) => [p.id, p]),
    );
    const sessionVoiceById: Record<string, string | null> = Object.fromEntries(
      (sessionsRes.data ?? []).map((s: any) => [s.id, s.voice_note_path]),
    );
    const sosByPatient: Record<string, string | null> = {};
    for (const r of sosRowsRes.data ?? []) {
      if (!(r.patient_id in sosByPatient)) sosByPatient[r.patient_id] = r.voice_note_path;
    }

    const incidents = await Promise.all((incidentsRaw ?? []).map(async (i: any) => {
      const emtPath = await getLatestEmtVoiceNotePath(i.session_id, i.voice_note_url ?? sessionVoiceById[i.session_id] ?? null);
      const sosPath = await resolveSosVoiceNotePath({ patientId: i.patient_id, sessionId: i.session_id, fallbackPath: sosByPatient[i.patient_id] ?? sessionVoiceById[i.session_id] ?? null });
      const [emt_audio_url, sos_audio_url] = await Promise.all([createVoiceNoteSignedUrl(emtPath), createVoiceNoteSignedUrl(sosPath)]);
      const summaryText = typeof i.ai_summary === "string"
        ? i.ai_summary
        : i.ai_summary?.observations ?? i.observations ?? null;
      return {
        ...i,
        patient: patientById[i.patient_id] ?? null,
        emt: { full_name: emtNameById[i.emt_id] ?? null },
        emt_audio_url,
        sos_audio_url,
        ai_summary_text: summaryText,
        hospital_name: (staff.hospitals as any)?.name ?? null,
      };
    }));

    // Possible emergencies: open sessions in tenant that have NO incident yet.
    const { data: openSessions } = await supabaseAdmin
      .from("emergency_sessions")
      .select("id, patient_id, triggered_via, status, opened_at, gps_lat, gps_lng, location_source, silent, scanner_phone, scanner_user_id, scanner_type, assigned_emt_id, assigned_at")
      .eq("tenant_id", DEFAULT_TENANT)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(50);

    const sessionIds = (openSessions ?? []).map((s) => s.id);
    let claimedIds = new Set<string>();
    if (sessionIds.length) {
      const { data: existing } = await supabaseAdmin
        .from("incidents").select("session_id").in("session_id", sessionIds);
      claimedIds = new Set((existing ?? []).map((i: any) => i.session_id));
    }
    const possible = (openSessions ?? []).filter((s) => !claimedIds.has(s.id));
    const patientIds = Array.from(new Set(possible.map((s) => s.patient_id)));
    const assignedEmtIds = Array.from(
      new Set(possible.map((s) => s.assigned_emt_id).filter((x): x is string => !!x)),
    );

    const [profsRes, contactsRes, emtProfRes] = await Promise.all([
      patientIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", patientIds)
        : Promise.resolve({ data: [] as any[] }),
      patientIds.length
        ? supabaseAdmin.from("emergency_contacts")
            .select("id, patient_id, name, phone, relation").in("patient_id", patientIds)
        : Promise.resolve({ data: [] as any[] }),
      assignedEmtIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name").in("id", assignedEmtIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const patientsById: Record<string, { full_name: string | null; phone: string | null }> =
      Object.fromEntries((profsRes.data ?? []).map((p: any) => [p.id, p]));
    const contactsByPatient: Record<string, any[]> = {};
    for (const c of contactsRes.data ?? []) {
      (contactsByPatient[c.patient_id] ??= []).push(c);
    }
    const emtsById: Record<string, { full_name: string | null }> =
      Object.fromEntries((emtProfRes.data ?? []).map((p: any) => [p.id, p]));

    const possible_emergencies = possible.map((s) => ({
      ...s,
      patient: patientsById[s.patient_id] ?? null,
      patient_phone: patientsById[s.patient_id]?.phone ?? null,
      emergency_contacts: contactsByPatient[s.patient_id] ?? [],
      assigned_emt: s.assigned_emt_id ? emtsById[s.assigned_emt_id] ?? null : null,
    }));

    // Available EMTs for assignment dropdown.
    const { data: emtRows } = await supabaseAdmin
      .from("emts").select("user_id, badge_no, agency").eq("tenant_id", DEFAULT_TENANT);
    const emtUserIds = (emtRows ?? []).map((e) => e.user_id);
    const { data: emtProfiles } = emtUserIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", emtUserIds)
      : { data: [] as any[] };
    const emtProfById: Record<string, any> = Object.fromEntries((emtProfiles ?? []).map((p: any) => [p.id, p]));
    const available_emts = (emtRows ?? []).map((e) => ({
      user_id: e.user_id,
      badge_no: e.badge_no,
      agency: e.agency,
      full_name: emtProfById[e.user_id]?.full_name ?? null,
    }));

    return {
      hospital: staff.hospitals,
      incidents: incidents ?? [],
      possible_emergencies,
      available_emts,
      demo_mode: DEMO_MODE,
    };
  });

export const getHospitalIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ incident_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: staff } = await supabaseAdmin.from("hospital_staff").select("hospital_id").eq("user_id", userId).maybeSingle();
    if (!staff) throw new Error("Not authorized");
    const { data: incident } = await supabaseAdmin.from("incidents").select("*").eq("id", data.incident_id).maybeSingle();
    if (!incident || incident.hospital_id !== staff.hospital_id) throw new Error("Not found");
    const [patient, medical, emtSession, sosSessions] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", incident.patient_id).maybeSingle(),
      supabaseAdmin.from("patient_profiles").select("*").eq("user_id", incident.patient_id).maybeSingle(),
      supabaseAdmin.from("emergency_sessions")
        .select("id, opened_at, voice_note_path, ai_summary, recording_status, triggered_via")
        .eq("id", incident.session_id).maybeSingle(),
      supabaseAdmin.from("emergency_sessions")
        .select("id, opened_at, voice_note_path, ai_summary, recording_status, triggered_via, silent")
        .eq("patient_id", incident.patient_id)
        .in("triggered_via", ["sos", "sos_silent"])
        .not("voice_note_path", "is", null)
        .order("opened_at", { ascending: false })
        .limit(5),
    ]);

    // EMT recording: prefer incident.voice_note_url, fallback to session.voice_note_path
    const emtPath = await getLatestEmtVoiceNotePath(incident.session_id, (incident as any).voice_note_url ?? emtSession.data?.voice_note_path ?? null);
    const emt_recording = emtPath ? {
      voice_note_path: emtPath,
      voice_note_url: await createVoiceNoteSignedUrl(emtPath),
      transcript: (incident as any).transcript ?? null,
      ai_summary: (incident as any).ai_summary ?? null,
      submitted_at: (incident as any).submitted_at ?? null,
      session_id: incident.session_id,
    } : null;

    const sos_recordings = await Promise.all(((sosSessions.data ?? []) as any[]).map(async (s) => {
      const sosPath = await resolveSosVoiceNotePath({ patientId: incident.patient_id, sessionId: s.id, fallbackPath: s.voice_note_path });
      return { ...s, voice_note_path: sosPath, voice_note_url: await createVoiceNoteSignedUrl(sosPath) };
    }));

    return { incident, patient: patient.data, medical: medical.data, emt_recording, sos_recordings };
  });

export const acceptIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ incident_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: staff } = await supabaseAdmin.from("hospital_staff").select("hospital_id").eq("user_id", userId).maybeSingle();
    if (!staff) throw new Error("Not authorized");

    const regNum = "SVT-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 5).toUpperCase();
    const { data: incident, error } = await supabaseAdmin.from("incidents")
      .update({ status: "accepted", accepted_at: new Date().toISOString(), registration_number: regNum })
      .eq("id", data.incident_id).eq("hospital_id", staff.hospital_id).select().single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      action: "HOSPITAL_ACCEPTED", actor_user_id: userId, actor_role: "hospital",
      entity_type: "incident", entity_id: incident.id, incident_id: incident.id, session_id: incident.session_id,
      tenant_id: DEFAULT_TENANT, metadata: { registration_number: regNum },
    });

    const { data: contacts } = await supabaseAdmin.from("emergency_contacts").select("id, notify_token").eq("patient_id", incident.patient_id);
    await supabaseAdmin.from("notifications").insert([
      { tenant_id: DEFAULT_TENANT, audience: "patient", channel: "in_app",
        recipient_user_id: incident.patient_id, title: "Hospital accepted",
        body: `Registration ${regNum}. The hospital is preparing for your arrival.`,
        incident_id: incident.id, session_id: incident.session_id },
      { tenant_id: DEFAULT_TENANT, audience: "emt", channel: "in_app",
        recipient_user_id: incident.emt_id, title: "Hospital accepted",
        body: `Registration ${regNum}.`, incident_id: incident.id, session_id: incident.session_id },
      ...(contacts ?? []).map((c) => ({ tenant_id: DEFAULT_TENANT, audience: "emergency_contact" as const, channel: "in_app" as const,
        recipient_contact_id: c.id, title: "Hospital accepted",
        body: `Registration ${regNum}. The hospital is preparing for arrival.`, incident_id: incident.id, session_id: incident.session_id,
        payload: { notify_token: c.notify_token, registration_number: regNum, status: "accepted" } })),
    ]);
    return incident;
  });

export const markPatientArrived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ incident_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: staff } = await supabaseAdmin.from("hospital_staff").select("hospital_id").eq("user_id", userId).maybeSingle();
    if (!staff) throw new Error("Not authorized");

    const now = new Date().toISOString();
    const { data: incident, error } = await supabaseAdmin.from("incidents")
      .update({ status: "arrived", arrived_at: now })
      .eq("id", data.incident_id).eq("hospital_id", staff.hospital_id).select().single();
    if (error) throw new Error(error.message);

    // close session
    await supabaseAdmin.from("emergency_sessions").update({ status: "closed", closed_at: now }).eq("id", incident.session_id);

    await supabaseAdmin.from("audit_logs").insert({
      action: "PATIENT_ARRIVED", actor_user_id: userId, actor_role: "hospital",
      entity_type: "incident", entity_id: incident.id, incident_id: incident.id, session_id: incident.session_id,
      tenant_id: DEFAULT_TENANT,
    });
    const { data: contacts } = await supabaseAdmin.from("emergency_contacts").select("id, notify_token").eq("patient_id", incident.patient_id);
    await supabaseAdmin.from("notifications").insert([
      { tenant_id: DEFAULT_TENANT, audience: "patient" as const, channel: "in_app" as const,
        recipient_user_id: incident.patient_id, title: "You've arrived",
        body: "The hospital has confirmed your arrival.", incident_id: incident.id, session_id: incident.session_id },
      ...(contacts ?? []).map((c) => ({ tenant_id: DEFAULT_TENANT, audience: "emergency_contact" as const, channel: "in_app" as const,
        recipient_contact_id: c.id, title: "Patient arrived",
        body: "The hospital has confirmed arrival.", incident_id: incident.id, session_id: incident.session_id,
        payload: { notify_token: c.notify_token, status: "arrived" } })),
    ]);
    return incident;
  });

/**
 * Hospital-initiated: convert a "possible emergency" (open session with no
 * incident) into a confirmed incident assigned to this hospital. This unblocks
 * the hospital queue when no EMT has triaged yet.
 */
export const convertSessionToIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: staff } = await supabaseAdmin.from("hospital_staff")
      .select("hospital_id").eq("user_id", userId).maybeSingle();
    if (!staff) throw new Error("Not authorized");

    const { data: session } = await supabaseAdmin.from("emergency_sessions")
      .select("*").eq("id", data.session_id).maybeSingle();
    if (!session) throw new Error("Session not found");

    const { data: existing } = await supabaseAdmin.from("incidents")
      .select("id").eq("session_id", session.id).maybeSingle();
    if (existing) return { id: existing.id, already: true as const };

    // emt_id is NOT NULL. Prefer the EMT the hospital explicitly assigned
    // (Assign EMT). Fall back to any EMT in the directory; finally the
    // converting hospital user so we never block on FK constraints.
    let emtId: string | null = (session as any).assigned_emt_id ?? null;
    if (!emtId) {
      const { data: anyEmt } = await supabaseAdmin.from("emts")
        .select("user_id").limit(1).maybeSingle();
      emtId = anyEmt?.user_id ?? userId;
    }

    const { data: incident, error } = await supabaseAdmin.from("incidents")
      .insert({
        session_id: session.id,
        patient_id: session.patient_id,
        emt_id: emtId,
        hospital_id: staff.hospital_id,
        status: "pending",
        priority: "medium",
        incident_type: "Hospital-initiated (awaiting triage)",
        observations: `Converted from possible emergency by hospital. Source: ${session.triggered_via}.`,
        submitted_at: new Date().toISOString(),
        tenant_id: DEFAULT_TENANT,
        ai_summary: { source: "hospital_conversion", triggered_via: session.triggered_via },
      })
      .select().single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert([
      { action: "HOSPITAL_CONVERTED_TO_INCIDENT", actor_user_id: userId, actor_role: "hospital",
        entity_type: "incident", entity_id: incident.id, incident_id: incident.id,
        session_id: session.id, tenant_id: DEFAULT_TENANT,
        metadata: { hospital_id: staff.hospital_id, source: "hospital_conversion" } },
      { action: "HOSPITAL_ALERTED", actor_user_id: userId, actor_role: "hospital",
        entity_type: "hospital", entity_id: staff.hospital_id, incident_id: incident.id,
        session_id: session.id, tenant_id: DEFAULT_TENANT },
    ]);

    await supabaseAdmin.from("notifications").insert({
      tenant_id: DEFAULT_TENANT, audience: "patient", channel: "in_app",
      recipient_user_id: session.patient_id,
      title: "Hospital received your alert",
      body: "A hospital has picked up your emergency report.",
      incident_id: incident.id, session_id: session.id,
    });

    return { id: incident.id, already: false as const };
  });

/**
 * Hospital-initiated: dismiss a possible emergency (false alarm, duplicate,
 * etc.) by closing the session with an audit record. Does NOT create an incident.
 */
export const dismissPossibleEmergency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    session_id: z.string().uuid(),
    reason: z.string().max(200).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: staff } = await supabaseAdmin.from("hospital_staff")
      .select("hospital_id").eq("user_id", userId).maybeSingle();
    if (!staff) throw new Error("Not authorized");

    const { data: existing } = await supabaseAdmin.from("incidents")
      .select("id").eq("session_id", data.session_id).maybeSingle();
    if (existing) throw new Error("Session already has an incident — cannot dismiss.");

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("emergency_sessions")
      .update({ status: "closed", closed_at: now })
      .eq("id", data.session_id).eq("status", "open");
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      action: "HOSPITAL_DISMISSED_REPORT", actor_user_id: userId, actor_role: "hospital",
      entity_type: "emergency_session", entity_id: data.session_id,
      session_id: data.session_id, tenant_id: DEFAULT_TENANT,
      metadata: { hospital_id: staff.hospital_id, reason: data.reason ?? null },
    });

    return { ok: true as const };
  });


/* ------------------------------------------------------------------ */
/* Hospital → Assign EMT to a possible emergency                      */
/* ------------------------------------------------------------------ */
export const assignEmtToSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    session_id: z.string().uuid(),
    emt_user_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: staff } = await supabaseAdmin.from("hospital_staff")
      .select("hospital_id").eq("user_id", userId).maybeSingle();
    if (!staff) throw new Error("Not authorized");

    // Validate EMT exists in directory
    const { data: emt } = await supabaseAdmin.from("emts")
      .select("user_id").eq("user_id", data.emt_user_id).maybeSingle();
    if (!emt) throw new Error("Selected EMT not found");

    const now = new Date().toISOString();
    const { data: session, error } = await supabaseAdmin.from("emergency_sessions")
      .update({ assigned_emt_id: data.emt_user_id, assigned_at: now, assigned_by: userId })
      .eq("id", data.session_id).eq("status", "open").select().single();
    if (error) throw new Error(error.message);

    // If an incident already exists for this session, also reflect on it.
    const { data: existingIncident } = await supabaseAdmin.from("incidents")
      .select("id").eq("session_id", data.session_id).maybeSingle();
    if (existingIncident) {
      await supabaseAdmin.from("incidents")
        .update({ emt_id: data.emt_user_id }).eq("id", existingIncident.id);
    }

    await supabaseAdmin.from("audit_logs").insert({
      action: "EMT_ASSIGNED", actor_user_id: userId, actor_role: "hospital",
      entity_type: "emergency_session", entity_id: data.session_id,
      session_id: data.session_id, incident_id: existingIncident?.id ?? null,
      tenant_id: DEFAULT_TENANT,
      metadata: {
        hospital_id: staff.hospital_id, emt_id: data.emt_user_id,
        assigned_by: userId, timestamp: now,
      },
    });

    // Notify the assigned EMT
    await supabaseAdmin.from("notifications").insert({
      tenant_id: DEFAULT_TENANT, audience: "emt", channel: "in_app",
      recipient_user_id: data.emt_user_id,
      title: "You've been assigned to an emergency",
      body: "A hospital dispatcher has assigned you to a possible emergency.",
      session_id: data.session_id,
    });

    return { ok: true as const, session };
  });

/* ------------------------------------------------------------------ */
/* Hospital → place / simulate calls (scanner, patient, contact)      */
/* ------------------------------------------------------------------ */
const CallInput = z.object({
  session_id: z.string().uuid(),
  target: z.enum(["scanner", "patient", "emergency_contact"]),
  emergency_contact_id: z.string().uuid().optional().nullable(),
});

export const logHospitalCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CallInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: staff } = await supabaseAdmin.from("hospital_staff")
      .select("hospital_id").eq("user_id", userId).maybeSingle();
    if (!staff) throw new Error("Not authorized");

    const { data: session } = await supabaseAdmin.from("emergency_sessions")
      .select("id, patient_id, scanner_phone").eq("id", data.session_id).maybeSingle();
    if (!session) throw new Error("Session not found");

    let phone: string | null = null;
    let recipientName: string | null = null;
    let relationship: string | null = null;
    let emergencyContactId: string | null = null;

    if (data.target === "scanner") {
      phone = session.scanner_phone ?? null;
      recipientName = "Scanner";
    } else if (data.target === "patient") {
      const { data: p } = await supabaseAdmin.from("profiles")
        .select("full_name, phone").eq("id", session.patient_id).maybeSingle();
      phone = p?.phone ?? null;
      recipientName = p?.full_name ?? "Patient";
    } else {
      if (!data.emergency_contact_id) throw new Error("emergency_contact_id required");
      const { data: c } = await supabaseAdmin.from("emergency_contacts")
        .select("id, name, phone, relation, patient_id")
        .eq("id", data.emergency_contact_id).maybeSingle();
      if (!c || c.patient_id !== session.patient_id) throw new Error("Contact not found");
      phone = c.phone ?? null;
      recipientName = c.name ?? null;
      relationship = c.relation ?? null;
      emergencyContactId = c.id;
    }

    if (!phone) {
      throw new Error(
        data.target === "scanner" ? "No Scanner Phone Available" :
        data.target === "patient" ? "No Patient Phone Available" :
        "No Emergency Contact Available",
      );
    }

    const { data: incidentRow } = await supabaseAdmin.from("incidents")
      .select("id").eq("session_id", data.session_id).maybeSingle();

    const simulated = DEMO_MODE;
    const action =
      data.target === "scanner"
        ? (simulated ? "SCANNER_CALL_SIMULATED" : "SCANNER_CALL_INITIATED")
        : data.target === "patient"
          ? (simulated ? "PATIENT_CALL_SIMULATED" : "PATIENT_CALL_INITIATED")
          : (simulated ? "EMERGENCY_CONTACT_CALL_SIMULATED" : "EMERGENCY_CONTACT_CALL_INITIATED");

    await supabaseAdmin.from("audit_logs").insert({
      action: action as any,
      actor_user_id: userId, actor_role: "hospital",
      entity_type: "emergency_session", entity_id: data.session_id,
      session_id: data.session_id, incident_id: incidentRow?.id ?? null,
      tenant_id: DEFAULT_TENANT,
      metadata: {
        hospital_id: staff.hospital_id, hospital_user: userId,
        phone, recipient_name: recipientName, relationship,
        emergency_contact_id: emergencyContactId,
        target: data.target, simulated, timestamp: new Date().toISOString(),
      },
    });

    return {
      ok: true as const,
      simulated,
      phone,
      tel_url: simulated ? null : `tel:${phone.replace(/\s+/g, "")}`,
      recipient_name: recipientName,
    };
  });
