import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getEmtDashboard } from "@/lib/emt.functions";
import { loadDemoPatientSessionForEmt } from "@/lib/demo-control.functions";
import { DEMO_MODE } from "@/lib/demo-mode";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/lib/auth-context";
import { ScanLine, AlertTriangle, ChevronRight, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { RouteError, RouteNotFound } from "@/components/RouteBoundary";

export const Route = createFileRoute("/emt/")({
  head: () => ({ meta: [{ title: "EMT — Savitri" }] }),
  component: EmtHome,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="emt" />,
  notFoundComponent: () => <RouteNotFound scope="emt" />,
});

function EmtHome() {
  const fn = useServerFn(getEmtDashboard);
  const loadDemo = useServerFn(loadDemoPatientSessionForEmt);
  const navigate = useNavigate();
  const ready = useAuthReady();
  const { data, refetch } = useQuery({
    queryKey: ["emt-dash"],
    queryFn: () => fn({}),
    enabled: ready,
    refetchInterval: 8000,
  });

  const demoLoad = useMutation({
    mutationFn: () => loadDemo(),
    onSuccess: (r) => navigate({ to: "/emt/session/$id", params: { id: r.session_id } }),
    onError: (e: any) => toast.error(e?.message ?? "Demo load failed"),
  });

  useEffect(() => {
    const ch = supabase.channel("emt-dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_sessions" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const assigned = data?.assigned_sessions ?? [];
  const mine = data?.my_incidents ?? [];

  return (
    <AppShell requireRole="emt">
      <div className="space-y-5">
        <div>
          <div className="text-sm text-muted-foreground">On duty</div>
          <div className="text-2xl font-bold">EMT dashboard</div>
        </div>

        <Button asChild className="w-full h-16 text-base font-semibold bg-neon hover:bg-neon/90 text-[oklch(0.16_0.04_145)] neon-glow">
          <Link to="/emt/scan"><ScanLine className="!h-5 !w-5" /> Scan patient QR</Link>
        </Button>

        {DEMO_MODE && (
          <Button
            variant="outline"
            className="w-full h-12 border-dashed"
            onClick={() => demoLoad.mutate()}
            disabled={demoLoad.isPending}
          >
            <Sparkles className="h-4 w-4" />
            {demoLoad.isPending ? "Loading demo patient…" : "Load Demo Patient"}
          </Button>
        )}

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--warn)]" /> Assigned to you
          </h2>
          {assigned.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-xl border p-3">
              No active assignments. Hospital-dispatched cases will appear here in real time.
            </p>
          ) : (
            <ul className="space-y-2">
              {assigned.map((s: any) => (
                <li key={s.id}>
                  <Link
                    to="/emt/session/$id" params={{ id: s.id }}
                    className="flex items-center justify-between rounded-xl border p-3 hover:bg-accent transition"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{s.patient?.full_name ?? "Unknown patient"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {s.is_assigned_by_hospital ? "Hospital-dispatched" : "Self-started"}
                        {s.gps_lat != null && <><span>·</span><MapPin className="h-3 w-3" /> GPS</>}
                        <span>·</span>
                        <span>{new Date(s.opened_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {mine.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">My incidents</h2>
            <ul className="space-y-2">
              {mine.map((i: any) => (
                <li key={i.id}>
                  <Link
                    to="/emt/session/$id" params={{ id: i.session_id }}
                    className="flex items-center justify-between rounded-xl border p-3 hover:bg-accent transition"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{i.patient?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {(i.incident_type ?? "Incident")} · {i.status} · {i.priority ?? "—"}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
