import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";

const ProfileInput = z.object({
  full_name: z.string().min(1).max(120),
  phone: z.string().min(3).max(30).optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  blood_group: z.string().max(6).optional().nullable(),
  allergies: z.array(z.string().max(80)).max(30).default([]),
  conditions: z.array(z.string().max(80)).max(30).default([]),
  insurance_provider: z.string().max(120).optional().nullable(),
  insurance_policy_no: z.string().max(80).optional().nullable(),
});

export const getMyPatientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profile, medical, contacts, token] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("patient_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("emergency_contacts").select("*").eq("patient_id", userId).order("created_at"),
      supabase.from("emergency_tokens").select("*").eq("patient_id", userId).eq("active", true).maybeSingle(),
    ]);
    return {
      profile: profile.data,
      medical: medical.data,
      contacts: contacts.data ?? [],
      token: token.data,
    };
  });

export const upsertPatientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("profiles").upsert({
      id: userId, full_name: data.full_name, phone: data.phone ?? null, tenant_id: DEFAULT_TENANT,
    });
    await supabase.from("patient_profiles").upsert({
      user_id: userId,
      tenant_id: DEFAULT_TENANT,
      date_of_birth: data.date_of_birth || null,
      blood_group: data.blood_group || null,
      allergies: data.allergies,
      conditions: data.conditions,
      insurance_provider: data.insurance_provider || null,
      insurance_policy_no: data.insurance_policy_no || null,
    });
    await supabaseAdmin.from("audit_logs").insert({
      action: "PROFILE_UPDATED", actor_user_id: userId, actor_role: "patient",
      entity_type: "patient_profile", entity_id: userId, tenant_id: DEFAULT_TENANT,
    });
    return { ok: true };
  });

const ContactInput = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(160).optional().nullable(),
  relation: z.string().max(60).optional().nullable(),
});

export const addEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ContactInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("emergency_contacts")
      .insert({ ...data, patient_id: userId }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("emergency_contacts").delete().eq("id", data.id).eq("patient_id", userId);
    return { ok: true };
  });

export const issueEmergencyToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // revoke existing
    await supabase.from("emergency_tokens").update({ active: false, revoked_at: new Date().toISOString() })
      .eq("patient_id", userId).eq("active", true);
    const { data, error } = await supabase.from("emergency_tokens")
      .insert({ patient_id: userId, active: true }).select().single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      action: "QR_GENERATED", actor_user_id: userId, actor_role: "patient",
      entity_type: "emergency_token", entity_id: data.id, tenant_id: DEFAULT_TENANT,
    });
    return data;
  });

export const getPatientActiveSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: session } = await supabase.from("emergency_sessions")
      .select("*").eq("patient_id", userId).eq("status", "open")
      .order("opened_at", { ascending: false }).limit(1).maybeSingle();
    if (!session) return null;
    const { data: incident } = await supabase.from("incidents")
      .select("*, hospitals(name, address, city)")
      .eq("session_id", session.id).maybeSingle();
    return { session, incident };
  });
