import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, BellRing, Check, FlaskConical, Loader2, MapPin, Phone, PhoneOutgoing,
  ShieldAlert, ShieldCheck, Siren, UserCheck,
} from "lucide-react";
import { SavitriLogo } from "@/components/SavitriLogo";
import { DemoModeBadge } from "@/components/DemoModeBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";
import { DEMO_LOCATION, DEMO_MODE, EMERGENCY_CALL_NUMBER, maskPhone } from "@/lib/demo-mode";
import {
  grantEmtAccess, grantHospitalAccess, logEmergencyCall,
  reportEmergencyPatientUser, reportEmergencyPublic, resolveScanToken,
} from "@/lib/scan.functions";

import { RouteError, RouteNotFound } from "@/components/RouteBoundary";

export const Route = createFileRoute("/e/$token")({
  head: () => ({
    meta: [
      { title: "Possible Emergency — Savitri" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PublicScanPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="public" />,
  notFoundComponent: () => <RouteNotFound scope="public" />,
});

type ScannerType = "public" | "patient_user" | "emt" | "hospital";

function PublicScanPage() {
  const params = Route.useParams();
  const { user, role, isReady } = useAuth();
  const resolve = useServerFn(resolveScanToken);

  const { data, isLoading, error } = useQuery({
    queryKey: ["resolve-scan", params.token],
    queryFn: () => resolve({ data: { token: params.token } }),
  });

  const scannerType: ScannerType = useMemo(() => {
    if (!isReady || !user) return "public";
    if (role === "emt") return "emt";
    if (role === "hospital") return "hospital";
    if (role === "patient") return "patient_user";
    return "public";
  }, [isReady, user, role]);

  if (isLoading || !isReady) return <Shell><LoadingCard /></Shell>;
  if (error) return <Shell><ErrorCard message={(error as Error).message} /></Shell>;
  if (!data || data.active === false) return <Shell><ErrorCard message="This QR code is no longer active." /></Shell>;

  return (
    <Shell>
      <GatedFlow
        token={params.token}
        patientId={data.patient_id!}
        patientFirstName={data.patient_first_name}
        scannerType={scannerType}
      />
    </Shell>
  );
}

/* ───────────────────────── Layout ───────────────────────── */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-background/85 backdrop-blur z-20">
        <Link to="/" aria-label="Home"><SavitriLogo /></Link>
        <DemoModeBadge />
      </header>
      <main className="px-5 py-6 mx-auto w-full max-w-md">{children}</main>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="grid place-items-center py-20 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-critical/40 bg-critical/5 p-6 text-center">
      <AlertTriangle className="mx-auto size-8 text-[var(--critical)]" />
      <h1 className="mt-3 text-xl font-bold">Link invalid</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/* ───────────────────── State machine ────────────────────── */
type Phase = "declare" | "identify" | "reveal";

function GatedFlow({
  token, patientId, patientFirstName, scannerType,
}: { token: string; patientId: string; patientFirstName: string | null; scannerType: ScannerType }) {
  const [phase, setPhase] = useState<Phase>("declare");
  const [revealed, setRevealed] = useState<RevealPayload | null>(null);

  return (
    <div className="space-y-5">
      <ProgressSteps phase={phase} scannerType={scannerType} />
      {phase === "declare" && (
        <DeclareCard
          patientFirstName={patientFirstName}
          scannerType={scannerType}
          onContinue={() => setPhase(scannerType === "emt" || scannerType === "hospital" ? "reveal" : "identify")}
          token={token}
          onAuthGrant={(payload) => { setRevealed(payload); setPhase("reveal"); }}
        />
      )}
      {phase === "identify" && (
        <IdentifyCard
          scannerType={scannerType}
          token={token}
          onReveal={(payload) => { setRevealed(payload); setPhase("reveal"); }}
          onBack={() => setPhase("declare")}
        />
      )}
      {phase === "reveal" && (
        <RevealCard
          token={token}
          patientId={patientId}
          payload={revealed}
          scannerType={scannerType}
        />
      )}
    </div>
  );
}

function ProgressSteps({ phase, scannerType }: { phase: Phase; scannerType: ScannerType }) {
  const steps: Array<{ key: Phase | "notify"; label: string }> = [
    { key: "declare", label: "Declare" },
    ...(scannerType === "emt" || scannerType === "hospital" ? [] : [{ key: "identify" as const, label: "Identify" }]),
    { key: "notify", label: "Notify" },
    { key: "reveal", label: "Reveal" },
  ];
  const activeIdx = phase === "declare" ? 0 : phase === "identify" ? 1 : steps.length - 1;
  return (
    <ol className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide">
      {steps.map((s, i) => (
        <li key={s.key} className={`flex items-center gap-2 ${i <= activeIdx ? "text-foreground" : "text-muted-foreground"}`}>
          <span className={`grid size-5 place-items-center rounded-full text-[10px] font-bold ${i <= activeIdx ? "bg-neon text-[oklch(0.16_0.04_145)]" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
          {s.label}
          {i < steps.length - 1 && <span className="text-muted-foreground/40">›</span>}
        </li>
      ))}
    </ol>
  );
}

/* ───────────────────── Declare phase ────────────────────── */
function DeclareCard({
  patientFirstName, scannerType, onContinue, token, onAuthGrant,
}: {
  patientFirstName: string | null;
  scannerType: ScannerType;
  onContinue: () => void;
  token: string;
  onAuthGrant: (p: RevealPayload) => void;
}) {
  const emtGrant = useServerFn(grantEmtAccess);
  const hospitalGrant = useServerFn(grantHospitalAccess);
  const m = useMutation({
    mutationFn: async () => {
      if (scannerType === "emt") return emtGrant({ data: { token } });
      if (scannerType === "hospital") return hospitalGrant({ data: { token } });
      return null;
    },
    onSuccess: (res) => {
      if (res) onAuthGrant({ tier1: res.tier1, tier2: res.tier2, disclosure_reason: res.disclosure_reason, lat: null, lng: null, session_id: null });
      else onContinue();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const scannerLabel =
    scannerType === "emt" ? "EMT" :
    scannerType === "hospital" ? "Hospital staff" :
    scannerType === "patient_user" ? "Patient user (logged in)" : "Public user";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-critical/40 bg-critical/5 p-5 space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-critical px-3 py-1 text-xs font-semibold text-white">
          <Siren className="size-3" /> Possible Emergency Detected
        </div>
        <h1 className="text-2xl font-bold leading-tight">
          {patientFirstName ? `${patientFirstName} may need help` : "Patient may need help"}
        </h1>
        <p className="text-sm text-muted-foreground">
          To access emergency medical information you must report an emergency. This action will:
        </p>
        <ul className="space-y-1.5 text-sm">
          {[
            "Create an emergency audit record",
            "Record your identity",
            "Record your location",
            "Notify emergency contacts",
            "Notify the nearest hospital",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 size-4 text-[var(--neon)]" />{t}</li>
          ))}
        </ul>
        <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          <UserCheck className="size-3.5" /> Detected scanner: <span className="font-semibold text-foreground">{scannerLabel}</span>
        </div>
      </div>

      <Button
        size="lg"
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="w-full h-16 text-base font-bold bg-critical text-white hover:bg-critical/90 focus-visible:ring-critical"
      >
        {m.isPending ? <Loader2 className="size-5 animate-spin" /> : <Siren className="size-5" />}
        REPORT EMERGENCY
      </Button>

      <p className="text-[11px] text-muted-foreground text-center">
        Disclosure of emergency medical info is logged and shared with the patient and their contacts.
      </p>
    </div>
  );
}

/* ───────────────────── Identify phase ────────────────────── */
type GeoState =
  | { status: "idle" }
  | { status: "fetching" }
  | { status: "ok"; lat: number; lng: number; accuracy: number | null; source: "device" | "demo" }
  | { status: "error"; reason: string };

function useGeo() {
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const fetchNow = () => {
    setGeo({ status: "fetching" });
    if (!navigator.geolocation) {
      setGeo({ status: "error", reason: "Geolocation not available in this browser." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ status: "ok", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null, source: "device" }),
      (err) => setGeo({ status: "error", reason: err.message || "Unable to read location" }),
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 30_000 },
    );
  };
  const useDemo = () =>
    setGeo({ status: "ok", lat: DEMO_LOCATION.lat, lng: DEMO_LOCATION.lng, accuracy: null, source: "demo" });
  useEffect(() => { fetchNow(); /* auto-attempt once */ }, []);
  return { geo, fetchNow, useDemo };
}

function IdentifyCard({
  scannerType, token, onReveal, onBack,
}: { scannerType: ScannerType; token: string; onReveal: (p: RevealPayload) => void; onBack: () => void }) {
  const { geo, fetchNow, useDemo } = useGeo();
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);

  const reportPublic = useServerFn(reportEmergencyPublic);
  const reportPatient = useServerFn(reportEmergencyPatientUser);

  const m = useMutation({
    mutationFn: async () => {
      const loc = geo.status === "ok"
        ? { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy ?? null, location_source: geo.source }
        : { lat: null, lng: null, accuracy: null, location_source: "device" as const };

      if (scannerType === "patient_user") {
        return reportPatient({
          data: {
            token,
            ...loc,
            demo_mode: DEMO_MODE,
          },
        });
      }
      return reportPublic({
        data: {
          token,
          phone,
          consent: true as const,
          verification_method: DEMO_MODE ? "demo_verification" : "otp",
          ...loc,
          demo_mode: DEMO_MODE,
          user_agent: navigator.userAgent.slice(0, 280),
        },
      });
    },
    onSuccess: (res: any) => {
      toast.success(`Notified ${res.notified_contacts} contact(s) and ${res.notified_hospitals} hospital staff`);
      onReveal({
        tier1: res.tier1,
        tier2: null,
        disclosure_reason: res.disclosure_reason,
        lat: geo.status === "ok" ? geo.lat : null,
        lng: geo.status === "ok" ? geo.lng : null,
        session_id: res.session_id,
        notified_contacts: res.notified_contacts,
        notified_hospitals: res.notified_hospitals,
        location_source: geo.status === "ok" ? geo.source : null,
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const canSubmit =
    geo.status === "ok" &&
    (scannerType === "patient_user" ? true : phone.trim().length >= 4 && consent);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-5 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2"><ShieldCheck className="size-5 text-[var(--neon)]" /> Identity Capture</h2>

        {/* Location panel */}
        <div className={`rounded-xl border p-3 ${geo.status === "ok" ? "bg-emerald-500/5 border-emerald-500/30" : geo.status === "error" ? "bg-amber-500/5 border-amber-500/30" : "bg-muted/40"}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="size-4" /> Location
            </div>
            {geo.status === "ok" && geo.source === "demo" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
                <FlaskConical className="size-3" /> Demo Location Active
              </span>
            )}
          </div>
          {geo.status === "fetching" && <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Requesting location…</p>}
          {geo.status === "ok" && (
            <p className="mt-1 text-sm font-medium">{geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}{geo.accuracy ? ` · ±${Math.round(geo.accuracy)}m` : ""}</p>
          )}
          {geo.status === "error" && (
            <>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">Location unavailable: {geo.reason}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={fetchNow}>Retry Location</Button>
                {DEMO_MODE && <Button size="sm" onClick={useDemo} className="bg-amber-500 hover:bg-amber-500/90 text-amber-950"><FlaskConical className="size-3" /> Use Demo Location</Button>}
              </div>
            </>
          )}
        </div>

        {scannerType !== "patient_user" && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Your phone number</label>
              <Input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="h-12"
              />
              {DEMO_MODE ? (
                <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <FlaskConical className="size-3" /> Demo verification: no OTP required for this session.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">An OTP will be sent to confirm your number.</p>
              )}
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
              <span>I confirm that I am reporting a real or suspected emergency.</span>
            </label>
          </>
        )}
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-2">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button
          size="lg"
          disabled={!canSubmit || m.isPending}
          onClick={() => m.mutate()}
          className="h-14 text-base font-bold bg-critical text-white hover:bg-critical/90"
        >
          {m.isPending ? <Loader2 className="size-5 animate-spin" /> : <BellRing className="size-5" />}
          Confirm & notify
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────── Reveal phase ────────────────────── */
type RevealPayload = {
  tier1: any;
  tier2: any | null;
  disclosure_reason: string;
  lat: number | null;
  lng: number | null;
  session_id: string | null;
  notified_contacts?: number;
  notified_hospitals?: number;
  location_source?: "device" | "demo" | null;
};

function RevealCard({
  payload, scannerType, token, patientId,
}: { payload: RevealPayload | null; scannerType: ScannerType; token: string; patientId: string }) {
  const callFn = useServerFn(logEmergencyCall);
  const onCall = async () => {
    if (DEMO_MODE) {
      toast.message("Emergency Call Simulation Activated", {
        description: `Would dial ${EMERGENCY_CALL_NUMBER} in production.`,
      });
      await callFn({ data: { session_id: payload?.session_id ?? null, patient_id: patientId, simulated: true, number: EMERGENCY_CALL_NUMBER } });
    } else {
      await callFn({ data: { session_id: payload?.session_id ?? null, patient_id: patientId, simulated: false, number: EMERGENCY_CALL_NUMBER } });
      window.location.href = `tel:${EMERGENCY_CALL_NUMBER}`;
    }
  };

  if (!payload) {
    return <ErrorCard message="No data was disclosed. Please retry the report." />;
  }
  const t1 = payload.tier1;
  const t2 = payload.tier2;
  const maps_url = payload.lat != null && payload.lng != null ? `https://www.google.com/maps?q=${payload.lat},${payload.lng}` : null;

  return (
    <div className="space-y-4">
      {/* Notifications-sent receipt */}
      {(payload.notified_contacts != null || payload.notified_hospitals != null) && (
        <div className="rounded-xl border bg-emerald-500/5 border-emerald-500/30 p-3 text-sm">
          <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
            <BellRing className="size-4" /> Notifications sent
          </div>
          <div className="mt-1 text-muted-foreground">
            {payload.notified_contacts ?? 0} emergency contact{(payload.notified_contacts ?? 0) === 1 ? "" : "s"}
            {payload.notified_hospitals != null && ` · ${payload.notified_hospitals} hospital staff`}
            {payload.location_source === "demo" && " · demo location"}
          </div>
        </div>
      )}

      {/* Disclosure justification banner */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
        <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-4" /> Disclosure Reason</div>
        <div className="mt-0.5 text-muted-foreground">{payload.disclosure_reason}</div>
      </div>

      {/* Tier 1 */}
      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-lg font-bold">Emergency Medical Information</h2>
        <Row label="Name" value={t1.full_name ?? "—"} />
        <Row label="Age" value={t1.age != null ? `${t1.age}` : "—"} />
        <Row label="Blood group" value={t1.blood_group ?? "—"} highlight />
        <Row label="Allergies" value={t1.allergies?.length ? t1.allergies.join(", ") : "None recorded"} highlight={!!t1.allergies?.length} />
        <Row label="Conditions" value={t1.conditions?.length ? t1.conditions.join(", ") : "None recorded"} />
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Emergency contacts</div>
          {t1.emergency_contacts?.length ? (
            <ul className="mt-1 space-y-1">
              {t1.emergency_contacts.map((c: any, i: number) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{c.name}</span>
                  {c.relation ? <span className="text-muted-foreground"> · {c.relation}</span> : null}
                  {c.phone && (
                    <a className="ml-2 text-primary underline" href={`tel:${c.phone}`}>
                      {scannerType === "public" || scannerType === "hospital" ? maskPhone(c.phone) : c.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No contacts on file.</p>}
        </div>
      </section>

      {/* Tier 2 (EMT/Hospital only) */}
      {t2 && (
        <section className="rounded-2xl border p-5 space-y-2">
          <h2 className="text-lg font-bold">Extended clinical information</h2>
          {t2.extended_profile?.insurance_provider && <Row label="Insurance" value={`${t2.extended_profile.insurance_provider}${t2.extended_profile.insurance_policy_no ? ` · ${t2.extended_profile.insurance_policy_no}` : ""}`} />}
          <Row label="Prior emergencies" value={`${t2.prior_sessions?.length ?? 0} recorded`} />
        </section>
      )}

      {/* Actions */}
      <div className="grid gap-2">
        {maps_url && (
          <a href={maps_url} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground p-4 min-h-[56px] font-semibold">
            <MapPin className="size-5" /> Open in Google Maps
          </a>
        )}
        <Button onClick={onCall} className="h-14 bg-critical text-white hover:bg-critical/90 text-base font-bold">
          <PhoneOutgoing className="size-5" /> CALL EMERGENCY SERVICES
          {DEMO_MODE && <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-bold uppercase">simulated</span>}
        </Button>
        {scannerType === "emt" && (
          <Link to="/emt" className="text-center text-sm text-primary underline">Continue to EMT workflow →</Link>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm ${highlight ? "font-bold text-[var(--critical)]" : "font-medium"}`}>{value}</div>
    </div>
  );
}
