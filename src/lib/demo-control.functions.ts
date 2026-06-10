/**
 * Demo Control Center — server functions.
 *
 * Every function is hard-gated by DEMO_MODE: when VITE_SAVITRI_DEMO_MODE=false
 * the request throws and the page is unreachable from the UI as well.
 *
 * Purpose: deterministic 1-click reset of demo state before a judge demo.
 */
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEMO_MODE, DEMO_LOCATION } from "@/lib/demo-mode";
import { runDemoSeed } from "@/routes/api/public/seed";

const TENANT = "00000000-0000-0000-0000-000000000001";
const DEMO_EMAILS = [
  "demo.patient@savitri.app",
  "demo.emt@savitri.app",
  "demo.hospital@savitri.app",
];

function assertDemo() {
  if (!DEMO_MODE) throw new Error("Demo mode is disabled. Set VITE_SAVITRI_DEMO_MODE to enable.");
}

async function getDemoUserIds() {
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const users = (list?.users ?? []).filter((u) => DEMO_EMAILS.includes(u.email ?? ""));
  const map: Record<string, string> = {};
  for (const u of users) map[u.email!] = u.id;
  return {
    all: users.map((u) => u.id),
    patient_id: map["demo.patient@savitri.app"] ?? null,
    emt_id: map["demo.emt@savitri.app"] ?? null,
    hospital_user_id: map["demo.hospital@savitri.app"] ?? null,
  };
}

async function wipeEmergencyData(userIds: string[]) {
  if (!userIds.length) return;
  const { data: sessions } = await supabaseAdmin
    .from("emergency_sessions").select("id").in("patient_id", userIds);
  const sessionIds = (sessions ?? []).map((s) => s.id);
  await supabaseAdmin.from("audit_logs").delete().in("actor_user_id", userIds);
  if (sessionIds.length) {
    await supabaseAdmin.from("audit_logs").delete().in("session_id", sessionIds);
    await supabaseAdmin.from("notifications").delete().in("session_id", sessionIds);
    await supabaseAdmin.from("incidents").delete().in("session_id", sessionIds);
    await supabaseAdmin.from("emergency_sessions").delete().in("id", sessionIds);
  }
  await supabaseAdmin.from("notifications").delete().in("recipient_user_id", userIds);
}

/* ----------------------------- state ----------------------------- */
export const getDemoState = createServerFn({ method: "POST" }).handler(async () => {
  assertDemo();
  const ids = await getDemoUserIds();
  const accounts = {
    patient: !!ids.patient_id,
    emt: !!ids.emt_id,
    hospital: !!ids.hospital_user_id,
  };
  const patientId = ids.patient_id;
  const [
    { data: contacts },
    { data: tokens },
    { data: sessions },
    { data: incidents },
  ] = await Promise.all([
    patientId
      ? supabaseAdmin.from("emergency_contacts").select("id, name, phone").eq("patient_id", patientId)
      : Promise.resolve({ data: [] as any[] }),
    patientId
      ? supabaseAdmin.from("emergency_tokens").select("id, token, active").eq("patient_id", patientId)
      : Promise.resolve({ data: [] as any[] }),
    patientId
      ? supabaseAdmin.from("emergency_sessions")
          .select("id, status, opened_at, triggered_via, scanner_type, demo_mode, location_source")
          .eq("patient_id", patientId)
          .order("opened_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as any[] }),
    patientId
      ? supabaseAdmin.from("incidents")
          .select("id, status, priority, incident_type, registration_number, submitted_at")
          .eq("patient_id", patientId)
          .order("submitted_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  return {
    demo_mode: true,
    accounts,
    patient_id: patientId,
    emt_id: ids.emt_id,
    hospital_user_id: ids.hospital_user_id,
    contacts: contacts ?? [],
    tokens: tokens ?? [],
    sessions: sessions ?? [],
    incidents: incidents ?? [],
    active_session_count: (sessions ?? []).filter((s: any) => s.status === "open").length,
    active_incident_count: (incidents ?? []).filter((i: any) => i.status !== "completed" && i.status !== "arrived").length,
  };
});

/* ----------------------------- reset all ----------------------------- */
export const resetAllDemoData = createServerFn({ method: "POST" }).handler(async () => {
  assertDemo();
  const ids = await getDemoUserIds();
  await wipeEmergencyData(ids.all);
  if (ids.patient_id) {
    // NOTE: do NOT delete emergency_tokens — the patient's QR (printed or shown
    // in the preview) must remain valid across demo resets. The seed will skip
    // token creation when an active one already exists.
    await supabaseAdmin.from("emergency_contacts").delete().eq("patient_id", ids.patient_id);
  }
  const out = await runDemoSeed();
  return { ok: true, ...out };
});

/* ----------------------------- re-seed only ----------------------------- */
export const reseedAccounts = createServerFn({ method: "POST" }).handler(async () => {
  assertDemo();
  const out = await runDemoSeed();
  return { ok: true, ...out };
});

/* ----------------------------- clear active ----------------------------- */
export const clearActiveIncidents = createServerFn({ method: "POST" }).handler(async () => {
  assertDemo();
  const ids = await getDemoUserIds();
  await wipeEmergencyData(ids.all);
  return { ok: true, cleared: true };
});

/* ----------------------------- fresh SOS ----------------------------- */
export const createFreshSosIncident = createServerFn({ method: "POST" }).handler(async () => {
  assertDemo();
  const ids = await getDemoUserIds();
  if (!ids.patient_id) throw new Error("Demo patient missing — run Reset first.");

  const { data: session, error } = await supabaseAdmin.from("emergency_sessions").insert({
    patient_id: ids.patient_id, status: "open", tenant_id: TENANT,
    gps_lat: DEMO_LOCATION.lat, gps_lng: DEMO_LOCATION.lng, gps_accuracy: 25,
    triggered_via: "sos", silent: false,
    demo_mode: true, location_source: "demo",
  }).select().single();
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("audit_logs").insert([
    { action: "SOS_TRIGGERED", actor_user_id: ids.patient_id, actor_role: "patient",
      entity_type: "emergency_session", entity_id: session.id, session_id: session.id, tenant_id: TENANT },
    { action: "LOCATION_CAPTURED", actor_user_id: ids.patient_id, actor_role: "patient",
      entity_type: "emergency_session", entity_id: session.id, session_id: session.id, tenant_id: TENANT,
      metadata: { lat: DEMO_LOCATION.lat, lng: DEMO_LOCATION.lng, accuracy: 25, source: "demo" } },
  ]);

  const { data: contacts } = await supabaseAdmin
    .from("emergency_contacts").select("id, notify_token, name").eq("patient_id", ids.patient_id);
  if (contacts?.length) {
    await supabaseAdmin.from("notifications").insert(contacts.map((c) => ({
      tenant_id: TENANT, audience: "emergency_contact" as const, channel: "in_app" as const,
      recipient_contact_id: c.id, session_id: session.id,
      title: "SOS — Asha Demo needs help",
      body: "SOS triggered. Tap to view live status, location, and recording.",
      payload: {
        kind: "sos", patient_name: "Asha Demo", session_id: session.id,
        lat: DEMO_LOCATION.lat, lng: DEMO_LOCATION.lng, accuracy: 25,
        maps_url: `https://www.google.com/maps?q=${DEMO_LOCATION.lat},${DEMO_LOCATION.lng}`,
        notify_url: `/n/${c.notify_token}`, location_source: "demo", demo_mode: true,
      },
    })));
  }
  return { ok: true, session_id: session.id };
});

/* ----------------------------- fresh EMT incident ----------------------------- */
export const createFreshEmergencyIncident = createServerFn({ method: "POST" }).handler(async () => {
  assertDemo();
  const ids = await getDemoUserIds();
  if (!ids.patient_id || !ids.emt_id) throw new Error("Demo accounts missing — run Reset first.");

  const { data: session, error: sErr } = await supabaseAdmin.from("emergency_sessions").insert({
    patient_id: ids.patient_id, started_by_emt_id: ids.emt_id, tenant_id: TENANT,
    status: "open", gps_lat: DEMO_LOCATION.lat, gps_lng: DEMO_LOCATION.lng, gps_accuracy: 25,
    triggered_via: "emt", scanner_type: "emt", scanner_user_id: ids.emt_id,
    scanner_verification_method: "authenticated", demo_mode: true, location_source: "demo",
  }).select().single();
  if (sErr) throw new Error(sErr.message);

  const { data: hospital } = await supabaseAdmin
    .from("hospitals").select("id").ilike("name", "%Savitri General Hospital%").maybeSingle();
  const hospId = hospital?.id ?? (await supabaseAdmin.from("hospitals").select("id").limit(1).single()).data!.id;

  const { data: incident, error: iErr } = await supabaseAdmin.from("incidents").insert({
    session_id: session.id, patient_id: ids.patient_id, emt_id: ids.emt_id,
    hospital_id: hospId, priority: "high", incident_type: "Fall with head injury",
    recommended_department: "Trauma", observations: "GCS 8. Bleeding from scalp.",
    transcript: "Patient unconscious after fall.", status: "pending",
    submitted_at: new Date().toISOString(), tenant_id: TENANT,
  }).select().single();
  if (iErr) throw new Error(iErr.message);

  await supabaseAdmin.from("audit_logs").insert([
    { action: "QR_SCANNED", actor_user_id: ids.emt_id, actor_role: "emt",
      entity_type: "patient", entity_id: ids.patient_id, session_id: session.id, tenant_id: TENANT },
    { action: "EMERGENCY_SESSION_CREATED", actor_user_id: ids.emt_id, actor_role: "emt",
      entity_type: "emergency_session", entity_id: session.id, session_id: session.id, tenant_id: TENANT },
    { action: "REPORT_SUBMITTED", actor_user_id: ids.emt_id, actor_role: "emt",
      entity_type: "incident", entity_id: incident.id, incident_id: incident.id, session_id: session.id, tenant_id: TENANT },
    { action: "HOSPITAL_ALERTED", actor_user_id: ids.emt_id, actor_role: "emt",
      entity_type: "hospital", entity_id: hospId, incident_id: incident.id, session_id: session.id, tenant_id: TENANT },
  ]);

  // Hospital notification
  const { data: staff } = await supabaseAdmin.from("hospital_staff").select("user_id").eq("hospital_id", hospId);
  if (staff?.length) {
    await supabaseAdmin.from("notifications").insert(staff.map((s) => ({
      tenant_id: TENANT, audience: "hospital" as const, channel: "in_app" as const,
      recipient_user_id: s.user_id, incident_id: incident.id, session_id: session.id,
      title: "Incoming HIGH incident", body: "Fall with head injury",
    })));
  }
  return { ok: true, session_id: session.id, incident_id: incident.id };
});

/* ----------------------------- emergency contact demo login ----------------------------- */
/**
 * Returns the notify_token for the demo patient's primary emergency contact.
 * If no incident/session exists, returns the contact's token anyway so the
 * portal can render the "waiting" state. Demo Mode only.
 */
export const getDemoEmergencyContactToken = createServerFn({ method: "POST" }).handler(async () => {
  assertDemo();
  const ids = await getDemoUserIds();
  if (!ids.patient_id) throw new Error("Demo patient missing — run Reset first.");
  const { data: contacts } = await supabaseAdmin
    .from("emergency_contacts")
    .select("id, name, notify_token, created_at")
    .eq("patient_id", ids.patient_id)
    .order("created_at", { ascending: true });
  const contact = contacts?.[0];
  if (!contact) throw new Error("Demo emergency contact missing — run Reset first.");
  return { token: contact.notify_token, contact_name: contact.name };
});

/* ----------------------------- EMT demo rescue ----------------------------- */
/**
 * Demo-only fallback for EMT: returns the latest open session for the demo
 * patient, opening one if none exists. Does NOT write QR_SCANNED — caller
 * may write its own DEMO_RESCUE_LOADED audit entry if desired.
 */
export const loadDemoPatientSessionForEmt = createServerFn({ method: "POST" })
  .handler(async () => {
    assertDemo();
    const ids = await getDemoUserIds();
    if (!ids.patient_id || !ids.emt_id) throw new Error("Demo accounts missing — run Reset first.");

    // Prefer most-recent open session involving the demo patient.
    const { data: open } = await supabaseAdmin
      .from("emergency_sessions")
      .select("id, started_by_emt_id, assigned_emt_id")
      .eq("patient_id", ids.patient_id)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let sessionId = open?.id ?? null;

    // If the open session isn't owned by the demo EMT, attach them so EMT
    // session details RLS / auth gate passes.
    if (open && open.started_by_emt_id !== ids.emt_id && open.assigned_emt_id !== ids.emt_id) {
      await supabaseAdmin.from("emergency_sessions")
        .update({ started_by_emt_id: ids.emt_id })
        .eq("id", open.id);
    }

    if (!sessionId) {
      const { data: session, error } = await supabaseAdmin.from("emergency_sessions").insert({
        patient_id: ids.patient_id, started_by_emt_id: ids.emt_id, tenant_id: TENANT,
        status: "open", gps_lat: DEMO_LOCATION.lat, gps_lng: DEMO_LOCATION.lng, gps_accuracy: 25,
        triggered_via: "emt", scanner_type: "emt", scanner_user_id: ids.emt_id,
        scanner_verification_method: "demo_rescue", demo_mode: true, location_source: "demo",
      }).select().single();
      if (error) throw new Error(error.message);
      sessionId = session.id;
    }

    return { session_id: sessionId };
  });
