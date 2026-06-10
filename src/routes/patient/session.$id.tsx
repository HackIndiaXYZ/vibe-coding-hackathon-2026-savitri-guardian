import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { EmergencyTimeline } from "@/components/EmergencyTimeline";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuthReady } from "@/lib/auth-context";

import { getEmergencyTimeline } from "@/lib/timeline.functions";
import { ChevronLeft } from "lucide-react";

import { RouteError, RouteNotFound } from "@/components/RouteBoundary";

export const Route = createFileRoute("/patient/session/$id")({
  head: () => ({ meta: [{ title: "Emergency session — Savitri" }] }),
  component: PatientSessionPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="patient" />,
  notFoundComponent: () => <RouteNotFound scope="patient" />,
});

function PatientSessionPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getEmergencyTimeline);
  const ready = useAuthReady();
  const { data } = useQuery({ queryKey: ["timeline", id], queryFn: () => fn({ data: { session_id: id } }), refetchInterval: 4000, enabled: ready });

  const incident = data?.incident as any;

  return (
    <AppShell requireRole="patient">
      <Link to="/patient" className="inline-flex items-center text-sm text-muted-foreground mb-3"><ChevronLeft className="h-4 w-4" />Back</Link>
      <h1 className="text-2xl font-bold">Active emergency</h1>
      {incident && (
        <div className="mt-4 rounded-2xl border p-4">
          <div className="text-sm text-muted-foreground">Hospital</div>
          <div className="font-semibold">{incident.hospitals?.name ?? "—"}</div>
          <div className="text-sm mt-2"><span className="text-muted-foreground">Status:</span> <span className="font-medium uppercase">{incident.status}</span></div>
          {incident.priority && <div className="text-sm"><span className="text-muted-foreground">Priority:</span> <span className="font-medium uppercase">{incident.priority}</span></div>}
          {incident.registration_number && <div className="text-sm"><span className="text-muted-foreground">Registration:</span> <span className="font-medium">{incident.registration_number}</span></div>}
        </div>
      )}
      <h2 className="text-lg font-semibold mt-6 mb-3">Timeline</h2>
      <EmergencyTimeline sessionId={id} />
    </AppShell>
  );
}
