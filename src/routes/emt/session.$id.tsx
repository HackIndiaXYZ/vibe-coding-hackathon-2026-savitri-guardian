import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthReady } from "@/lib/auth-context";

import { AppShell } from "@/components/AppShell";
import { RouteError, RouteNotFound } from "@/components/RouteBoundary";
import { EmergencyTimeline } from "@/components/EmergencyTimeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  getEmtSessionDetails,
  analyzeIncident,
  submitIncident,
  attachVoiceNote,
  recordEmtValidationEvent,
} from "@/lib/emt.functions";
import { logVoiceNotePlayed } from "@/lib/timeline.functions";
import { ChevronLeft, Mic, Square, Send, ChevronDown, Loader2, Sparkles, Siren, AlertTriangle, ShieldCheck, Stethoscope } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/emt/session/$id")({
  head: () => ({ meta: [{ title: "Session — Savitri" }] }),
  component: SessionPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="emt" />,
  notFoundComponent: () => <RouteNotFound scope="emt" />,
});

type Priority = "low" | "medium" | "high" | "critical";
type RecState = "idle" | "recording" | "uploading" | "transcribing" | "summarizing" | "needs_transcript" | "summary_failed" | "complete";

type Confidence = "high" | "medium" | "low";

const MIN_TRANSCRIPT_LEN = 20;

function validateSummaryFields(s: { observations: string; incident_type: string; priority: string; recommended_department: string }) {
  const failed: string[] = [];
  if (!s.observations?.trim()) failed.push("observations");
  if (!s.incident_type?.trim()) failed.push("incident_type");
  if (!s.priority?.trim()) failed.push("priority");
  if (!s.recommended_department?.trim()) failed.push("recommended_department");
  return failed;
}

function SessionPage() {
  const { id } = Route.useParams();
  const get = useServerFn(getEmtSessionDetails);
  const analyze = useServerFn(analyzeIncident);
  const submit = useServerFn(submitIncident);
  const attach = useServerFn(attachVoiceNote);
  const recordAudit = useServerFn(recordEmtValidationEvent);
  const logPlayed = useServerFn(logVoiceNotePlayed);
  const qc = useQueryClient();
  const ready = useAuthReady();
  const { data, isLoading } = useQuery({
    queryKey: ["emt-session", id],
    queryFn: () => get({ data: { session_id: id } }),
    enabled: ready,
  });

  const [transcript, setTranscript] = useState("");
  const [observations, setObservations] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [incidentType, setIncidentType] = useState("");
  const [department, setDepartment] = useState("");
  const [hospitalId, setHospitalId] = useState("");

  const [recState, setRecState] = useState<RecState>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [transcriptFailed, setTranscriptFailed] = useState(false);
  const [summaryFailedFields, setSummaryFailedFields] = useState<string[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recogRef = useRef<any>(null);
  const wantRecogRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef("");
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  useEffect(() => {
    if (data?.incident) {
      setTranscript(data.incident.transcript ?? "");
      setObservations(data.incident.observations ?? "");
      setPriority((data.incident.priority as Priority) ?? "medium");
      setIncidentType(data.incident.incident_type ?? "");
      setDepartment(data.incident.recommended_department ?? "");
      if (data.incident.hospital_id) setHospitalId(data.incident.hospital_id);
    }
  }, [data?.incident]);

  useEffect(() => {
    if (!hospitalId && data?.hospitals?.length) setHospitalId(data.hospitals[0].id);
  }, [data?.hospitals, hospitalId]);

  useEffect(() => {
    return () => {
      try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try { recogRef.current?.stop(); } catch {}
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSpeech = () => {
    const SR =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e: any) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
      }
      if (final) setTranscript((t) => (t + " " + final).trim());
    };
    r.onerror = () => {};
    r.onend = () => { if (wantRecogRef.current) { try { r.start(); } catch {} } };
    recogRef.current = r;
    wantRecogRef.current = true;
    try { r.start(); } catch {}
  };

  const stopSpeech = () => {
    wantRecogRef.current = false;
    try { recogRef.current?.stop(); } catch {}
    recogRef.current = null;
  };

  const startRecording = async () => {
    if (recState !== "idle" && recState !== "complete") return;
    if (!navigator.mediaDevices?.getUserMedia) { toast.error("Microphone not available."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        void uploadBlob(blob, mime || "audio/webm");
      };
      streamRef.current = stream;
      recorderRef.current = rec;
      rec.start(250);
      setRecState("recording");
      setElapsed(0);
      if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      startSpeech();
    } catch (err: any) {
      const name = err?.name;
      if (name === "NotAllowedError") toast.error("Microphone blocked.");
      else if (name === "NotFoundError") toast.error("No microphone found.");
      else if (name === "NotReadableError") toast.error("Microphone in use.");
      else toast.error(err?.message ?? "Could not start recording.");
    }
  };

  const stopRecording = () => {
    if (recState !== "recording") return;
    stopSpeech();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { recorderRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecState("uploading");
  };

  const resetRecording = () => {
    if (audioUrl) { URL.revokeObjectURL(audioUrl); }
    setAudioUrl(null);
    setTranscript("");
    setObservations("");
    setIncidentType("");
    setDepartment("");
    setRecState("idle");
    setReviewOpen(false);
    setManualMode(false);
    setTranscriptFailed(false);
    setSummaryFailedFields([]);
  };

  const incidentId: string | null = (data?.incident as any)?.id ?? null;

  const logValidation = (action: "TRANSCRIPT_VALIDATION_FAILED" | "AI_SUMMARY_VALIDATION_FAILED" | "MANUAL_INCIDENT_ASSESSMENT", metadata: Record<string, any>) => {
    recordAudit({ data: { session_id: id, incident_id: incidentId, action, metadata } }).catch(() => {});
  };

  const uploadBlob = async (blob: Blob, type: string) => {
    try {
      const { data: ures } = await supabase.auth.getUser();
      const uid = ures.user?.id;
      if (!uid) throw new Error("Not signed in");
      const ext = type.includes("mp4") ? "m4a" : "webm";
      const path = `${uid}/${id}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("voice-notes").upload(path, blob, { contentType: type, upsert: false });
      if (up.error) throw up.error;
      await attach({ data: { session_id: id, storage_path: path } });
      const local = URL.createObjectURL(blob);
      setAudioUrl(local);
      setRecState("transcribing");
      // Give SpeechRecognition a short window to flush final results before summary generation.
      window.setTimeout(() => { void autoSummarize(); }, 600);
    } catch (e: any) {
      setRecState("idle");
      toast.error(e?.message ?? "Upload failed");
    }
  };

  const autoSummarize = async () => {
    const t = transcriptRef.current.trim();
    // P0-1: Transcript validation gate
    if (!t || t.length <= MIN_TRANSCRIPT_LEN) {
      setTranscriptFailed(true);
      setSummaryFailedFields([]);
      setRecState("needs_transcript");
      logValidation("TRANSCRIPT_VALIDATION_FAILED", { transcript_length: t.length });
      toast.error("⚠️ Could not understand recording. Re-record or type the summary manually.");
      return;
    }
    setTranscriptFailed(false);
    setRecState("summarizing");
    try {
      const r: any = await analyze({ data: { transcript: t, observations: observations || null } });
      const next = {
        observations: typeof r.observations === "string" ? r.observations.trim() : "",
        incident_type: typeof r.incident_type === "string" ? r.incident_type.trim() : "",
        priority: typeof r.priority === "string" ? r.priority.trim() : "",
        recommended_department: typeof r.recommended_department === "string" ? r.recommended_department.trim() : "",
      };
      // P0-2: AI summary validation gate
      const failed = validateSummaryFields(next);
      if (failed.length) {
        // Still surface partial values so the EMT can edit.
        if (next.observations) setObservations(next.observations);
        if (next.incident_type) setIncidentType(next.incident_type);
        if (next.priority) setPriority(next.priority as Priority);
        if (next.recommended_department) setDepartment(next.recommended_department);
        setSummaryFailedFields(failed);
        setRecState("summary_failed");
        logValidation("AI_SUMMARY_VALIDATION_FAILED", { failed_fields: failed });
        toast.error(`⚠️ Summary generation failed (${failed.join(", ")}). Re-generate, edit manually, or re-record.`);
        return;
      }
      setObservations(next.observations);
      setIncidentType(next.incident_type);
      setPriority(next.priority as Priority);
      setDepartment(next.recommended_department);
      setSummaryFailedFields([]);
      setRecState("complete");
      // P0-3: Review modal opens ONLY when both gates pass
      setReviewOpen(true);
    } catch (e: any) {
      setSummaryFailedFields(["observations", "incident_type", "priority", "recommended_department"]);
      setRecState("summary_failed");
      logValidation("AI_SUMMARY_VALIDATION_FAILED", { error: String(e?.message ?? e) });
      toast.error(`AI summary failed: ${e?.message ?? "unknown"}`);
    }
  };

  // Confidence computation
  const summaryFields = { observations, incident_type: incidentType, priority, recommended_department: department };
  const summaryGatePass = validateSummaryFields(summaryFields).length === 0;
  const transcriptGatePass = manualMode || (transcript.trim().length > MIN_TRANSCRIPT_LEN);
  const canSubmit = !!hospitalId && summaryGatePass && transcriptGatePass;
  const disabledReason = !hospitalId ? "Select a destination hospital"
    : !transcriptGatePass ? "Cannot submit: transcript unavailable"
    : !summaryGatePass ? `Cannot submit: missing ${validateSummaryFields(summaryFields).join(", ")}`
    : null;

  const confidence: Confidence = manualMode
    ? "low"
    : (recState === "complete" && transcriptGatePass && summaryGatePass && summaryFailedFields.length === 0)
      ? "high"
      : (summaryGatePass && transcriptGatePass) ? "medium" : "low";

  const send = useMutation({
    mutationFn: () => {
      if (manualMode) {
        logValidation("MANUAL_INCIDENT_ASSESSMENT", { fields: summaryFields });
      }
      return submit({
        data: {
          session_id: id, patient_id: data!.patient!.id, transcript, observations: observations || null,
          incident_type: incidentType || null, priority, recommended_department: department || null,
          ai_summary: { priority, incident_type: incidentType, observations, recommended_department: department, confidence },
          hospital_id: hospitalId,
          submission_mode: manualMode ? "manual" : "ai",
          confidence,
        },
      });
    },
    onSuccess: () => {
      toast.success("Incident submitted — hospital is the owner");
      setReviewOpen(false);
      qc.invalidateQueries({ queryKey: ["emt-session", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !data) return <AppShell requireRole="emt"><div>Loading…</div></AppShell>;
  const p = data.patient as any;
  const med = data.medical as any;
  const sosRecordings = (data as any).sos_recordings ?? [];
  const critical: string[] = [];
  if (med?.blood_group) critical.push(`Blood ${med.blood_group}`);
  if (med?.allergies?.length) critical.push(`Allergies: ${med.allergies.join(", ")}`);
  if (med?.conditions?.length) critical.push(`Conditions: ${med.conditions.join(", ")}`);

  return (
    <AppShell requireRole="emt">
      <Link to="/emt" className="inline-flex items-center text-sm text-muted-foreground mb-3">
        <ChevronLeft className="h-4 w-4" />Back
      </Link>

      <section className="rounded-2xl border bg-card p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Patient</div>
        <div className="text-2xl font-bold leading-tight">{p?.full_name ?? "—"}</div>
        {p?.phone && <div className="text-sm text-muted-foreground">{p.phone}</div>}
        {critical.length > 0 && (
          <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-destructive font-semibold mb-1">Critical</div>
            <ul className="space-y-0.5">{critical.map((c) => <li key={c} className="font-medium">{c}</li>)}</ul>
          </div>
        )}
        {med?.insurance_provider && (
          <div className="mt-2 text-xs text-muted-foreground">
            Insurance: {med.insurance_provider} {med.insurance_policy_no ? `• ${med.insurance_policy_no}` : ""}
          </div>
        )}
      </section>

      {/* Patient SOS recordings (playback only) */}
      {sosRecordings.length > 0 && (
        <section className="mt-4 rounded-2xl border border-critical/40 bg-critical/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Siren className="h-4 w-4 text-[var(--critical)]" />
            Patient SOS Voice Note{sosRecordings.length > 1 ? "s" : ""}
          </div>
          <div className="mt-3 space-y-3">
            {sosRecordings.map((r: any) => (
              <SosPlayback
                key={r.id}
                rec={r}
                onPlay={() => logPlayed({ data: { session_id: r.id, source: "sos", listener_role: "emt" } }).catch(() => {})}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-4">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Destination hospital</Label>
        <select
          value={hospitalId}
          onChange={(e) => setHospitalId(e.target.value)}
          className="w-full h-12 mt-1 rounded-lg border bg-card px-3 text-base"
        >
          <option value="">Select hospital…</option>
          {data.hospitals.map((h: any) => (
            <option key={h.id} value={h.id}>{h.name}{h.city ? ` • ${h.city}` : ""}</option>
          ))}
        </select>
      </section>

      <section className="mt-6 flex flex-col items-center">
        <RecordButton state={recState} elapsed={elapsed} onStart={startRecording} onStop={stopRecording} />
        <div className="mt-3 text-sm text-center min-h-[1.25rem] text-muted-foreground">
          {recState === "idle" && "Tap to record"}
          {recState === "recording" && `Recording… ${formatTime(elapsed)}`}
          {recState === "uploading" && "Uploading…"}
          {recState === "transcribing" && "Transcribing…"}
          {recState === "summarizing" && "Generating summary…"}
          {recState === "needs_transcript" && "Transcript needed"}
          {recState === "summary_failed" && "Summary failed"}
          {recState === "complete" && "Summary ready"}
        </div>
        {audioUrl && <audio controls src={audioUrl} className="mt-3 w-full max-w-sm" />}

        <Textarea
          rows={3}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Transcript (auto-filled while you speak, or type manually)…"
          className="mt-4"
        />

        {/* P0-1 / P0-2 failure banners */}
        {recState === "needs_transcript" && (
          <div className="w-full mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-[var(--warn)]">
              <AlertTriangle className="h-4 w-4" /> Could not understand recording.
            </div>
            <p className="text-xs text-muted-foreground mt-1">Transcript was empty or too short ({"≤"} {MIN_TRANSCRIPT_LEN} characters).</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button variant="outline" onClick={resetRecording} className="h-10">Re-record</Button>
              <Button variant="outline" onClick={() => { setManualMode(true); setRecState("idle"); }} className="h-10">Type Summary Manually</Button>
            </div>
          </div>
        )}
        {recState === "summary_failed" && (
          <div className="w-full mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-[var(--warn)]">
              <AlertTriangle className="h-4 w-4" /> Summary generation failed.
            </div>
            {summaryFailedFields.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Missing: {summaryFailedFields.join(", ")}</p>
            )}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <Button variant="outline" onClick={autoSummarize} disabled={!transcript.trim()} className="h-10 text-xs"><Sparkles className="h-3 w-3" /> Re-generate</Button>
              <Button variant="outline" onClick={() => setManualMode(true)} className="h-10 text-xs">Edit Manually</Button>
              <Button variant="outline" onClick={resetRecording} className="h-10 text-xs">Re-record</Button>
            </div>
          </div>
        )}
        {recState === "complete" && summaryGatePass && (
          <Button onClick={() => setReviewOpen(true)} variant="outline" className="w-full mt-2 h-11">
            <Sparkles /> Review summary
          </Button>
        )}
      </section>

      {/* P0-5 Manual Incident Assessment */}
      {manualMode && (
        <section className="mt-6 rounded-2xl border-2 border-primary/40 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Manual Incident Assessment</h2>
          </div>
          <p className="text-xs text-muted-foreground">AI is unavailable. Complete required fields manually.</p>
          <div>
            <Label>Severity</Label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {(["low", "medium", "high", "critical"] as Priority[]).map((pr) => (
                <button key={pr} type="button" onClick={() => setPriority(pr)}
                  className={`h-11 rounded-lg border text-sm font-medium capitalize ${priority === pr ? "bg-neon text-[oklch(0.16_0.04_145)] border-transparent" : "bg-card"}`}>
                  {pr}
                </button>
              ))}
            </div>
          </div>
          <div><Label>Incident type *</Label><Input value={incidentType} onChange={(e) => setIncidentType(e.target.value)} className="h-11 mt-1" placeholder="e.g. Cardiac Arrest" /></div>
          <div><Label>Recommended department *</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} className="h-11 mt-1" placeholder="e.g. Cardiology" /></div>
          <div><Label>Observations / Summary *</Label><Textarea rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} className="mt-1" /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={transcript} onChange={(e) => setTranscript(e.target.value)} className="mt-1" placeholder="Optional free-text notes" /></div>
        </section>
      )}

      {/* P1 Structured EMT Assessment card (preview) */}
      {summaryGatePass && (
        <StructuredAssessmentCard
          patientName={p?.full_name ?? "—"}
          severity={priority}
          incidentType={incidentType}
          department={department}
          observations={observations}
          confidence={confidence}
          timestamp={new Date().toISOString()}
        />
      )}

      <section className="mt-6">
        <Button
          onClick={() => send.mutate()}
          disabled={!canSubmit || send.isPending}
          className="w-full h-14 bg-neon hover:bg-neon/90 text-[oklch(0.16_0.04_145)] font-bold text-base disabled:opacity-50"
        >
          <Send /> {send.isPending ? "Submitting…" : data.incident?.submitted_at ? "Resend incident" : "Send to hospital"}
        </Button>
        {disabledReason ? (
          <p className="mt-2 text-xs text-[var(--warn)] text-center font-medium">{disabledReason}</p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground text-center">
            On submit, ownership transfers to the hospital and the session is confirmed.
          </p>
        )}
      </section>

      <section className="mt-6">
        <button type="button" onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm">
          <span className="font-medium">Advanced (type, department, priority, notes)</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-3">
            <div><Label>Incident type</Label><Input value={incidentType} onChange={(e) => setIncidentType(e.target.value)} className="h-11 mt-1" /></div>
            <div><Label>Recommended department</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} className="h-11 mt-1" /></div>
            <div>
              <Label>Priority</Label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {(["low", "medium", "high", "critical"] as Priority[]).map((pr) => (
                  <button key={pr} type="button" onClick={() => setPriority(pr)}
                    className={`h-11 rounded-lg border text-sm font-medium capitalize ${priority === pr ? "bg-neon text-[oklch(0.16_0.04_145)] border-transparent" : "bg-card"}`}>
                    {pr}
                  </button>
                ))}
              </div>
            </div>
            <div><Label>Additional observations</Label><Textarea rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} className="mt-1" /></div>
          </div>
        )}
      </section>

      <section className="mt-4 mb-6">
        <button type="button" onClick={() => setShowTimeline((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm">
          <span className="font-medium">Audit timeline</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showTimeline ? "rotate-180" : ""}`} />
        </button>
        {showTimeline && <div className="mt-3"><EmergencyTimeline sessionId={id} /></div>}
      </section>

      {/* Review modal */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Incident Summary Review</DialogTitle>
            <DialogDescription>Confirm or correct before sending to the hospital.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm"><span className="text-muted-foreground">Patient: </span><span className="font-semibold">{p?.full_name ?? "—"}</span></div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <div><span className="text-muted-foreground">Severity: </span><span className="font-semibold uppercase">{priority}</span></div>
              <div><span className="text-muted-foreground">Type: </span><span className="font-semibold">{incidentType || "—"}</span></div>
              <div><span className="text-muted-foreground">Dept: </span><span className="font-semibold">{department || "—"}</span></div>
              <div><span className="text-muted-foreground">Confidence: </span><ConfidencePill c={confidence} /></div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">AI Summary (editable)</Label>
              <Textarea rows={5} value={observations} onChange={(e) => setObservations(e.target.value)} className="mt-1" />
            </div>
            {disabledReason && (
              <div className="text-xs text-[var(--warn)] font-medium">{disabledReason}</div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={() => send.mutate()} disabled={!canSubmit || send.isPending}
              className="w-full h-12 bg-neon hover:bg-neon/90 text-[oklch(0.16_0.04_145)] font-bold disabled:opacity-50">
              <Send /> {send.isPending ? "Sending…" : "Send To Hospital"}
            </Button>
            <Button variant="outline" onClick={() => setReviewOpen(false)} className="w-full h-11">Edit Summary</Button>
            <Button variant="outline" onClick={() => { setReviewOpen(false); void autoSummarize(); }} disabled={!transcript.trim()} className="w-full h-11">
              <Sparkles /> Re-generate Summary
            </Button>
            <Button variant="ghost" onClick={resetRecording} className="w-full h-11">Re-record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ConfidencePill({ c }: { c: Confidence }) {
  const styles = c === "high" ? "bg-neon/20 text-[oklch(0.16_0.04_145)] border-neon/40"
    : c === "medium" ? "bg-accent text-accent-foreground border-transparent"
    : "bg-warn/15 text-[var(--warn)] border-warn/40";
  const label = c === "high" ? "High Confidence" : c === "medium" ? "Medium Confidence" : "Low Confidence";
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${styles}`}><ShieldCheck className="h-3 w-3" />{label}</span>;
}

function StructuredAssessmentCard({
  patientName, severity, incidentType, department, observations, confidence, timestamp,
}: {
  patientName: string; severity: string; incidentType: string; department: string; observations: string; confidence: Confidence; timestamp: string;
}) {
  return (
    <section className="mt-6 rounded-2xl border-2 border-primary/30 bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">EMT Structured Assessment</h2>
        </div>
        <ConfidencePill c={confidence} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <div><span className="text-xs text-muted-foreground">Patient</span><div className="font-medium">{patientName}</div></div>
        <div><span className="text-xs text-muted-foreground">Severity</span><div className="font-medium uppercase">{severity}</div></div>
        <div><span className="text-xs text-muted-foreground">Incident type</span><div className="font-medium">{incidentType || "—"}</div></div>
        <div><span className="text-xs text-muted-foreground">Department</span><div className="font-medium">{department || "—"}</div></div>
      </div>
      <div>
        <span className="text-xs text-muted-foreground">Observations / Summary</span>
        <p className="text-sm">{observations || "—"}</p>
      </div>
      <div className="text-[10px] text-muted-foreground">{new Date(timestamp).toLocaleString()}</div>
    </section>
  );
}

function SosPlayback({ rec, onPlay }: { rec: any; onPlay: () => void }) {
  const [played, setPlayed] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const transcriptText: string | null = rec.transcript ?? rec.ai_summary ?? null;
  return (
    <div className="rounded-lg bg-background border p-3 space-y-2">
      <div className="text-xs text-muted-foreground">
        Triggered {new Date(rec.opened_at).toLocaleString()}{rec.silent ? " · silent" : ""}
      </div>
      {rec.voice_note_url ? (
        <audio
          controls controlsList="nodownload" src={rec.voice_note_url} className="w-full"
          onPlay={() => { if (!played) { setPlayed(true); onPlay(); } }}
        >
          <track kind="captions" />
        </audio>
      ) : (
        <div className="text-xs text-muted-foreground">Recording unavailable.</div>
      )}
      {transcriptText && (
        <>
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {showTranscript ? "Hide transcript" : "View transcript"}
          </button>
          {showTranscript && (
            <p className="rounded-md border bg-card p-2 text-xs whitespace-pre-wrap">{transcriptText}</p>
          )}
        </>
      )}
      {rec.ai_summary && (
        <div className="rounded bg-accent/40 p-2 text-xs"><span className="font-semibold">AI Summary: </span>{rec.ai_summary}</div>
      )}
    </div>
  );
}


function RecordButton({
  state, elapsed, onStart, onStop,
}: { state: RecState; elapsed: number; onStart: () => void; onStop: () => void }) {
  const recording = state === "recording";
  const busy = state === "uploading" || state === "transcribing" || state === "summarizing";
  const disabled = busy;
  return (
    <button
      type="button"
      onClick={recording ? onStop : onStart}
      disabled={disabled}
      aria-label={recording ? "Stop recording" : "Start recording"}
      className={[
        "relative grid place-items-center rounded-full transition-all select-none",
        "h-36 w-36 sm:h-40 sm:w-40 shadow-lg",
        recording ? "bg-destructive text-destructive-foreground animate-pulse"
          : "bg-neon text-[oklch(0.16_0.04_145)] hover:scale-[1.02] active:scale-95",
        disabled ? "opacity-70 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {busy ? <Loader2 className="h-14 w-14 animate-spin" />
        : recording ? <Square className="h-14 w-14" strokeWidth={3} />
        : <Mic className="h-16 w-16" strokeWidth={2.5} />}
      {recording && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full text-xs font-mono text-destructive">
          {formatTime(elapsed)}
        </span>
      )}
    </button>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
