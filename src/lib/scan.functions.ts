/**
 * QR scan + emergency-report server functions.
 *
 * Privacy model: scanning a QR returns ONLY a patient first name and a
 * resolved patient_id. No medical data is disclosed until the scanner
 * declares an emergency (or proves they are an EMT/hospital user), at which
 * point a MEDICAL_INFO_DISCLOSED audit row is written and tiered data is
 * returned.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEMO_MODE } from "@/lib/demo-mode";
import { z } from "zod";

const TENANT = "00000000-0000-0000-0000-000000000001";
const DEMO_PATIENT_EMAIL = "demo.patient@savitri.app";

type EmergencyTokenRow = { patient_id: string; active: boolean };

function getMaskedDemoTokenParts(token: string) {
  const match = token.match(/^([A-Za-z0-9]{8})(?:…|\.\.\.)([A-Za-z0-9]{6})$/);
  return match ? { prefix: match[1], suffix: match[2] } : null;
}

async function resolveActiveEmergencyToken(token: string): Promise<EmergencyTokenRow | null> {
  const { data: exact } = await supabaseAdmin
    .from("emergency_tokens")
    .select("patient_id, active")
    .eq("token", token)
    .maybeSingle();
  if (exact?.active) return exact;

  if (!DEMO_MODE) return null;

  const maskedParts = getMaskedDemoTokenParts(token);
  if (maskedParts) {
    const { data: matches } = await supabaseAdmin
      .from("emergency_tokens")
      .select("patient_id, active")
      .eq("active", true)
      .ilike("token", `${maskedParts.prefix}%${maskedParts.suffix}`)
      .limit(2);
    if (matches?.length === 1) return matches[0];
  }

  const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const demoPatientId = users?.users.find((u) => u.email === DEMO_PATIENT_EMAIL)?.id;
  if (!demoPatientId) return null;
  const { data: demoToken } = await supabaseAdmin
    .from("emergency_tokens")
    .select("patient_id, active")
    .eq("patient_id", demoPatientId)
    .eq("active", true)
    .maybeSingle();
  return demoToken ?? null;
}

function mapsLinkFor(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * MVP hospital fan-out: notify only the seeded demo hospital
 * ("Savitri General Hospital"), or the first hospital if not found.
 * Future: replace with nearest-hospital logic without changing callers.
 */
async function getNotificationHospitalIds(): Promise<string[]> {
  const { data: named } = await supabaseAdmin
    .from("hospitals")
    .select("id")
    .ilike("name", "%Savitri General Hospital%")
    .limit(1);
  if (named && named.length > 0) return named.map((h) => h.id);
  const { data: any1 } = await supabaseAdmin.from("hospitals").select("id").limit(1);
  return (any1 ?? []).map((h) => h.id);
}

async function notifyContacts(opts: {
  patientId: string;
  sessionId: string;
  patientName: string | null;
  reporterType: "public" | "patient_user" | "emt" | "hospital";
  scannerPhone?: string | null;
  scannerUserId?: string | null;
  lat: number | null;
  lng: number | null;
  locationSource: "device" | "demo" | null;
  demoMode: boolean;
}) {
  const { data: contacts } = await supabaseAdmin
    .from("emergency_contacts")
    .select("id, name, notify_token")
    .eq("patient_id", opts.patientId);
  if (!contacts?.length) return 0;

  const maps_url = mapsLinkFor(opts.lat, opts.lng);
  const title = `POSSIBLE EMERGENCY — ${opts.patientName ?? "Patient"}`;
  const body = `Reported by ${reporterLabel(opts.reporterType)}. Tap for live status and location.`;

  await supabaseAdmin.from("notifications").insert(
    contacts.map((c) => ({
      tenant_id: TENANT,
      audience: "emergency_contact" as const,
      channel: "in_app" as const,
      recipient_contact_id: c.id,
      session_id: opts.sessionId,
      title,
      body,
      payload: {
        kind: "emergency_report",
        patient_name: opts.patientName,
        reporter_type: opts.reporterType,
        reporter_phone: opts.scannerPhone ?? null,
        reporter_user_id: opts.scannerUserId ?? null,
        session_id: opts.sessionId,
        lat: opts.lat,
        lng: opts.lng,
        maps_url,
        location_source: opts.locationSource,
        location_status: opts.lat != null && opts.lng != null ? "captured" : "unavailable",
        demo_mode: opts.demoMode,
        status: "awaiting_emt_confirmation",
        notify_url: `/n/${c.notify_token}`,
      },
    })),
  );

  await supabaseAdmin.from("audit_logs").insert(
    contacts.map((c) => ({
      action: "CONTACT_NOTIFIED" as const,
      actor_user_id: opts.scannerUserId ?? null,
      actor_role: opts.reporterType === "patient_user" ? "patient" : opts.reporterType === "emt" ? "emt" : opts.reporterType === "hospital" ? "hospital" : null,
      entity_type: "emergency_contact",
      entity_id: c.id,
      session_id: opts.sessionId,
      tenant_id: TENANT,
      metadata: { contact_name: c.name, reporter_type: opts.reporterType },
    })),
  );

  return contacts.length;
}

async function notifyHospitals(opts: {
  patientId: string;
  sessionId: string;
  patientName: string | null;
  reporterType: "public" | "patient_user" | "emt" | "hospital";
  lat: number | null;
  lng: number | null;
  demoMode: boolean;
}) {
  const hospitalIds = await getNotificationHospitalIds();
  if (!hospitalIds.length) return 0;
  const { data: staff } = await supabaseAdmin
    .from("hospital_staff")
    .select("user_id, hospital_id")
    .in("hospital_id", hospitalIds);
  if (!staff?.length) return 0;
  const maps_url = mapsLinkFor(opts.lat, opts.lng);
  await supabaseAdmin.from("notifications").insert(
    staff.map((s) => ({
      tenant_id: TENANT,
      audience: "hospital" as const,
      channel: "in_app" as const,
      recipient_user_id: s.user_id,
      session_id: opts.sessionId,
      title: "POSSIBLE EMERGENCY REPORTED",
      body: `Source: ${reporterLabel(opts.reporterType)}. Awaiting EMT confirmation.`,
      payload: {
        kind: "possible_emergency",
        patient_name: opts.patientName,
        source: reporterLabel(opts.reporterType),
        reporter_type: opts.reporterType,
        confirmed: opts.reporterType === "emt",
        lat: opts.lat,
        lng: opts.lng,
        maps_url,
        status: "awaiting_emt_confirmation",
        demo_mode: opts.demoMode,
      },
    })),
  );
  return staff.length;
}

function reporterLabel(t: "public" | "patient_user" | "emt" | "hospital") {
  return t === "public" ? "Public User" : t === "patient_user" ? "Patient User" : t === "emt" ? "EMT" : "Hospital";
}

async function tier1(patientId: string) {
  const [{ data: profile }, { data: medical }, { data: contacts }] = await Promise.all([
    supabaseAdmin.from("profiles").select("full_name, phone").eq("id", patientId).maybeSingle(),
    supabaseAdmin
      .from("patient_profiles")
      .select("blood_group, allergies, conditions, date_of_birth")
      .eq("user_id", patientId)
      .maybeSingle(),
    supabaseAdmin.from("emergency_contacts").select("name, phone, relation").eq("patient_id", patientId),
  ]);
  const age = medical?.date_of_birth
    ? Math.floor((Date.now() - new Date(medical.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  return {
    full_name: profile?.full_name ?? null,
    age,
    blood_group: medical?.blood_group ?? null,
    allergies: medical?.allergies ?? [],
    conditions: medical?.conditions ?? [],
    current_medications: [] as string[], // placeholder until table exists
    emergency_contacts: contacts ?? [],
  };
}

async function tier2(patientId: string) {
  const { data: priorSessions } = await supabaseAdmin
    .from("emergency_sessions")
    .select("id, opened_at, status, triggered_via, ai_summary")
    .eq("patient_id", patientId)
    .order("opened_at", { ascending: false })
    .limit(5);
  const { data: medical } = await supabaseAdmin
    .from("patient_profiles")
    .select("insurance_provider, insurance_policy_no")
    .eq("user_id", patientId)
    .maybeSingle();
  return {
    extended_profile: medical ?? null,
    medical_notes: null,
    prior_sessions: priorSessions ?? [],
  };
}

async function logDisclosure(opts: {
  patientId: string;
  sessionId: string | null;
  token: string;
  scannerType: "public" | "patient_user" | "emt" | "hospital";
  scannerUserId: string | null;
  scannerPhone: string | null;
  lat: number | null;
  lng: number | null;
  level: "tier1" | "tier2" | "tier3";
}) {
  await supabaseAdmin.from("audit_logs").insert({
    action: "MEDICAL_INFO_DISCLOSED",
    actor_user_id: opts.scannerUserId,
    actor_role:
      opts.scannerType === "patient_user"
        ? "patient"
        : opts.scannerType === "emt"
          ? "emt"
          : opts.scannerType === "hospital"
            ? "hospital"
            : null,
    entity_type: "patient",
    entity_id: opts.patientId,
    session_id: opts.sessionId,
    tenant_id: TENANT,
    metadata: {
      scanner_type: opts.scannerType,
      scanner_user_id: opts.scannerUserId,
      scanner_phone: opts.scannerPhone,
      patient_id: opts.patientId,
      token: opts.token,
      gps: opts.lat != null && opts.lng != null ? { lat: opts.lat, lng: opts.lng } : null,
      disclosed_data_level: opts.level,
      timestamp: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/* PUBLIC: resolve token (NO medical data, NO audit yet)              */
/* ------------------------------------------------------------------ */
export const resolveScanToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const tok = await resolveActiveEmergencyToken(data.token);
    if (!tok) return { active: false as const };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", tok.patient_id)
      .maybeSingle();

    // Best-effort scan audit (no actor — public scan).
    await supabaseAdmin.from("audit_logs").insert({
      action: "QR_SCANNED",
      entity_type: "patient",
      entity_id: tok.patient_id,
      tenant_id: TENANT,
      metadata: { token: data.token, scanner_type: "unknown_pre_declaration" },
    });

    const first_name = profile?.full_name?.split(" ")[0] ?? null;
    return { active: true as const, patient_id: tok.patient_id, patient_first_name: first_name };
  });

/* ------------------------------------------------------------------ */
/* PUBLIC: report emergency from a public (unauthenticated) scanner    */
/* ------------------------------------------------------------------ */
const PublicReportInput = z.object({
  token: z.string().min(8).max(200),
  phone: z.string().min(4).max(40),
  consent: z.literal(true),
  verification_method: z.enum(["otp", "demo_verification"]).default("demo_verification"),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().min(0).max(100000).nullable().optional(),
  location_source: z.enum(["device", "demo"]).default("device"),
  demo_mode: z.boolean().default(true),
  user_agent: z.string().max(300).optional().nullable(),
});

export const reportEmergencyPublic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PublicReportInput.parse(d))
  .handler(async ({ data }) => {
    const tok = await resolveActiveEmergencyToken(data.token);
    if (!tok) throw new Error("Invalid or revoked QR token");
    const patientId = tok.patient_id;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", patientId)
      .maybeSingle();

    const { data: session, error: sessErr } = await supabaseAdmin
      .from("emergency_sessions")
      .insert({
        patient_id: patientId,
        status: "open",
        tenant_id: TENANT,
        gps_lat: data.lat ?? null,
        gps_lng: data.lng ?? null,
        gps_accuracy: data.accuracy ?? null,
        triggered_via: "reported_by_public",
        silent: false,
        scanner_type: "public",
        scanner_user_id: null,
        scanner_phone: data.phone,
        scanner_verification_method: data.verification_method,
        location_source: data.location_source,
        demo_mode: data.demo_mode,
        recording_status: null,
      })
      .select()
      .single();
    if (sessErr || !session) throw new Error(sessErr?.message ?? "Failed to open session");

    await supabaseAdmin.from("audit_logs").insert({
      action: "PUBLIC_EMERGENCY_REPORTED",
      entity_type: "emergency_session",
      entity_id: session.id,
      session_id: session.id,
      tenant_id: TENANT,
      metadata: {
        scanner_type: "public",
        scanner_phone: data.phone,
        patient_id: patientId,
        token: data.token,
        gps: data.lat != null && data.lng != null ? { lat: data.lat, lng: data.lng } : null,
        location_source: data.location_source,
        verification_method: data.verification_method,
        demo_mode: data.demo_mode,
        user_agent: data.user_agent ?? null,
      },
    });

    const [notifiedContacts, notifiedHospitals] = await Promise.all([
      notifyContacts({
        patientId,
        sessionId: session.id,
        patientName: profile?.full_name ?? null,
        reporterType: "public",
        scannerPhone: data.phone,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        locationSource: data.location_source,
        demoMode: data.demo_mode,
      }),
      notifyHospitals({
        patientId,
        sessionId: session.id,
        patientName: profile?.full_name ?? null,
        reporterType: "public",
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        demoMode: data.demo_mode,
      }),
    ]);

    await logDisclosure({
      patientId,
      sessionId: session.id,
      token: data.token,
      scannerType: "public",
      scannerUserId: null,
      scannerPhone: data.phone,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      level: "tier1",
    });

    const data1 = await tier1(patientId);
    return {
      session_id: session.id,
      patient_id: patientId,
      notified_contacts: notifiedContacts,
      notified_hospitals: notifiedHospitals,
      tier1: data1,
      disclosure_reason: "Emergency Report Submitted",
      maps_url: mapsLinkFor(data.lat, data.lng),
    };
  });

/* ------------------------------------------------------------------ */
/* AUTH: report emergency by a logged-in patient who scanned someone   */
/* ------------------------------------------------------------------ */
const PatientUserReportInput = z.object({
  token: z.string().min(8).max(200),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().min(0).max(100000).nullable().optional(),
  location_source: z.enum(["device", "demo"]).default("device"),
  demo_mode: z.boolean().default(true),
});

export const reportEmergencyPatientUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PatientUserReportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const tok = await resolveActiveEmergencyToken(data.token);
    if (!tok) throw new Error("Invalid or revoked QR token");
    if (tok.patient_id === userId) throw new Error("Cannot report an emergency for yourself via QR scan — use SOS instead.");

    const patientId = tok.patient_id;
    const [{ data: profile }, { data: scannerProfile }] = await Promise.all([
      supabaseAdmin.from("profiles").select("full_name").eq("id", patientId).maybeSingle(),
      supabaseAdmin.from("profiles").select("phone").eq("id", userId).maybeSingle(),
    ]);

    const { data: session, error: sessErr } = await supabaseAdmin
      .from("emergency_sessions")
      .insert({
        patient_id: patientId,
        status: "open",
        tenant_id: TENANT,
        gps_lat: data.lat ?? null,
        gps_lng: data.lng ?? null,
        gps_accuracy: data.accuracy ?? null,
        triggered_via: "reported_by_patient_user",
        silent: false,
        scanner_type: "patient_user",
        scanner_user_id: userId,
        scanner_phone: scannerProfile?.phone ?? null,
        scanner_verification_method: "authenticated",
        location_source: data.location_source,
        demo_mode: data.demo_mode,
      })
      .select()
      .single();
    if (sessErr || !session) throw new Error(sessErr?.message ?? "Failed to open session");

    await supabaseAdmin.from("audit_logs").insert({
      action: "PATIENT_USER_EMERGENCY_REPORTED",
      actor_user_id: userId,
      actor_role: "patient",
      entity_type: "emergency_session",
      entity_id: session.id,
      session_id: session.id,
      tenant_id: TENANT,
      metadata: {
        scanner_type: "patient_user",
        scanner_user_id: userId,
        patient_id: patientId,
        token: data.token,
        gps: data.lat != null && data.lng != null ? { lat: data.lat, lng: data.lng } : null,
        location_source: data.location_source,
        demo_mode: data.demo_mode,
      },
    });

    const [notifiedContacts, notifiedHospitals] = await Promise.all([
      notifyContacts({
        patientId,
        sessionId: session.id,
        patientName: profile?.full_name ?? null,
        reporterType: "patient_user",
        scannerPhone: scannerProfile?.phone ?? null,
        scannerUserId: userId,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        locationSource: data.location_source,
        demoMode: data.demo_mode,
      }),
      notifyHospitals({
        patientId,
        sessionId: session.id,
        patientName: profile?.full_name ?? null,
        reporterType: "patient_user",
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        demoMode: data.demo_mode,
      }),
    ]);

    await logDisclosure({
      patientId,
      sessionId: session.id,
      token: data.token,
      scannerType: "patient_user",
      scannerUserId: userId,
      scannerPhone: scannerProfile?.phone ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      level: "tier1",
    });

    const data1 = await tier1(patientId);
    return {
      session_id: session.id,
      patient_id: patientId,
      notified_contacts: notifiedContacts,
      notified_hospitals: notifiedHospitals,
      tier1: data1,
      disclosure_reason: "Emergency Report Submitted",
      maps_url: mapsLinkFor(data.lat, data.lng),
    };
  });

/* ------------------------------------------------------------------ */
/* AUTH: EMT immediate access (Tier 1 + 2)                             */
/* ------------------------------------------------------------------ */
export const grantEmtAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: emt } = await supabaseAdmin.from("emts").select("user_id").eq("user_id", userId).maybeSingle();
    if (!emt) throw new Error("Not authorized as EMT");
    const tok = await resolveActiveEmergencyToken(data.token);
    if (!tok) throw new Error("Invalid or revoked QR token");

    await supabaseAdmin.from("audit_logs").insert({
      action: "EMT_ACCESS_GRANTED",
      actor_user_id: userId,
      actor_role: "emt",
      entity_type: "patient",
      entity_id: tok.patient_id,
      tenant_id: TENANT,
      metadata: { token: data.token, scanner_type: "emt" },
    });
    await logDisclosure({
      patientId: tok.patient_id,
      sessionId: null,
      token: data.token,
      scannerType: "emt",
      scannerUserId: userId,
      scannerPhone: null,
      lat: null,
      lng: null,
      level: "tier2",
    });

    const [t1, t2] = await Promise.all([tier1(tok.patient_id), tier2(tok.patient_id)]);
    return { patient_id: tok.patient_id, tier1: t1, tier2: t2, disclosure_reason: "EMT Access Granted" };
  });

/* ------------------------------------------------------------------ */
/* AUTH: Hospital immediate access (Tier 1 + 2)                        */
/* ------------------------------------------------------------------ */
export const grantHospitalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: staff } = await supabaseAdmin
      .from("hospital_staff")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!staff) throw new Error("Not authorized as hospital staff");
    const tok = await resolveActiveEmergencyToken(data.token);
    if (!tok) throw new Error("Invalid or revoked QR token");

    await supabaseAdmin.from("audit_logs").insert({
      action: "HOSPITAL_ACCESS_GRANTED",
      actor_user_id: userId,
      actor_role: "hospital",
      entity_type: "patient",
      entity_id: tok.patient_id,
      tenant_id: TENANT,
      metadata: { token: data.token, scanner_type: "hospital" },
    });
    await logDisclosure({
      patientId: tok.patient_id,
      sessionId: null,
      token: data.token,
      scannerType: "hospital",
      scannerUserId: userId,
      scannerPhone: null,
      lat: null,
      lng: null,
      level: "tier2",
    });

    const [t1, t2] = await Promise.all([tier1(tok.patient_id), tier2(tok.patient_id)]);
    return { patient_id: tok.patient_id, tier1: t1, tier2: t2, disclosure_reason: "Hospital Access Granted" };
  });

/* ------------------------------------------------------------------ */
/* PUBLIC: log emergency-services call (real or simulated)             */
/* ------------------------------------------------------------------ */
export const logEmergencyCall = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        session_id: z.string().uuid().nullable().optional(),
        patient_id: z.string().uuid().nullable().optional(),
        simulated: z.boolean(),
        number: z.string().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await supabaseAdmin.from("audit_logs").insert({
      action: data.simulated ? "EMERGENCY_CALL_SIMULATED" : "EMERGENCY_CALL_INITIATED",
      entity_type: data.session_id ? "emergency_session" : "patient",
      entity_id: data.session_id ?? data.patient_id ?? null,
      session_id: data.session_id ?? null,
      tenant_id: TENANT,
      metadata: { number: data.number ?? "112", simulated: data.simulated },
    });
    return { ok: true };
  });
