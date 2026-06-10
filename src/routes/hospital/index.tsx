import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  getHospitalDashboard,
  convertSessionToIncident,
  dismissPossibleEmergency,
  assignEmtToSession,
  logHospitalCall,
} from "@/lib/hospital.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/lib/auth-context";
import {
  ChevronRight, Activity, AlertTriangle, MapPin, Loader2, X,
  Phone, PhoneCall, UserPlus, Users, ChevronDown, Siren, Stethoscope, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { RouteError, RouteNotFound } from "@/components/RouteBoundary";

export const Route = createFileRoute("/hospital/")({
  head: () => ({ meta: [{ title: "Hospital — Savitri" }] }),
  component: HospitalHome,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="hospital" />,
  notFoundComponent: () => <RouteNotFound scope="hospital" />,
});

const PRIORITY_COLOR: Record<string, string> = {
  critical: "bg-critical/15 text-[var(--critical)] border-critical/30",
  high: "bg-warn/15 text-[var(--warn)] border-warn/30",
  medium: "bg-accent text-accent-foreground border-transparent",
  low: "bg-muted text-muted-foreground border-transparent",
};

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = phone.replace(/\D+/g, "");
  if (d.length < 4) return "•".repeat(d.length);
  return `••• ••• ${d.slice(-4)}`;
}

type ReporterKind = "EMT" | "SELF" | "PUBLIC";

function reporterFromTrigger(triggered_via: string | null | undefined): ReporterKind {
  const v = (triggered_via ?? "").toString().toUpperCase();
  if (v.includes("EMT")) return "EMT";
  if (v.includes("PATIENT") || v.includes("SELF")) return "SELF";
  return "PUBLIC";
}

const REPORTER_RANK: Record<ReporterKind, number> = { EMT: 0, SELF: 1, PUBLIC: 2 };

const REPORTER_STYLE: Record<ReporterKind, { badge: string; bar: string; dot: string }> = {
  EMT:    { badge: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",       bar: "bg-red-500",    dot: "bg-red-500" },
  SELF:   { badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40", bar: "bg-orange-500", dot: "bg-orange-500" },
  PUBLIC: { badge: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-200 border-yellow-500/40", bar: "bg-yellow-500", dot: "bg-yellow-500" },
};

function HospitalHome() {
  const fn = useServerFn(getHospitalDashboard);
  const convert = useServerFn(convertSessionToIncident);
  const dismiss = useServerFn(dismissPossibleEmergency);
  const assignEmt = useServerFn(assignEmtToSession);
  const callFn = useServerFn(logHospitalCall);
  const qc = useQueryClient();
  const ready = useAuthReady();
  const { data, refetch } = useQuery({
    queryKey: ["hospital-dash"], queryFn: () => fn({}),
    refetchInterval: 8000, enabled: ready,
  });

  useEffect(() => {
    const ch = supabase.channel("hosp-incidents")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_sessions" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["hospital-dash"] });

  const convertMut = useMutation({
    mutationFn: (session_id: string) => convert({ data: { session_id } }),
    onSuccess: (r: any) => { toast.success(r.already ? "Already converted" : "Converted to incident"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const dismissMut = useMutation({
    mutationFn: (session_id: string) => dismiss({ data: { session_id, reason: "hospital_dismissed" } }),
    onSuccess: () => { toast.success("Report dismissed"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const assignMut = useMutation({
    mutationFn: (v: { session_id: string; emt_user_id: string }) =>
      assignEmt({ data: v }),
    onSuccess: () => { toast.success("EMT assigned"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const callMut = useMutation({
    mutationFn: (v: { session_id: string; target: "scanner" | "patient" | "emergency_contact"; emergency_contact_id?: string }) =>
      callFn({ data: v }),
    onSuccess: (r: any) => {
      if (r.simulated) {
        toast.success(`Call Simulation Activated — would call ${r.recipient_name ?? "recipient"} at ${r.phone}`);
      } else if (r.tel_url) {
        toast.success(`Calling ${r.recipient_name ?? r.phone}…`);
        window.location.href = r.tel_url;
      }
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const incidents = data?.incidents ?? [];
  const possibleRaw = data?.possible_emergencies ?? [];
  const possible = [...possibleRaw].sort((a: any, b: any) => {
    const ra = REPORTER_RANK[reporterFromTrigger(a.triggered_via)];
    const rb = REPORTER_RANK[reporterFromTrigger(b.triggered_via)];
    if (ra !== rb) return ra - rb;
    return new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime();
  });
  const emts = data?.available_emts ?? [];
  const demoMode = !!data?.demo_mode;

  return (
    <AppShell requireRole="hospital">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Hospital {demoMode && <span className="ml-2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] uppercase">Demo</span>}</div>
          <div className="text-2xl font-bold">{(data?.hospital as any)?.name ?? "—"}</div>
        </div>
        <Activity className="text-neon" />
      </div>

      {/* CONFIRMED INCIDENTS — primary operational queue */}
      <section className="mt-5">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-bold uppercase tracking-wider">Confirmed Incidents</h2>
          <span className="ml-auto text-xs text-muted-foreground">{incidents.length}</span>
        </div>
        <div className="space-y-3">
          {incidents.length === 0 && <p className="text-muted-foreground text-sm">No incoming incidents yet.</p>}
          {incidents.map((inc: any) => (
            <ConfirmedIncidentCard key={inc.id} inc={inc} />
          ))}
        </div>
      </section>

      {/* POSSIBLE EMERGENCIES */}
      <section className="mt-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-[var(--warn,#f59e0b)]" />
          <h2 className="text-sm font-bold uppercase tracking-wider">Possible Emergencies</h2>
          <span className="ml-auto text-xs text-muted-foreground">{possible.length}</span>
        </div>
        <div className="space-y-3">
          {possible.length === 0 && (
            <p className="text-muted-foreground text-xs">No unassigned sessions.</p>
          )}
          {possible.map((s: any) => (
            <PossibleEmergencyCard
              key={s.id}
              session={s}
              emts={emts}
              demoMode={demoMode}
              busy={
                (assignMut.isPending && assignMut.variables?.session_id === s.id) ||
                (convertMut.isPending && convertMut.variables === s.id) ||
                (dismissMut.isPending && dismissMut.variables === s.id) ||
                (callMut.isPending && callMut.variables?.session_id === s.id)
              }
              onAssign={(emt_user_id) => assignMut.mutate({ session_id: s.id, emt_user_id })}
              onCall={(target, emergency_contact_id) =>
                callMut.mutate({ session_id: s.id, target, emergency_contact_id })
              }
              onConvert={() => convertMut.mutate(s.id)}
              onDismiss={() => dismissMut.mutate(s.id)}
            />
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function PossibleEmergencyCard({
  session: s, emts, demoMode, busy,
  onAssign, onCall, onConvert, onDismiss,
}: {
  session: any;
  emts: { user_id: string; full_name: string | null; badge_no: string | null }[];
  demoMode: boolean;
  busy: boolean;
  onAssign: (emtId: string) => void;
  onCall: (target: "scanner" | "patient" | "emergency_contact", contactId?: string) => void;
  onConvert: () => void;
  onDismiss: () => void;
}) {
  const contacts: any[] = s.emergency_contacts ?? [];
  const primaryContact = contacts[0];
  const [selectedEmt, setSelectedEmt] = useState<string>(s.assigned_emt_id ?? "");
  const [selectedContact, setSelectedContact] = useState<string>(primaryContact?.id ?? "");

  const scannerPhone: string | null = s.scanner_phone ?? null;
  const patientPhone: string | null = s.patient_phone ?? null;

  const reporter = reporterFromTrigger(s.triggered_via);
  const style = REPORTER_STYLE[reporter];
  const [showDetails, setShowDetails] = useState(false);

  const locationSummary = s.gps_lat != null && s.gps_lng != null
    ? `Live GPS · ${s.location_source ?? "device"}`
    : `Location: ${s.location_source ?? "unknown"}`;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed bg-card/50 p-4 pl-5">
      <span className={`absolute left-0 top-0 h-full w-1.5 ${style.bar}`} aria-hidden />

      <div className="flex items-center gap-2 text-xs">
        <span className={`rounded-full border px-2 py-0.5 uppercase tracking-wider font-semibold ${style.badge}`}>
          {reporter}
        </span>
        {s.assigned_emt_id ? (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            EMT Assigned
          </span>
        ) : (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Unassigned
          </span>
        )}
        <span className="ml-auto text-muted-foreground">
          {new Date(s.opened_at).toLocaleTimeString()}
        </span>
      </div>

      <div className="mt-2 font-semibold">{s.patient?.full_name ?? "Unknown patient"}</div>
      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
        <MapPin className="h-3 w-3" />
        {locationSummary}
      </div>

      {/* Actions — operational priority order */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline"
          disabled={busy || contacts.length === 0 || !(selectedContact || primaryContact?.id)}
          onClick={() => onCall("emergency_contact", selectedContact || primaryContact?.id)}>
          <PhoneCall className="h-3 w-3" />
          {contacts.length === 0 ? "No Emergency Contact" : "Call Emergency Contact"}
        </Button>

        {emts.length > 0 && (
          <div className="flex items-center gap-1">
            <select
              className="rounded-md border bg-background px-2 py-1.5 text-xs max-w-[140px]"
              value={selectedEmt}
              onChange={(e) => setSelectedEmt(e.target.value)}
              disabled={busy}
            >
              <option value="">Select EMT…</option>
              {emts.map((e) => (
                <option key={e.user_id} value={e.user_id}>
                  {e.full_name ?? e.user_id.slice(0, 8)}{e.badge_no ? ` · ${e.badge_no}` : ""}
                </option>
              ))}
            </select>
            <Button
              size="sm" variant="outline" disabled={busy || !selectedEmt || selectedEmt === s.assigned_emt_id}
              onClick={() => onAssign(selectedEmt)}
            >
              <UserPlus className="h-3 w-3" />
              {s.assigned_emt_id ? "Reassign" : "Assign EMT"}
            </Button>
          </div>
        )}

        <Button size="sm" disabled={busy} onClick={onConvert}
          className="bg-neon text-[oklch(0.16_0.04_145)] hover:bg-neon/90">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
          Convert To Incident
        </Button>

        <Button size="sm" variant="outline" disabled={busy}
          onClick={() => onCall("scanner")}>
          <Phone className="h-3 w-3" /> Call Scanner
        </Button>
        <Button size="sm" variant="outline" disabled={busy}
          onClick={() => onCall("patient")}>
          <Phone className="h-3 w-3" /> Call Patient
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onDismiss}>
          <X className="h-3 w-3" /> Dismiss
        </Button>
      </div>

      {/* Collapsible details */}
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
        {showDetails ? "Hide details" : "Details"}
      </button>

      {showDetails && (
        <div className="mt-2 rounded-md border bg-background/40 p-3 space-y-2 text-xs">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Trigger</dt>
            <dd className="font-mono">{s.triggered_via ?? "—"}</dd>
            <dt className="text-muted-foreground">Session ID</dt>
            <dd className="font-mono truncate">{s.id}</dd>
            <dt className="text-muted-foreground">GPS</dt>
            <dd className="font-mono">
              {s.gps_lat != null && s.gps_lng != null
                ? `${s.gps_lat.toFixed(4)}, ${s.gps_lng.toFixed(4)}`
                : "—"}
            </dd>
            <dt className="text-muted-foreground">Location source</dt>
            <dd>{s.location_source ?? "—"}</dd>
            <dt className="text-muted-foreground">Assigned EMT</dt>
            <dd>{s.assigned_emt?.full_name ?? "—"}</dd>
            <dt className="text-muted-foreground">Scanner phone</dt>
            <dd className="font-mono">{maskPhone(scannerPhone)}</dd>
            <dt className="text-muted-foreground">Patient phone</dt>
            <dd className="font-mono">{maskPhone(patientPhone)}</dd>
            <dt className="text-muted-foreground">Primary contact</dt>
            <dd>
              {primaryContact
                ? <>{primaryContact.name}{primaryContact.relation ? ` (${primaryContact.relation})` : ""} · <span className="font-mono">{maskPhone(primaryContact.phone)}</span></>
                : "—"}
            </dd>
          </dl>

          {contacts.length > 1 && (
            <div className="flex items-center gap-2 pt-1">
              <Users className="h-3 w-3 text-muted-foreground" />
              <select
                className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs"
                value={selectedContact}
                onChange={(e) => setSelectedContact(e.target.value)}
                disabled={busy}
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.relation ? ` (${c.relation})` : ""} · {maskPhone(c.phone)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {demoMode && (
            <p className="text-[10px] text-muted-foreground">
              Demo mode: calls are logged + simulated; no real telephony.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ConfirmedIncidentCard({ inc }: { inc: any }) {
  const [showEmt, setShowEmt] = useState(false);
  const [showSos, setShowSos] = useState(false);
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs uppercase tracking-wider rounded-full border px-2 py-0.5 ${PRIORITY_COLOR[inc.priority ?? "medium"]}`}>{inc.priority ?? "med"}</span>
        <span className="text-xs uppercase text-muted-foreground">{inc.status}</span>
        {inc.registration_number && <span className="text-xs ml-auto font-mono">{inc.registration_number}</span>}
      </div>

      <div>
        <div className="text-base font-semibold leading-tight">{inc.patient?.full_name ?? "Unknown patient"}</div>
        <div className="text-sm text-muted-foreground">
          {inc.incident_type || "Incident"}
          {inc.recommended_department ? ` • ${inc.recommended_department}` : ""}
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-1 text-xs">
        <div className="flex gap-2"><dt className="text-muted-foreground">EMT:</dt><dd className="font-medium">{inc.emt?.full_name ?? "—"}</dd></div>
        <div className="flex gap-2"><dt className="text-muted-foreground">Hospital:</dt><dd className="font-medium">{inc.hospital_name ?? "—"}</dd></div>
        {inc.submitted_at && (
          <div className="flex gap-2 items-center text-muted-foreground"><Clock className="h-3 w-3" />{new Date(inc.submitted_at).toLocaleString()}</div>
        )}
      </dl>

      {inc.ai_summary_text && (
        <div className="rounded-lg bg-accent/40 p-2 text-xs">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">AI Summary</div>
          <p className="line-clamp-3">{inc.ai_summary_text}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="bg-neon text-[oklch(0.16_0.04_145)] hover:bg-neon/90">
          <Link to="/hospital/incident/$id" params={{ id: inc.id }}>
            Open Incident <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
        {inc.emt_audio_url && (
          <Button size="sm" variant="outline" onClick={() => setShowEmt((v) => !v)}>
            <Stethoscope className="h-3 w-3" /> {showEmt ? "Hide" : "Play"} EMT Audio
          </Button>
        )}
        {inc.sos_audio_url && (
          <Button size="sm" variant="outline" onClick={() => setShowSos((v) => !v)}>
            <Siren className="h-3 w-3" /> {showSos ? "Hide" : "Play"} Patient SOS
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link to="/hospital/incident/$id" params={{ id: inc.id }}>
            View Timeline
          </Link>
        </Button>
      </div>

      {showEmt && inc.emt_audio_url && (
        <audio controls controlsList="nodownload" src={inc.emt_audio_url} className="w-full" />
      )}
      {showSos && inc.sos_audio_url && (
        <audio controls controlsList="nodownload" src={inc.sos_audio_url} className="w-full" />
      )}
    </div>
  );
}
