import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { resolveContactNotification } from "@/lib/notification.functions";
import { logContactVoiceNotePlayed } from "@/lib/timeline.functions";
import { MapPin, Mic, Phone, Siren, Sparkles, Volume2, Check, ShieldCheck } from "lucide-react";

function ContactConfidencePill({ c }: { c: string }) {
  const conf = (c === "high" || c === "medium" || c === "low") ? c : "medium";
  const styles = conf === "high" ? "bg-neon/20 text-[oklch(0.16_0.04_145)] border-neon/40"
    : conf === "medium" ? "bg-accent text-accent-foreground border-transparent"
    : "bg-warn/15 text-[var(--warn)] border-warn/40";
  const label = conf === "high" ? "High Confidence" : conf === "medium" ? "Medium Confidence" : "Low Confidence";
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${styles}`}><ShieldCheck className="h-3 w-3" />{label}</span>;
}

import { RouteError, RouteNotFound } from "@/components/RouteBoundary";

export const Route = createFileRoute("/n/$token")({
  loader: async ({ params }) => {
    try {
      return await resolveContactNotification({ data: { token: params.token } });
    } catch {
      return { contact: null, patient: null, incident: null, sos: null, timeline: [] };
    }
  },
  head: () => ({ meta: [{ title: "Emergency alert — Savitri" }] }),
  component: PublicNotifyPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="contact" />,
  notFoundComponent: () => <RouteNotFound scope="contact" />,
});

function PublicNotifyPage() {
  const params = Route.useParams();
  const initial = Route.useLoaderData() as any;
  const resolve = useServerFn(resolveContactNotification);
  // Real-time-ish updates: poll every 4s so the page reflects "recording uploaded"
  // and "AI summary generated" without a manual refresh.
  const { data } = useQuery({
    queryKey: ["contact-notify", params.token],
    queryFn: () => resolve({ data: { token: params.token } }),
    initialData: initial,
    refetchInterval: (q) => {
      const s: any = q.state.data;
      return s?.sos && s.sos.recording_status !== "summarized" ? 4000 : 15000;
    },
  });

  const { contact, patient, incident, sos, timeline, report } = (data ?? initial) as any;

  if (!contact) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center bg-background">
        <div>
          <div className="text-2xl font-bold">Link invalid</div>
          <p className="text-muted-foreground mt-2">This emergency notification link is no longer valid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-md mx-auto space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full bg-critical px-3 py-1 text-xs font-semibold text-white">
          <Siren className="size-3" /> EMERGENCY ALERT
        </div>
        <div>
          <h1 className="text-3xl font-bold">Hi {contact.name}</h1>
          <p className="text-muted-foreground mt-1">
            You're listed as an emergency contact{contact.relation ? ` (${contact.relation})` : ""} for{" "}
            <strong>{patient?.full_name}</strong>.
          </p>
        </div>

        <EmergencyProgressCard timeline={timeline ?? []} incident={incident} />

        {report && <ReporterInfoCard report={report} />}

        {incident && <IncidentSummaryCard incident={incident} />}

        {sos && (
          <section aria-labelledby="sos-heading" className="rounded-2xl border border-critical/40 bg-critical/5 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Siren className="size-5 text-[var(--critical)]" />
              <h2 id="sos-heading" className="text-lg font-bold">SOS triggered</h2>
              {sos.silent && (
                <span className="ml-auto text-[10px] uppercase tracking-wide rounded-full bg-muted px-2 py-0.5">silent</span>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              Triggered {new Date(sos.opened_at).toLocaleString()}
            </div>

            <section className="rounded-xl border bg-background p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4" /> Location
                {sos.location_source === "demo" && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Demo Location
                  </span>
                )}
              </div>
              {sos.gps_lat != null && sos.gps_lng != null ? (
                <>
                  <div className="text-sm text-muted-foreground">
                    Captured {new Date(sos.opened_at).toLocaleString()}
                  </div>
                  <div className="text-sm font-medium">
                    {sos.gps_lat.toFixed(5)}, {sos.gps_lng.toFixed(5)}
                    {sos.gps_accuracy ? ` · ±${Math.round(sos.gps_accuracy)}m` : ""}
                  </div>
                  <a href={sos.maps_url} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground p-4 min-h-[64px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <MapPin className="size-5" /> Open in Google Maps
                  </a>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Patient location could not be captured.</p>
              )}
            </section>

            {patient?.phone && (
              <a href={`tel:${patient.phone}`}
                className="flex items-center gap-3 rounded-xl border p-4 min-h-[64px] font-semibold hover:bg-accent/40">
                <Phone className="size-6" /> Call {patient.full_name?.split(" ")[0] ?? "patient"}
              </a>
            )}

            <RecordingBlock sos={sos} token={params.token} />
          </section>
        )}

        {!incident && !sos && (
          <p className="text-muted-foreground">An emergency session was started. Updates will appear here.</p>
        )}

        {timeline?.length ? <TimelineBlock events={timeline} /> : null}
      </div>
    </div>
  );
}

function IncidentSummaryCard({ incident }: { incident: any }) {
  const summaryText = typeof incident.ai_summary === "string"
    ? incident.ai_summary
    : incident.ai_summary?.observations ?? incident.observations ?? null;
  const priColor =
    incident.priority === "critical" ? "bg-critical/15 text-[var(--critical)] border-critical/40"
    : incident.priority === "high" ? "bg-warn/15 text-[var(--warn)] border-warn/40"
    : "bg-accent text-accent-foreground border-transparent";
  return (
    <section aria-label="Incident summary" className="rounded-2xl border-2 border-primary/30 bg-card p-5 space-y-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Incident Summary</div>
      <div className="flex flex-wrap items-center gap-2">
        {incident.priority && (
          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase ${priColor}`}>
            {incident.priority}
          </span>
        )}
        <span className="inline-flex rounded-full border bg-muted px-2.5 py-0.5 text-xs font-semibold uppercase">
          {incident.status}
        </span>
        {incident.ai_summary?.confidence && <ContactConfidencePill c={incident.ai_summary.confidence} />}
      </div>
      {incident.incident_type && (
        <div className="text-base font-semibold leading-tight">{incident.incident_type}</div>
      )}
      {summaryText && (
        <p className="text-sm text-foreground/80">{summaryText}</p>
      )}
      <dl className="grid grid-cols-1 gap-1 text-sm pt-1">
        {incident.hospitals?.name && (
          <div className="flex gap-2"><dt className="text-muted-foreground">Hospital:</dt>
            <dd className="font-medium">{incident.hospitals.name}{incident.hospitals.city ? `, ${incident.hospitals.city}` : ""}</dd></div>
        )}
        {incident.recommended_department && (
          <div className="flex gap-2"><dt className="text-muted-foreground">Department:</dt>
            <dd className="font-medium">{incident.recommended_department}</dd></div>
        )}
        {incident.registration_number && (
          <div className="flex gap-2"><dt className="text-muted-foreground">Registration:</dt>
            <dd className="font-semibold">{incident.registration_number}</dd></div>
        )}
        {incident.submitted_at && (
          <div className="flex gap-2"><dt className="text-muted-foreground">Submitted:</dt>
            <dd>{new Date(incident.submitted_at).toLocaleString()}</dd></div>
        )}
      </dl>
      {incident.hospitals?.phone && (
        <a href={`tel:${incident.hospitals.phone}`} className="inline-flex mt-1 rounded-lg bg-neon text-[oklch(0.16_0.04_145)] px-4 py-2 font-medium text-sm">Call hospital</a>
      )}
    </section>
  );
}

function RecordingBlock({ sos, token }: { sos: any; token: string }) {
  const status = sos.recording_status as string | null;
  const summarizing = status === "uploaded";
  const pending = status === "pending" || !status;
  const ready = status === "summarized" && sos.voice_note_url;
  const logPlayed = useServerFn(logContactVoiceNotePlayed);
  const [played, setPlayed] = useState(false);
  const onPlay = () => {
    if (played) return;
    setPlayed(true);
    logPlayed({ data: { token, session_id: sos.id } }).catch(() => {});
  };

  return (
    <div className="rounded-xl border bg-background p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Mic className="size-4" /> Voice recording
        {pending && <span className="ml-auto text-xs font-normal text-muted-foreground inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-critical animate-pulse" /> Recording in progress…
        </span>}
        {summarizing && <span className="ml-auto text-xs font-normal text-muted-foreground">Generating summary…</span>}
      </div>

      {ready && (
        <>
          <audio controls controlsList="nodownload" src={sos.voice_note_url} className="w-full" onPlay={onPlay}>
            <track kind="captions" />
          </audio>
          {sos.ai_summary && (
            <div className="rounded-lg bg-accent/40 p-3 text-sm">
              <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                <Sparkles className="size-3" /> AI summary
              </div>
              <p>{sos.ai_summary}</p>
            </div>
          )}
        </>
      )}

      {!ready && summarizing && sos.voice_note_url && (
        <audio controls controlsList="nodownload" src={sos.voice_note_url} className="w-full" onPlay={onPlay}>
          <track kind="captions" />
        </audio>
      )}

      {pending && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Volume2 className="size-3" /> This page will update automatically as soon as the recording finishes.
        </p>
      )}
    </div>
  );
}


const TIMELINE_LABELS: Record<string, string> = {
  QR_SCANNED: "Emergency Profile Accessed",
  EMERGENCY_SESSION_CREATED: "Emergency Session Created",
  CONTACT_NOTIFIED: "Emergency Contacts Notified",
  REPORT_SUBMITTED: "Incident Report Submitted",
  HOSPITAL_ALERTED: "Hospital Alerted",
  HOSPITAL_ACCEPTED: "Hospital Accepted",
  PATIENT_ARRIVED: "Patient Arrived",
  SOS_TRIGGERED: "SOS Triggered",
  LOCATION_CAPTURED: "Location Captured",
  LOCATION_CAPTURE_FAILED: "Location Unavailable",
  VOICE_RECORDING_STARTED: "Voice Recording Started",
  VOICE_RECORDING_UPLOADED: "Voice Recording Uploaded",
  SOS_NOTIFICATION_SENT: "Contacts Notified",
};

function TimelineBlock({ events }: { events: Array<{ id: string; action: string; created_at: string; metadata: any }> }) {
  const visible = events.filter((e) => TIMELINE_LABELS[e.action]);
  if (!visible.length) return null;
  return (
    <section className="rounded-2xl border p-4">
      <div className="text-sm font-semibold mb-3">Timeline</div>
      <ol className="space-y-3">
        {visible.map((e, i) => (
          <li key={e.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="h-7 w-7 rounded-full bg-neon text-[oklch(0.16_0.04_145)] grid place-items-center"><Check className="h-3.5 w-3.5" /></div>
              {i < visible.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
            </div>
            <div className="pb-2">
              <div className="text-sm font-medium">{TIMELINE_LABELS[e.action]}</div>
              <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ReporterInfoCard({ report }: { report: { reporter_label: string; confidence: "Public Report" | "Patient Report" | "EMT Confirmed"; time_reported: string; demo_mode: boolean; location_source: "device" | "demo" | null } }) {
  const confColor =
    report.confidence === "EMT Confirmed"
      ? "bg-neon/20 text-[oklch(0.16_0.04_145)] border-neon/40"
      : report.confidence === "Patient Report"
        ? "bg-primary/15 text-primary border-primary/40"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40";
  return (
    <section aria-label="Reporter info" className="rounded-2xl border p-4 space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Emergency Report Submitted</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-muted">
          Reporter: {report.reporter_label}
        </span>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${confColor}`}>
          {report.confidence}
        </span>
        {report.location_source === "demo" && (
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            Demo Location
          </span>
        )}
        {report.demo_mode && (
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Demo Mode
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        Time reported: {new Date(report.time_reported).toLocaleString()}
      </div>
    </section>
  );
}

const STATUS_FLOW: Array<{ label: string; actions: string[] }> = [
  { label: "SOS Triggered", actions: ["SOS_TRIGGERED", "PUBLIC_EMERGENCY_REPORTED", "PATIENT_USER_EMERGENCY_REPORTED", "EMERGENCY_SESSION_CREATED"] },
  { label: "EMT Assigned", actions: ["EMT_ASSIGNED", "QR_SCANNED"] },
  { label: "EMT Assessment Complete", actions: ["REPORT_SUBMITTED"] },
  { label: "Hospital Alerted", actions: ["HOSPITAL_ALERTED"] },
  { label: "Hospital Accepted", actions: ["HOSPITAL_ACCEPTED"] },
  { label: "Patient Arrived At Hospital", actions: ["PATIENT_ARRIVED"] },
];

function severityFromPriority(p?: string | null) {
  const pri = (p ?? "").toLowerCase();
  if (pri === "critical") return { label: "Critical", classes: "bg-critical/15 text-[var(--critical)] border-critical/40" };
  if (pri === "high") return { label: "Serious", classes: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40" };
  if (pri === "medium") return { label: "Moderate", classes: "bg-warn/15 text-[var(--warn)] border-warn/40" };
  if (pri === "low") return { label: "Stable", classes: "bg-neon/20 text-[oklch(0.16_0.04_145)] border-neon/40" };
  return { label: "Assessing", classes: "bg-muted text-foreground border-transparent" };
}

function EmergencyProgressCard({ timeline, incident }: { timeline: Array<{ action: string; created_at: string; metadata?: any }>; incident: any }) {
  if (!timeline.length && !incident) return null;

  const latestByAction = new Map<string, string>();
  for (const e of timeline) {
    if (!latestByAction.has(e.action)) latestByAction.set(e.action, e.created_at);
  }

  // Find the latest reached status by scanning the workflow in order.
  let latestLabel = "Awaiting first update";
  let latestAt: string | null = null;
  for (const step of STATUS_FLOW) {
    const at = step.actions.map((a) => latestByAction.get(a)).find(Boolean);
    if (at) { latestLabel = step.label; latestAt = at; }
  }

  const sev = severityFromPriority(incident?.priority);
  const lastUpdated = timeline.length ? timeline[timeline.length - 1].created_at : latestAt;

  // Short situation summary derived from incident data — no event history.
  const summary =
    (typeof incident?.ai_summary === "string" && incident.ai_summary) ||
    incident?.ai_summary?.observations ||
    incident?.observations ||
    (incident?.incident_type ? `${incident.incident_type} — ${latestLabel.toLowerCase()}.` : null) ||
    `Emergency is in progress. Current status: ${latestLabel.toLowerCase()}.`;

  return (
    <section aria-label="Current status" className="rounded-2xl border-2 border-neon/30 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Current Status</div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${sev.classes}`}>
          {sev.label}
        </span>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Latest Status</div>
        <div className="text-xl font-bold leading-tight mt-1">{latestLabel}</div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Summary</div>
        <p className="text-sm text-foreground/85 mt-1">{summary}</p>
      </div>

      {lastUpdated && (
        <div className="text-[11px] text-muted-foreground border-t pt-2">
          Last Updated · {new Date(lastUpdated).toLocaleString()}
        </div>
      )}
    </section>
  );
}


