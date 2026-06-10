import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runDemoSeed } from "./seed";

const DEMO_EMAILS = [
  "demo.patient@savitri.app",
  "demo.emt@savitri.app",
  "demo.hospital@savitri.app",
];

async function getDemoUserIds(): Promise<string[]> {
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return (list?.users ?? []).filter((u) => DEMO_EMAILS.includes(u.email ?? "")).map((u) => u.id);
}

export const Route = createFileRoute("/api/public/demo-reset")({
  // @ts-expect-error - server route handlers (typed in router-plugin transform, not in d.ts yet)
  server: {
    handlers: {
      POST: async () => {
        try {
          const ids = await getDemoUserIds();
          if (ids.length) {
            // wipe in-flight emergency data so the demo flow restarts cleanly.
            // (We keep the demo users themselves; seed will refresh their state.)
            const { data: sessions } = await supabaseAdmin
              .from("emergency_sessions").select("id").in("patient_id", ids);
            const sessionIds = (sessions ?? []).map((s) => s.id);

            await supabaseAdmin.from("audit_logs").delete().in("actor_user_id", ids);
            if (sessionIds.length) {
              await supabaseAdmin.from("audit_logs").delete().in("session_id", sessionIds);
              await supabaseAdmin.from("notifications").delete().in("session_id", sessionIds);
              await supabaseAdmin.from("incidents").delete().in("session_id", sessionIds);
              await supabaseAdmin.from("emergency_sessions").delete().in("id", sessionIds);
            }
            await supabaseAdmin.from("notifications").delete().in("recipient_user_id", ids);
            await supabaseAdmin.from("emergency_tokens").delete().in("patient_id", ids);
            await supabaseAdmin.from("emergency_contacts").delete().in("patient_id", ids);
          }
          const out = await runDemoSeed();
          return new Response(JSON.stringify({ ok: true, ...out }), { headers: { "Content-Type": "application/json" } });
        } catch (e: any) {
          console.error("[demo-reset]", e);
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});
