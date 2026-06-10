import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SosHoldButton } from "@/components/SosHoldButton";
import { Button } from "@/components/ui/button";
import { triggerSos, uploadSosRecording, cancelSos, updateSosLocation, recordSosLocationFailure } from "@/lib/sos.functions";
import { haptic, useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, BellOff, CheckCircle2, MapPin, Mic, RefreshCw, Square, Volume2 } from "lucide-react";

import { RouteError, RouteNotFound } from "@/components/RouteBoundary";

export const Route = createFileRoute("/patient/sos")({
  head: () => ({ meta: [{ title: "Emergency SOS — Savitri" }] }),
  component: SosPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="patient" />,
  notFoundComponent: () => <RouteNotFound scope="patient" />,
});

const MAX_RECORDING_MS = 30_000;

const DEMO_LOCATION = { lat: 28.6129, lng: 77.2295, accuracy: 15 }; // India Gate, New Delhi

type Phase = "idle" | "locating" | "notifying" | "recording" | "uploading" | "done" | "error";
type LocationErrorReason = "permission_denied" | "timeout" | "position_unavailable" | "browser_restriction" | "unknown";
type LocationSource = "device" | "demo";
type LocationState =
  | { status: "idle" | "capturing" }
  | { status: "captured"; lat: number; lng: number; accuracy: number; source: LocationSource }
  | { status: "unavailable"; reason: LocationErrorReason; message: string };

const LOCATION_REASON_LABELS: Record<LocationErrorReason, string> = {
  permission_denied: "Permission denied",
  timeout: "Timeout",
  position_unavailable: "Location unavailable",
  browser_restriction: "Browser restriction",
  unknown: "Location unavailable",
};

function SosPage() {
  const navigate = useNavigate();
  const { silent, setSilent } = useI18n();
  const trigger = useServerFn(triggerSos);
  const upload = useServerFn(uploadSosRecording);
  const cancel = useServerFn(cancelSos);
  const updateLocation = useServerFn(updateSosLocation);
  const recordLocationFailure = useServerFn(recordSosLocationFailure);

  const [phase, setPhase] = useState<Phase>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationState, setLocationState] = useState<LocationState>({ status: "idle" });
  const [notified, setNotified] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const cleanupRecorder = useCallback(() => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    if (recRef.current && recRef.current.state !== "inactive") {
      try { recRef.current.stop(); } catch { /* noop */ }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => cleanupRecorder(), [cleanupRecorder]);

  const captureLocation = useCallback(() =>
    new Promise<
      | { ok: true; lat: number; lng: number; accuracy: number }
      | { ok: false; reason: LocationErrorReason; message: string }
    >((resolve) => {
      if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.geolocation) {
        return resolve({ ok: false, reason: "browser_restriction", message: "Browser restriction" });
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ ok: true, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        (err) => {
          const raw = err.message || "Location unavailable";
          const text = raw.toLowerCase();
          const reason: LocationErrorReason = text.includes("permissions policy") || text.includes("secure origin") || text.includes("blocked")
            ? "browser_restriction"
            : err.code === err.PERMISSION_DENIED ? "permission_denied"
            : err.code === err.TIMEOUT ? "timeout"
            : err.code === err.POSITION_UNAVAILABLE ? "position_unavailable"
            : "unknown";
          resolve({ ok: false, reason, message: LOCATION_REASON_LABELS[reason] });
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10_000 }
      );
    }), []);

  const startRecording = useCallback(async (sid: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        cleanupRecorder();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const durationSec = Math.round((performance.now() - startedAtRef.current) / 1000);
        setPhase("uploading");
        try {
          const buf = await blob.arrayBuffer();
          // base64 encode
          let bin = "";
          const arr = new Uint8Array(buf);
          for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
          const b64 = btoa(bin);
          await upload({ data: { session_id: sid, audio_base64: b64, mime: rec.mimeType || "audio/webm", duration_sec: durationSec } });
          setPhase("done");
        } catch (err: any) {
          setError(err?.message ?? "Upload failed");
          setPhase("error");
        }
      };
      startedAtRef.current = performance.now();
      rec.start();
      setPhase("recording");
      setSecondsLeft(30);
      tickRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startedAtRef.current;
        const left = Math.max(0, Math.ceil((MAX_RECORDING_MS - elapsed) / 1000));
        setSecondsLeft(left);
        if (elapsed >= MAX_RECORDING_MS) {
          if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
          try { rec.stop(); } catch { /* noop */ }
        }
      }, 250);
    } catch (err: any) {
      setError(err?.message ?? "Microphone unavailable");
      setPhase("done"); // Notifications + GPS already went out; recording is best-effort
      if (!silent) toast.error("Microphone unavailable — contacts were still notified.");
    }
  }, [cleanupRecorder, silent, upload]);

  const handleTrigger = useCallback(async () => {
    setPhase("locating");
    setError(null);
    setCoords(null);
    setLocationState({ status: "capturing" });
    haptic([60, 40, 120]);
    const loc = await captureLocation();
    if (loc.ok) {
      setCoords({ lat: loc.lat, lng: loc.lng });
      setLocationState({ status: "captured", lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, source: "device" });
    } else {
      setLocationState({ status: "unavailable", reason: loc.reason, message: loc.message });
      if (!silent) toast.warning("Location unavailable. Use Demo Location to continue the demo.");
    }
    setPhase("notifying");
    try {
      const res: any = await trigger({ data: {
        lat: loc.ok ? loc.lat : null,
        lng: loc.ok ? loc.lng : null,
        accuracy: loc.ok ? loc.accuracy : null,
        location_error: loc.ok ? null : loc.reason,
        location_error_message: loc.ok ? null : loc.message,
        location_source: loc.ok ? "device" : undefined,
        silent,
      } });
      setSessionId(res.session_id);
      setNotified(res.notified ?? 0);
      if (!silent && res.notified > 0) toast.success(`${res.notified} contact${res.notified === 1 ? "" : "s"} notified`);
      await startRecording(res.session_id);
    } catch (err: any) {
      setError(err?.message ?? "Could not trigger SOS");
      setPhase("error");
    }
  }, [captureLocation, silent, startRecording, trigger]);

  const handleRetryLocation = useCallback(async () => {
    setLocationState({ status: "capturing" });
    const loc = await captureLocation();
    if (loc.ok) {
      setCoords({ lat: loc.lat, lng: loc.lng });
      setLocationState({ status: "captured", lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, source: "device" });
      if (sessionId) await updateLocation({ data: { session_id: sessionId, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, source: "device" } });
      if (!silent) toast.success("Location captured");
      return;
    }
    setLocationState({ status: "unavailable", reason: loc.reason, message: loc.message });
    if (sessionId) await recordLocationFailure({ data: { session_id: sessionId, reason: loc.reason, message: loc.message } });
    if (!silent) toast.warning("Location unavailable. Use Demo Location to continue the demo.");
  }, [captureLocation, recordLocationFailure, sessionId, silent, updateLocation]);

  const handleUseDemoLocation = useCallback(async () => {
    const { lat, lng, accuracy } = DEMO_LOCATION;
    setCoords({ lat, lng });
    setLocationState({ status: "captured", lat, lng, accuracy, source: "demo" });
    if (sessionId) {
      try {
        await updateLocation({ data: { session_id: sessionId, lat, lng, accuracy, source: "demo" } });
      } catch { /* noop */ }
    }
    if (!silent) toast.success("Demo location applied");
  }, [sessionId, silent, updateLocation]);

  const handleStopAndSend = () => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    try { recRef.current?.stop(); } catch { /* noop */ }
  };

  const handleCancelEverything = async () => {
    cleanupRecorder();
    if (sessionId) { try { await cancel({ data: { session_id: sessionId } }); } catch { /* noop */ } }
    navigate({ to: "/patient" });
  };

  return (
    <AppShell requireRole="patient">
      <div className="space-y-6">
        <Link to="/patient" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" /> Back home
        </Link>

        {phase === "idle" && (
          <>
            <div className="text-center">
              <h1 className="text-3xl font-bold">Emergency SOS</h1>
              <p className="text-muted-foreground mt-2 text-base">
                Press and hold the button for <strong>2 seconds</strong>. Release to cancel.
              </p>
            </div>

            <div className="py-6 grid place-items-center">
              <SosHoldButton onTrigger={handleTrigger} />
            </div>

            <button
              onClick={() => { setSilent(!silent); haptic(20); }}
              className="w-full rounded-2xl border p-4 flex items-center gap-3 hover:bg-accent/30 transition-colors"
              aria-pressed={silent}
            >
              <div className={`grid place-items-center h-12 w-12 rounded-xl ${silent ? "bg-critical/15 text-[var(--critical)]" : "bg-accent text-accent-foreground"}`}>
                {silent ? <BellOff /> : <Volume2 />}
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold">{silent ? "Silent SOS is ON" : "Silent SOS is OFF"}</div>
                <div className="text-sm text-muted-foreground">
                  {silent
                    ? "No sounds, prompts, or spoken feedback. Contacts still notified."
                    : "Tap to enable. Useful in unsafe situations."}
                </div>
              </div>
            </button>

            <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
              <div className="flex items-start gap-2"><MapPin className="size-4 mt-0.5 shrink-0" /> Your location is captured and shared with your emergency contacts.</div>
              <div className="flex items-start gap-2"><Mic className="size-4 mt-0.5 shrink-0" /> A 30-second voice note is recorded automatically.</div>
            </div>
          </>
        )}

        {(phase === "locating" || phase === "notifying") && (
          <div className="space-y-4">
            <StatusBlock title={phase === "locating" ? "Capturing your location…" : "Notifying your contacts…"}
              sub="Hang on — this takes about a second." spin />
            <LocationStatusPanel locationState={locationState} onRetryLocation={handleRetryLocation} onUseDemoLocation={handleUseDemoLocation} compact />
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Recording…</h2>
              <p className="text-muted-foreground mt-1">{silent ? "Silent mode — no sounds." : "Speak what's happening, where, who needs help."}</p>
            </div>
            <CountdownRing secondsLeft={secondsLeft} total={30} silent={silent} />
            <Button size="lg" onClick={handleStopAndSend}
              className="w-full h-16 text-base bg-neon hover:bg-neon/90 text-[oklch(0.16_0.04_145)]">
              <Square className="size-5" /> Stop & send now
            </Button>
            <button onClick={handleCancelEverything} className="w-full text-sm text-muted-foreground underline">
              Cancel SOS
            </button>
            <ContactsSentBadge count={notified} coords={coords} locationState={locationState} onRetryLocation={handleRetryLocation} onUseDemoLocation={handleUseDemoLocation} />
          </div>
        )}

        {phase === "uploading" && (
          <StatusBlock title="Uploading recording…" sub="Generating AI summary for your contacts." spin />
        )}

        {phase === "done" && (
          <div className="space-y-5 text-center">
            <div className="mx-auto h-20 w-20 rounded-full bg-ok/15 grid place-items-center text-[var(--ok)]">
              <CheckCircle2 className="size-12" />
            </div>
            <h2 className="text-2xl font-bold">SOS sent</h2>
            <p className="text-muted-foreground">Your emergency contacts have been notified and can see your location and recording.</p>
            <ContactsSentBadge count={notified} coords={coords} locationState={locationState} onRetryLocation={handleRetryLocation} onUseDemoLocation={handleUseDemoLocation} />
            <Button asChild size="lg" className="w-full h-14 text-base"><Link to="/patient">Back to home</Link></Button>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-critical/50 bg-critical/10 p-4">
              <div className="font-semibold">Something went wrong</div>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
            <Button onClick={() => { setPhase("idle"); setError(null); }} className="w-full">Try again</Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function DemoLocationBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
      Demo Location
    </span>
  );
}

function ContactsSentBadge({
  count,
  coords,
  locationState,
  onRetryLocation,
  onUseDemoLocation,
}: {
  count: number;
  coords: { lat: number; lng: number } | null;
  locationState: LocationState;
  onRetryLocation: () => Promise<void>;
  onUseDemoLocation: () => Promise<void>;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 text-left space-y-3">
      <div className="text-sm"><strong>{count}</strong> emergency contact{count === 1 ? "" : "s"} notified in real time.</div>
      <LocationStatusPanel locationState={locationState} onRetryLocation={onRetryLocation} onUseDemoLocation={onUseDemoLocation} />
      {coords && <a href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
        target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline">
        <MapPin className="size-4" /> Open in Google Maps
      </a>}
    </div>
  );
}

function LocationStatusPanel({
  locationState,
  onRetryLocation,
  onUseDemoLocation,
  compact = false,
}: {
  locationState: LocationState;
  onRetryLocation: () => Promise<void>;
  onUseDemoLocation?: () => Promise<void>;
  compact?: boolean;
}) {
  if (locationState.status === "captured") {
    return (
      <div className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm">
        <div className="flex items-center gap-2 font-semibold text-[var(--ok)]">
          <CheckCircle2 className="size-4" /> Location Captured
          {locationState.source === "demo" && <span className="ml-auto"><DemoLocationBadge /></span>}
        </div>
        {!compact && <div className="mt-1 text-muted-foreground">
          {locationState.lat.toFixed(5)}, {locationState.lng.toFixed(5)} · ±{Math.round(locationState.accuracy)}m
        </div>}
      </div>
    );
  }

  if (locationState.status === "unavailable") {
    return (
      <div className="rounded-xl border border-critical/40 bg-critical/10 p-3 text-sm space-y-3">
        <div className="flex items-center gap-2 font-semibold text-[var(--critical)]">
          <AlertTriangle className="size-4" /> Location Unavailable
        </div>
        <div className="text-muted-foreground">Location unavailable. Use demo location?</div>
        <div className="text-xs font-medium">Reason: {LOCATION_REASON_LABELS[locationState.reason]}</div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void onRetryLocation()}>
            <RefreshCw className="size-4" /> Retry Location
          </Button>
          {onUseDemoLocation && (
            <Button type="button" size="sm" onClick={() => void onUseDemoLocation()} className="bg-amber-500 hover:bg-amber-500/90 text-amber-950">
              <MapPin className="size-4" /> Use Demo Location
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
      Capturing location…
    </div>
  );
}

function StatusBlock({ title, sub, spin }: { title: string; sub?: string; spin?: boolean }) {
  return (
    <div className="py-12 text-center space-y-3">
      {spin && <div className="mx-auto h-12 w-12 rounded-full border-4 border-muted border-t-primary animate-spin" />}
      <div className="text-xl font-bold">{title}</div>
      {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
    </div>
  );
}

function CountdownRing({ secondsLeft, total, silent }: { secondsLeft: number; total: number; silent: boolean }) {
  const size = 220, stroke = 12, r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const progress = (total - secondsLeft) / total;
  const offset = C * (1 - progress);
  return (
    <div className="grid place-items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="oklch(0.92 0.01 130)" strokeWidth={stroke} fill="none" />
          <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--critical)" strokeWidth={stroke}
            fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 250ms linear" }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-5xl font-bold tabular-nums">{secondsLeft}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mt-1">
              {silent ? "silent rec" : "seconds"}
            </div>
          </div>
        </div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-critical px-3 py-1 text-xs font-semibold text-white">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> REC
          </span>
        </div>
      </div>
    </div>
  );
}
