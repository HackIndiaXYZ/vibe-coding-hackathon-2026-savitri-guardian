import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuthReady } from "@/lib/auth-context";

import { AppShell } from "@/components/AppShell";
import { EmergencyTimeline } from "@/components/EmergencyTimeline";
import { Button } from "@/components/ui/button";
import { getHospitalIncident, acceptIncident, markPatientArrived } from "@/lib/hospital.functions";
import { logVoiceNotePlayed } from "@/lib/timeline.functions";
import { ChevronLeft, Check, MapPin, Siren, Stethoscope, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { RouteError, RouteNotFound } from "@/components/RouteBoundary";

export const Route = createFileRoute("/hospital/incident/$id")({
  head: () => ({ meta: [{ title: "Incident — Savitri" }] }),
  component: IncidentPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="hospital" />,
  notFoundComponent: () => <RouteNotFound scope="hospital" />,
});

function IncidentPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const get = useServerFn(getHospitalIncident);
  const accept = useServerFn(acceptIncident);
  const arrive = useServerFn(markPatientArrived);
  const logPlayed = useServerFn(logVoiceNotePlayed);
  const qc = useQueryClient();
  const ready = useAuthReady();
  const { data, isLoading } = useQuery({
    queryKey: ["hosp-inc", id],
    queryFn: () => get({ data: { incident_id: id } }),
    refetchInterval: 5000,
    enabled: ready,
  });

  const accMut = useMutation({
    mutationFn: () => accept({ data: { incident_id: id } }),
    onSuccess: (r: any) => { toast.success(`Accepted • ${r.registration_number}`); qc.invalidateQueries({ queryKey: ["hosp-inc", id] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const arrMut = useMutation({
    mutationFn: () => arrive({ data: { incident_id: id } }),
    onSuccess: () => { toast.success("Patient marked as arrived"); navigate({ to: "/hospital" }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !data) return <AppShell requireRole="hospital"><div>Loading…</div></AppShell>;
  const inc = data.incident as any;
  const p = data.patient as any;
  const med = data.medical as any;
  const sosRecordings = (data as any).sos_recordings ?? [];
  const emtRec = (data as any).emt_recording ?? null;

  return (
    <AppShell requireRole="hospital">
      <Link to="/hospital" className="inline-flex items-center text-sm text-muted-foreground mb-3"><ChevronLeft className="h-4 w-4" />Back</Link>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase rounded-full bg-accent text-accent-foreground px-2 py-0.5">{inc.priority}</span>
          <span className="text-xs uppercase text-muted-foreground">{inc.status}</span>
        </div>
        <div className="text-xl font-bold mt-2">{inc.incident_type || "Incident"}</div>
        <div className="text-sm text-muted-foreground">{inc.recommended_department}</div>
        {inc.registration_number && <div className="mt-3 inline-flex items-center gap-1 rounded-lg bg-neon/15 text-neon px-2 py-1 text-sm font-medium">Reg {inc.registration_number}</div>}
      </div>

      <section className="mt-5 rounded-2xl border p-4">
        <div className="text-xs uppercase text-muted-foreground">Patient</div>
        <div className="font-semibold">{p?.full_name}</div>
        <div className="text-sm text-muted-foreground">{p?.phone}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Info label="Blood group" value={med?.blood_group} />
          <Info label="DOB" value={med?.date_of_birth} />
          <Info label="Allergies" value={(med?.allergies ?? []).join(", ") || "—"} full />
          <Info label="Conditions" value={(med?.conditions ?? []).join(", ") || "—"} full />
          <Info label="Insurance" value={med?.insurance_provider || "—"} full />
        </div>
      </section>

      {/* SECTION 1 — Patient SOS Summary */}
      <section className="mt-5 rounded-2xl border border-critical/40 bg-critical/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Siren className="h-4 w-4 text-[var(--critical)]" />
          Patient SOS Summary
        </div>
        {sosRecordings.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No patient SOS recording on file.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {sosRecordings.map((r: any) => (
              <RecordingBlock
                key={r.id}
                timestamp={r.opened_at}
                voice_note_url={r.voice_note_url}
                transcript={null}
                ai_summary={r.ai_summary}
                onPlay={() => logPlayed({ data: { session_id: r.id, source: "sos", listener_role: "hospital" } }).catch(() => {})}
              />
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2 — EMT Assessment Summary */}
      <section className="mt-5 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Stethoscope className="h-4 w-4 text-primary" />
            EMT Assessment
          </div>
          {inc.ai_summary?.confidence && <ConfidencePill c={inc.ai_summary.confidence} />}
        </div>
        {!emtRec && !inc.observations && !inc.transcript ? (
          <p className="mt-2 text-sm text-muted-foreground">EMT has not submitted an assessment yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {/* Structured assessment */}
            <div className="rounded-xl border bg-card p-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <div><span className="text-xs text-muted-foreground">Severity</span><div className="font-medium uppercase">{inc.priority || "—"}</div></div>
              <div><span className="text-xs text-muted-foreground">Type</span><div className="font-medium">{inc.incident_type || "—"}</div></div>
              <div className="col-span-2"><span className="text-xs text-muted-foreground">Department</span><div className="font-medium">{inc.recommended_department || "—"}</div></div>
              {inc.observations && (
                <div className="col-span-2"><span className="text-xs text-muted-foreground">Observations</span><p className="text-sm">{inc.observations}</p></div>
              )}
            </div>
            <RecordingBlock
              timestamp={emtRec?.submitted_at ?? inc.submitted_at}
              voice_note_url={emtRec?.voice_note_url ?? null}
              transcript={inc.transcript}
              ai_summary={inc.observations}
              onPlay={() => logPlayed({ data: { session_id: inc.session_id, source: "emt", listener_role: "hospital" } }).catch(() => {})}
            />
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-3">
        {inc.status === "pending" && (
          <Button onClick={() => accMut.mutate()} disabled={accMut.isPending} className="h-14 bg-neon hover:bg-neon/90 text-[oklch(0.16_0.04_145)] font-semibold">
            <Check /> Accept & assign registration
          </Button>
        )}
        {inc.status === "accepted" && (
          <Button onClick={() => arrMut.mutate()} disabled={arrMut.isPending} className="h-14 bg-neon hover:bg-neon/90 text-[oklch(0.16_0.04_145)] font-semibold">
            <MapPin /> Mark patient arrived
          </Button>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-3">Timeline</h2>
        <EmergencyTimeline sessionId={inc.session_id} />
      </section>
    </AppShell>
  );
}

function RecordingBlock({
  timestamp, voice_note_url, transcript, ai_summary, onPlay,
}: {
  timestamp: string | null;
  voice_note_url: string | null;
  transcript: string | null;
  ai_summary: any;
  onPlay: () => void;
}) {
  const [played, setPlayed] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const summaryText = typeof ai_summary === "string"
    ? ai_summary
    : ai_summary?.observations ?? null;
  return (
    <div className="space-y-2">
      {timestamp && <div className="text-xs text-muted-foreground">{new Date(timestamp).toLocaleString()}</div>}
      {voice_note_url ? (
        <>
          <audio
            controls controlsList="nodownload" src={voice_note_url} className="w-full"
            onPlay={() => { if (!played) { setPlayed(true); onPlay(); } }}
          >
            <track kind="captions" />
          </audio>
          <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">▶ Listen to original report</div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground">No audio recorded.</div>
      )}
      {summaryText && (
        <div className="rounded-lg bg-accent/40 p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">AI summary</div>
          <p>{summaryText}</p>
        </div>
      )}
      {transcript && (
        <div className="space-y-2">
          <Button size="sm" variant="outline" onClick={() => setShowTranscript((v) => !v)}>
            {showTranscript ? "Hide transcript" : "View transcript"}
          </Button>
          {showTranscript && (
            <p className="rounded-md border bg-card p-2 text-sm whitespace-pre-wrap">{transcript}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value || "—"}</div>
    </div>
  );
}

function ConfidencePill({ c }: { c: string }) {
  const conf = (c === "high" || c === "medium" || c === "low") ? c : "medium";
  const styles = conf === "high" ? "bg-neon/20 text-[oklch(0.16_0.04_145)] border-neon/40"
    : conf === "medium" ? "bg-accent text-accent-foreground border-transparent"
    : "bg-warn/15 text-[var(--warn)] border-warn/40";
  const label = conf === "high" ? "High Confidence" : conf === "medium" ? "Medium Confidence" : "Low Confidence";
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${styles}`}><ShieldCheck className="h-3 w-3" />{label}</span>;
}
