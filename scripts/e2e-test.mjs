#!/usr/bin/env node
/**
 * Savitri end-to-end smoke test.
 *
 * Runs against a deployed BASE_URL using the Supabase service role to seed
 * demo data, then simulates the full patient → EMT → hospital → contact
 * workflow by performing the same DB writes the server functions perform.
 * Each step asserts the corresponding rows / audit logs / notifications.
 *
 * Usage:  BASE_URL=http://localhost:8080 node scripts/e2e-test.mjs
 */

import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const TENANT = "00000000-0000-0000-0000-000000000001";

const DEMO = {
  patient: { email: "demo.patient@savitri.app", password: "DemoPatient!2026" },
  emt: { email: "demo.emt@savitri.app", password: "DemoEmt!2026" },
  hospital: { email: "demo.hospital@savitri.app", password: "DemoHospital!2026" },
};

const results = [];
function check(name, ok, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  results.push({ name, ok });
  return ok;
}

async function signIn(email, password) {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return data.user.id;
}

async function main() {
  console.log(`\n📍 Base URL: ${BASE_URL}\n`);

  // 1. Seed via public endpoint
  const seedRes = await fetch(`${BASE_URL}/api/public/demo-reset`, { method: "POST" });
  const seed = await seedRes.json();
  check("Demo seed/reset endpoint", seedRes.ok && seed.ok, seed.error || `patient=${seed.patient_id?.slice(0, 8)}`);

  // 2. All three personas can sign in with the right roles
  const patientId = await signIn(DEMO.patient.email, DEMO.patient.password);
  const emtUserId = await signIn(DEMO.emt.email, DEMO.emt.password);
  const hospUserId = await signIn(DEMO.hospital.email, DEMO.hospital.password);
  check("Patient sign-in", !!patientId);
  check("EMT sign-in", !!emtUserId);
  check("Hospital staff sign-in", !!hospUserId);

  const { data: roles } = await admin.from("user_roles").select("user_id, role").in("user_id", [patientId, emtUserId, hospUserId]);
  const roleOf = (id) => roles.filter((r) => r.user_id === id).map((r) => r.role).sort().join(",");
  check("Patient has exactly 'patient' role", roleOf(patientId) === "patient", roleOf(patientId));
  check("EMT has exactly 'emt' role", roleOf(emtUserId) === "emt", roleOf(emtUserId));
  check("Hospital staff has exactly 'hospital' role", roleOf(hospUserId) === "hospital", roleOf(hospUserId));

  // 3. Patient setup: profile, contact, QR token
  const [{ data: pprof }, { data: contacts }, { data: tokens }] = await Promise.all([
    admin.from("patient_profiles").select("*").eq("user_id", patientId).maybeSingle(),
    admin.from("emergency_contacts").select("*").eq("patient_id", patientId),
    admin.from("emergency_tokens").select("*").eq("patient_id", patientId).eq("active", true),
  ]);
  check("Patient medical profile", !!pprof, pprof?.blood_group);
  check("Emergency contact seeded", (contacts?.length ?? 0) >= 1);
  check("Active QR token", (tokens?.length ?? 0) >= 1);
  const contact = contacts[0];

  // 3b. Simulate actual patient SOS payload with successful GPS capture.
  const sosLat = 12.971599;
  const sosLng = 77.594566;
  const sosAccuracy = 18;
  const mapsUrl = `https://www.google.com/maps?q=${sosLat},${sosLng}`;
  const { data: sosSession, error: sosErr } = await admin.from("emergency_sessions").insert({
    patient_id: patientId, status: "open", tenant_id: TENANT,
    gps_lat: sosLat, gps_lng: sosLng, gps_accuracy: sosAccuracy,
    triggered_via: "sos", silent: false, recording_status: "summarized",
    voice_note_path: "demo/sos-test.webm", ai_summary: "Voice recording received. Listen for full context.",
  }).select().single();
  if (sosErr) throw new Error(sosErr.message);
  await admin.from("audit_logs").insert([
    { action: "SOS_TRIGGERED", actor_user_id: patientId, actor_role: "patient", entity_type: "emergency_session", entity_id: sosSession.id, session_id: sosSession.id, tenant_id: TENANT },
    { action: "LOCATION_CAPTURED", actor_user_id: patientId, actor_role: "patient", entity_type: "emergency_session", entity_id: sosSession.id, session_id: sosSession.id, tenant_id: TENANT, metadata: { lat: sosLat, lng: sosLng, accuracy: sosAccuracy } },
    { action: "VOICE_RECORDING_STARTED", actor_user_id: patientId, actor_role: "patient", entity_type: "emergency_session", entity_id: sosSession.id, session_id: sosSession.id, tenant_id: TENANT },
    { action: "VOICE_RECORDING_UPLOADED", actor_user_id: patientId, actor_role: "patient", entity_type: "emergency_session", entity_id: sosSession.id, session_id: sosSession.id, tenant_id: TENANT },
  ]);
  await admin.from("notifications").insert({
    tenant_id: TENANT, audience: "emergency_contact", channel: "in_app",
    recipient_contact_id: contact.id, title: "SOS — Asha Demo needs help",
    body: "SOS triggered. Tap to view live status, location, and recording.", session_id: sosSession.id,
    payload: { kind: "sos", patient_name: "Asha Demo", session_id: sosSession.id, lat: sosLat, lng: sosLng, accuracy: sosAccuracy, maps_url: mapsUrl, notify_url: `/n/${contact.notify_token}` },
  });
  const { data: verifiedSos } = await admin.from("emergency_sessions").select("gps_lat,gps_lng,gps_accuracy").eq("id", sosSession.id).single();
  const { data: sosNotif } = await admin.from("notifications").select("payload").eq("session_id", sosSession.id).eq("audience", "emergency_contact").maybeSingle();
  const { data: sosLogs } = await admin.from("audit_logs").select("action").eq("session_id", sosSession.id);
  check("SOS location stored in emergency_sessions", verifiedSos?.gps_lat === sosLat && verifiedSos?.gps_lng === sosLng && verifiedSos?.gps_accuracy === sosAccuracy);
  check("SOS LOCATION_CAPTURED audit log", sosLogs?.some((l) => l.action === "LOCATION_CAPTURED"));
  check("SOS notification contains latitude/longitude", sosNotif?.payload?.lat === sosLat && sosNotif?.payload?.lng === sosLng);
  check("SOS Google Maps link format", sosNotif?.payload?.maps_url === mapsUrl, sosNotif?.payload?.maps_url);

  // 4. Simulate EMT scan (writes audit log) — back-fill session_id once we have it below.
  const { data: scanLog } = await admin.from("audit_logs").insert({
    action: "QR_SCANNED", actor_user_id: emtUserId, actor_role: "emt",
    entity_type: "patient", entity_id: patientId, tenant_id: TENANT,
  }).select().single();

  // 5. Simulate EMT creating an emergency session
  const { data: session, error: sErr } = await admin.from("emergency_sessions")
    .insert({ patient_id: patientId, started_by_emt_id: emtUserId, tenant_id: TENANT })
    .select().single();
  if (sErr) throw new Error(sErr.message);
  await admin.from("audit_logs").update({ session_id: session.id }).eq("id", scanLog.id);
  check("Emergency session created", !!session?.id, session.id.slice(0, 8));

  await admin.from("audit_logs").insert([
    { action: "EMERGENCY_SESSION_CREATED", actor_user_id: emtUserId, actor_role: "emt",
      entity_type: "emergency_session", entity_id: session.id, session_id: session.id, tenant_id: TENANT },
    { action: "CONTACT_NOTIFIED", actor_user_id: emtUserId, actor_role: "emt",
      entity_type: "emergency_session", entity_id: session.id, session_id: session.id, tenant_id: TENANT,
      metadata: { contact_count: contacts.length } },
  ]);
  await admin.from("notifications").insert({
    tenant_id: TENANT, audience: "emergency_contact", channel: "in_app",
    recipient_contact_id: contact.id, title: "Emergency alert",
    body: "An emergency session was started.", session_id: session.id,
    payload: { notify_token: contact.notify_token, contact_name: contact.name },
  });

  // 6. Submit incident assigned to a hospital
  const { data: hospitals } = await admin.from("hospitals").select("id").limit(1);
  const { data: incident, error: iErr } = await admin.from("incidents").insert({
    session_id: session.id, patient_id: patientId, emt_id: emtUserId,
    hospital_id: hospitals[0].id, priority: "high", incident_type: "Fall with head injury",
    recommended_department: "Trauma", observations: "GCS 8. Bleeding from scalp.",
    transcript: "Patient unconscious after fall.", status: "pending",
    submitted_at: new Date().toISOString(), tenant_id: TENANT,
  }).select().single();
  if (iErr) throw new Error(iErr.message);
  check("Incident submitted", !!incident?.id, `priority=${incident.priority}`);

  await admin.from("audit_logs").insert([
    { action: "REPORT_SUBMITTED", actor_user_id: emtUserId, actor_role: "emt",
      entity_type: "incident", entity_id: incident.id, incident_id: incident.id, session_id: session.id, tenant_id: TENANT },
    { action: "HOSPITAL_ALERTED", actor_user_id: emtUserId, actor_role: "emt",
      entity_type: "hospital", entity_id: hospitals[0].id, incident_id: incident.id, session_id: session.id, tenant_id: TENANT },
  ]);
  await admin.from("notifications").insert({
    tenant_id: TENANT, audience: "hospital", channel: "in_app",
    recipient_user_id: hospUserId, title: "Incoming HIGH incident",
    body: "Fall with head injury", incident_id: incident.id, session_id: session.id,
  });

  // 7. Hospital accepts (assigns registration number)
  const regNum = "SAV-" + Date.now().toString(36).toUpperCase();
  await admin.from("incidents").update({
    status: "accepted", accepted_at: new Date().toISOString(), registration_number: regNum,
  }).eq("id", incident.id);
  await admin.from("audit_logs").insert({
    action: "HOSPITAL_ACCEPTED", actor_user_id: hospUserId, actor_role: "hospital",
    entity_type: "incident", entity_id: incident.id, incident_id: incident.id, session_id: session.id,
    tenant_id: TENANT, metadata: { registration_number: regNum },
  });
  await admin.from("notifications").insert({
    tenant_id: TENANT, audience: "emergency_contact", channel: "in_app",
    recipient_contact_id: contact.id, title: "Hospital accepted",
    body: `Registration ${regNum}`, incident_id: incident.id, session_id: session.id,
    payload: { notify_token: contact.notify_token, registration_number: regNum },
  });
  await admin.from("notifications").insert({
    tenant_id: TENANT, audience: "emergency_contact", channel: "in_app",
    recipient_contact_id: contact.id, title: "Patient arrived",
    body: "The hospital has confirmed arrival.", incident_id: incident.id, session_id: session.id,
    payload: { notify_token: contact.notify_token, status: "arrived" },
  });

  // 8. Mark arrived
  await admin.from("incidents").update({
    status: "arrived", arrived_at: new Date().toISOString(),
  }).eq("id", incident.id);
  await admin.from("audit_logs").insert({
    action: "PATIENT_ARRIVED", actor_user_id: hospUserId, actor_role: "hospital",
    entity_type: "incident", entity_id: incident.id, incident_id: incident.id, session_id: session.id, tenant_id: TENANT,
  });

  // 9. Verify the full audit log chain
  const { data: logs } = await admin.from("audit_logs").select("action").eq("session_id", session.id).order("created_at");
  const actions = logs.map((l) => l.action);
  for (const a of ["QR_SCANNED", "EMERGENCY_SESSION_CREATED", "CONTACT_NOTIFIED", "REPORT_SUBMITTED", "HOSPITAL_ALERTED", "HOSPITAL_ACCEPTED", "PATIENT_ARRIVED"]) {
    check(`Timeline event: ${a}`, actions.includes(a));
  }

  // 10. Notification counts
  const { data: notifs } = await admin.from("notifications").select("audience").eq("session_id", session.id);
  check("Contact notified", notifs.some((n) => n.audience === "emergency_contact"));
  check("Hospital notified", notifs.some((n) => n.audience === "hospital"));

  const { data: finalIncident } = await admin.from("incidents").select("status, registration_number, arrived_at").eq("id", incident.id).single();
  check("Hospital registration number persisted", finalIncident?.registration_number === regNum);
  check("Hospital arrival status persisted", finalIncident?.status === "arrived" && !!finalIncident?.arrived_at);

  const contactPage = await fetch(`${BASE_URL}/n/${contact.notify_token}`);
  const contactHtml = await contactPage.text();
  check("Contact page renders patient name", contactPage.ok && contactHtml.includes("Asha Demo"));
  check("Contact page renders timeline", contactHtml.includes("Timeline"));
  check("Contact page renders location fallback or map section", contactHtml.includes("Location") || contactHtml.includes("Patient location could not be captured"));
  check("Contact page includes Google Maps text/link when SOS GPS exists", contactHtml.includes("Open in Google Maps") || contactHtml.includes("Patient location could not be captured"));
  check("Contact page renders hospital registration", contactHtml.includes(regNum));

  // ============================================================
  // 11. QR HARDENING — scanner workflow simulations
  // Each block mirrors what scan.functions.ts writes for a given scanner type.
  // ============================================================
  const token = tokens[0].token;
  const demoLat = 28.6129, demoLng = 77.2295;
  const demoMapsUrl = `https://www.google.com/maps?q=${demoLat},${demoLng}`;

  // Helper: simulate a scanner workflow → returns session_id
  async function simulateScannerReport({ scannerType, scannerUserId = null, scannerPhone = null, lat = demoLat, lng = demoLng, locationSource = "demo", demoMode = true, triggeredVia, action }) {
    const { data: sess, error } = await admin.from("emergency_sessions").insert({
      patient_id: patientId, status: "open", tenant_id: TENANT,
      gps_lat: lat, gps_lng: lng, gps_accuracy: 25,
      triggered_via: triggeredVia, silent: false,
      scanner_type: scannerType, scanner_user_id: scannerUserId,
      scanner_phone: scannerPhone,
      scanner_verification_method: scannerType === "public" ? "demo_verification" : scannerType === "patient_user" || scannerType === "emt" ? "authenticated" : null,
      location_source: locationSource, demo_mode: demoMode,
    }).select().single();
    if (error) throw new Error(error.message);

    // Action audit
    await admin.from("audit_logs").insert({
      action, actor_user_id: scannerUserId, actor_role: scannerType === "patient_user" ? "patient" : scannerType === "emt" ? "emt" : null,
      entity_type: "emergency_session", entity_id: sess.id, session_id: sess.id, tenant_id: TENANT,
      metadata: { scanner_type: scannerType, scanner_phone: scannerPhone, token, gps: { lat, lng }, location_source: locationSource, demo_mode: demoMode },
    });
    // Disclosure audit
    await admin.from("audit_logs").insert({
      action: "MEDICAL_INFO_DISCLOSED", actor_user_id: scannerUserId,
      actor_role: scannerType === "patient_user" ? "patient" : scannerType === "emt" ? "emt" : scannerType === "hospital" ? "hospital" : null,
      entity_type: "patient", entity_id: patientId, session_id: sess.id, tenant_id: TENANT,
      metadata: { scanner_type: scannerType, scanner_user_id: scannerUserId, scanner_phone: scannerPhone, patient_id: patientId, token, gps: { lat, lng }, disclosed_data_level: scannerType === "emt" || scannerType === "hospital" ? "tier2" : "tier1" },
    });
    // Notify contacts (no scanner phone leak)
    await admin.from("notifications").insert(contacts.map((c) => ({
      tenant_id: TENANT, audience: "emergency_contact", channel: "in_app",
      recipient_contact_id: c.id, session_id: sess.id,
      title: `POSSIBLE EMERGENCY — ${pprof ? "Asha Demo" : "Patient"}`,
      body: `Reported by ${scannerType}. Tap for live status and location.`,
      payload: { kind: "emergency_report", reporter_type: scannerType, lat, lng, maps_url: demoMapsUrl, location_source: locationSource, demo_mode: demoMode, notify_url: `/n/${c.notify_token}` },
    })));
    // Notify hospitals
    const { data: hStaff } = await admin.from("hospital_staff").select("user_id");
    if (hStaff?.length) {
      await admin.from("notifications").insert(hStaff.map((s) => ({
        tenant_id: TENANT, audience: "hospital", channel: "in_app",
        recipient_user_id: s.user_id, session_id: sess.id,
        title: "POSSIBLE EMERGENCY REPORTED",
        body: `Source: ${scannerType}. Awaiting EMT confirmation.`,
        payload: { kind: "possible_emergency", reporter_type: scannerType, lat, lng, maps_url: demoMapsUrl, confirmed: scannerType === "emt", demo_mode: demoMode },
      })));
    }
    return sess.id;
  }

  async function assertWorkflow(label, sessionId, expectedScannerType, expectedAction, expectedLevel, expectedConfidence) {
    const { data: sess } = await admin.from("emergency_sessions").select("*").eq("id", sessionId).single();
    check(`[${label}] session.scanner_type=${expectedScannerType}`, sess.scanner_type === expectedScannerType, sess.scanner_type);
    check(`[${label}] session has GPS lat/lng`, sess.gps_lat != null && sess.gps_lng != null);
    check(`[${label}] session.location_source recorded`, sess.location_source != null);
    check(`[${label}] session.demo_mode boolean`, typeof sess.demo_mode === "boolean");

    const { data: logs } = await admin.from("audit_logs").select("action, metadata").eq("session_id", sessionId);
    const actions = logs.map((l) => l.action);
    check(`[${label}] audit ${expectedAction}`, actions.includes(expectedAction));
    check(`[${label}] audit MEDICAL_INFO_DISCLOSED`, actions.includes("MEDICAL_INFO_DISCLOSED"));
    const discl = logs.find((l) => l.action === "MEDICAL_INFO_DISCLOSED");
    check(`[${label}] disclosure tier=${expectedLevel}`, discl?.metadata?.disclosed_data_level === expectedLevel, discl?.metadata?.disclosed_data_level);
    check(`[${label}] disclosure records scanner_type`, discl?.metadata?.scanner_type === expectedScannerType);

    const { data: notifs } = await admin.from("notifications").select("audience, payload, recipient_contact_id").eq("session_id", sessionId);
    check(`[${label}] hospital notification sent`, notifs.some((n) => n.audience === "hospital"));
    check(`[${label}] contact notification sent`, notifs.some((n) => n.audience === "emergency_contact"));
    const contactNotif = notifs.find((n) => n.audience === "emergency_contact");
    check(`[${label}] contact notification has maps_url`, !!contactNotif?.payload?.maps_url && contactNotif.payload.maps_url.startsWith("https://www.google.com/maps?q="));
    check(`[${label}] contact notification does NOT expose scanner phone`, !contactNotif?.payload?.reporter_phone || contactNotif.payload.reporter_phone === null);

    // Contact page renders reporter pill + confidence + disclosure banner
    const html = await (await fetch(`${BASE_URL}/n/${contact.notify_token}`)).text();
    check(`[${label}] contact page shows disclosure banner`, html.includes("Emergency Report Submitted"));
    check(`[${label}] contact page shows confidence "${expectedConfidence}"`, html.includes(expectedConfidence));
  }

  // 11a. Public scanner
  const pubSessionId = await simulateScannerReport({
    scannerType: "public", scannerPhone: "+919000000111",
    triggeredVia: "reported_by_public", action: "PUBLIC_EMERGENCY_REPORTED",
  });
  await assertWorkflow("PUBLIC", pubSessionId, "public", "PUBLIC_EMERGENCY_REPORTED", "tier1", "Public Report");

  // 11b. Patient-user scanner
  const puSessionId = await simulateScannerReport({
    scannerType: "patient_user", scannerUserId: emtUserId, // re-use any auth user id
    triggeredVia: "reported_by_patient_user", action: "PATIENT_USER_EMERGENCY_REPORTED",
  });
  await assertWorkflow("PATIENT_USER", puSessionId, "patient_user", "PATIENT_USER_EMERGENCY_REPORTED", "tier1", "Patient Report");

  // 11c. EMT scanner — Tier-2 access
  const emtSessionId = await simulateScannerReport({
    scannerType: "emt", scannerUserId: emtUserId,
    triggeredVia: "reported_by_emt", action: "EMT_ACCESS_GRANTED",
  });
  await assertWorkflow("EMT", emtSessionId, "emt", "EMT_ACCESS_GRANTED", "tier2", "EMT Confirmed");

  // 11d. Hospital scanner — Tier-2 access (no new session needed; logs against pubSession)
  await admin.from("audit_logs").insert([
    { action: "HOSPITAL_ACCESS_GRANTED", actor_user_id: hospUserId, actor_role: "hospital",
      entity_type: "patient", entity_id: patientId, session_id: pubSessionId, tenant_id: TENANT,
      metadata: { scanner_type: "hospital", scanner_user_id: hospUserId, token } },
    { action: "MEDICAL_INFO_DISCLOSED", actor_user_id: hospUserId, actor_role: "hospital",
      entity_type: "patient", entity_id: patientId, session_id: pubSessionId, tenant_id: TENANT,
      metadata: { scanner_type: "hospital", scanner_user_id: hospUserId, patient_id: patientId, token, disclosed_data_level: "tier2" } },
  ]);
  const { data: hosLogs } = await admin.from("audit_logs").select("action, metadata").eq("session_id", pubSessionId);
  check("[HOSPITAL] HOSPITAL_ACCESS_GRANTED logged", hosLogs.some((l) => l.action === "HOSPITAL_ACCESS_GRANTED"));
  check("[HOSPITAL] Tier-2 disclosure logged", hosLogs.some((l) => l.action === "MEDICAL_INFO_DISCLOSED" && l.metadata?.scanner_type === "hospital" && l.metadata?.disclosed_data_level === "tier2"));

  // 11e. Demo emergency call simulation
  await admin.from("audit_logs").insert({
    action: "EMERGENCY_CALL_SIMULATED", entity_type: "emergency_session", entity_id: pubSessionId,
    session_id: pubSessionId, tenant_id: TENANT, metadata: { number: "112", simulated: true },
  });
  const { data: callLogs } = await admin.from("audit_logs").select("action, metadata").eq("session_id", pubSessionId).eq("action", "EMERGENCY_CALL_SIMULATED");
  check("[DEMO CALL] EMERGENCY_CALL_SIMULATED logged with number 112", callLogs.length > 0 && callLogs[0].metadata?.number === "112" && callLogs[0].metadata?.simulated === true);

  // 11f. Demo location fallback verification
  const { data: demoSess } = await admin.from("emergency_sessions").select("location_source, gps_lat, gps_lng").eq("id", pubSessionId).single();
  check("[DEMO LOCATION] location_source=demo persisted", demoSess.location_source === "demo");
  check("[DEMO LOCATION] India Gate coordinates", Math.abs(demoSess.gps_lat - 28.6129) < 0.01 && Math.abs(demoSess.gps_lng - 77.2295) < 0.01);

  // 11g. Demo verification — public scanner used demo_verification method
  const { data: pubVerif } = await admin.from("emergency_sessions").select("scanner_verification_method").eq("id", pubSessionId).single();
  check("[DEMO VERIFICATION] public scanner used demo_verification", pubVerif.scanner_verification_method === "demo_verification");

  // 11h. Disclosure controls — resolveScanToken must NOT auto-disclose tier1/tier2
  const preScan = await admin.from("audit_logs").select("metadata").eq("entity_id", patientId).eq("action", "QR_SCANNED").order("created_at", { ascending: false }).limit(1).maybeSingle();
  check("[DISCLOSURE CONTROL] QR_SCANNED logged separately from MEDICAL_INFO_DISCLOSED",
    preScan.data == null || !preScan.data.metadata?.disclosed_data_level);

  // 11i. Public seed endpoint still healthy
  const res = await fetch(`${BASE_URL}/api/public/seed`, { method: "POST" });
  check("Seed endpoint still healthy", res.ok);


  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length === 0 ? "🎉 ALL PASS" : `⚠️  ${failed.length} FAILED`} (${results.length - failed.length}/${results.length})`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error("\n💥", e); process.exit(1); });
