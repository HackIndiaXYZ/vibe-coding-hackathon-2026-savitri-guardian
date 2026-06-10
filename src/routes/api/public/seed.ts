import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";

const DEMO = {
  patient: { email: "demo.patient@savitri.app", password: "DemoPatient!2026", name: "Asha Demo", role: "patient" as const },
  emt: { email: "demo.emt@savitri.app", password: "DemoEmt!2026", name: "Ravi Medic", role: "emt" as const },
  hospital: { email: "demo.hospital@savitri.app", password: "DemoHospital!2026", name: "Dr. Mehta", role: "hospital" as const },
};

async function ensureUser(email: string, password: string, full_name: string) {
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = list?.users.find((u) => u.email === email);
  if (!user) {
    const { data: c, error } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name },
    });
    if (error) throw new Error(`create ${email}: ${error.message}`);
    user = c.user!;
  }
  return user!;
}

export async function runDemoSeed() {
  const patient = await ensureUser(DEMO.patient.email, DEMO.patient.password, DEMO.patient.name);
  const emtUser = await ensureUser(DEMO.emt.email, DEMO.emt.password, DEMO.emt.name);
  const hospUser = await ensureUser(DEMO.hospital.email, DEMO.hospital.password, DEMO.hospital.name);

  await supabaseAdmin.from("profiles").upsert([
    { id: patient.id, full_name: DEMO.patient.name, phone: "+91 90000 00001", tenant_id: DEFAULT_TENANT },
    { id: emtUser.id, full_name: DEMO.emt.name, phone: "+91 90000 00002", tenant_id: DEFAULT_TENANT },
    { id: hospUser.id, full_name: DEMO.hospital.name, phone: "+91 90000 00003", tenant_id: DEFAULT_TENANT },
  ]);

  // Make sure each demo user has EXACTLY one correct role.
  // The new-user trigger always adds role='patient'; we wipe and re-insert the
  // canonical role per account so EMT/Hospital don't keep a stale patient row.
  const trio: Array<{ id: string; role: "patient" | "emt" | "hospital" }> = [
    { id: patient.id, role: "patient" },
    { id: emtUser.id, role: "emt" },
    { id: hospUser.id, role: "hospital" },
  ];
  for (const r of trio) {
    await supabaseAdmin.from("user_roles").delete().eq("user_id", r.id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: r.id, role: r.role, tenant_id: DEFAULT_TENANT });
    if (error) throw new Error(`role ${r.role} for ${r.id}: ${error.message}`);
  }

  await supabaseAdmin.from("patient_profiles").upsert({
    user_id: patient.id, tenant_id: DEFAULT_TENANT,
    date_of_birth: "1992-03-14", blood_group: "B+",
    allergies: ["Penicillin", "Peanuts"], conditions: ["Asthma", "Hypertension"],
    insurance_provider: "Star Health", insurance_policy_no: "SH-44218-9921",
  });

  const { data: existingContact } = await supabaseAdmin.from("emergency_contacts").select("id").eq("patient_id", patient.id).limit(1);
  if (!existingContact?.length) {
    await supabaseAdmin.from("emergency_contacts").insert({
      patient_id: patient.id, name: "Priya Demo", relation: "Spouse", phone: "+91 90000 99999", email: "priya@example.com",
    });
  }

  const { data: tok } = await supabaseAdmin.from("emergency_tokens").select("id").eq("patient_id", patient.id).eq("active", true).maybeSingle();
  if (!tok) {
    await supabaseAdmin.from("emergency_tokens").insert({ patient_id: patient.id, active: true });
  }

  // emts row (PK is user_id)
  await supabaseAdmin.from("emts").delete().eq("user_id", emtUser.id);
  await supabaseAdmin.from("emts").insert({ user_id: emtUser.id, tenant_id: DEFAULT_TENANT, agency: "Savitri EMS", badge_no: "EMT-001" });

  const { data: hospitals } = await supabaseAdmin.from("hospitals").select("id").order("name");
  if (hospitals?.length) {
    await supabaseAdmin.from("hospital_staff").delete().eq("user_id", hospUser.id);
    await supabaseAdmin.from("hospital_staff").insert({ user_id: hospUser.id, hospital_id: hospitals[0].id });
  }

  return { patient_id: patient.id, emt_id: emtUser.id, hospital_user_id: hospUser.id };
}

export const Route = createFileRoute("/api/public/seed")({
  // @ts-expect-error - server route handlers (typed in router-plugin transform, not in d.ts yet)
  server: {
    handlers: {
      POST: async () => {
        try {
          const ids = await runDemoSeed();
          return new Response(JSON.stringify({ ok: true, ...ids }), { headers: { "Content-Type": "application/json" } });
        } catch (e: any) {
          console.error("[seed]", e);
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});
