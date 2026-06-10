import { lazy, Suspense, useState } from "react";
import { ClientOnly, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scanEmergencyToken, startEmergencySession } from "@/lib/emt.functions";
import { DEMO_MODE } from "@/lib/demo-mode";
import { ChevronLeft, Camera, Keyboard } from "lucide-react";
import { toast } from "sonner";

const Scanner = lazy(() =>
  import("@yudiel/react-qr-scanner").then((module) => ({ default: module.Scanner })),
);

import { RouteError, RouteNotFound } from "@/components/RouteBoundary";

export const Route = createFileRoute("/emt/scan")({
  head: () => ({ meta: [{ title: "Scan QR — Savitri" }] }),
  component: ScanPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="emt" />,
  notFoundComponent: () => <RouteNotFound scope="emt" />,
});

function ScanPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(true);
  const scan = useServerFn(scanEmergencyToken);
  const start = useServerFn(startEmergencySession);
  // Demo-only env panel: derive from client-safe build-time env vars.
  const envInfo = DEMO_MODE
    ? {
        ENVIRONMENT_ID: import.meta.env.MODE ?? "(unknown)",
        SUPABASE_PROJECT_ID:
          (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ??
          ((import.meta.env.VITE_SUPABASE_URL as string | undefined)?.match(/https?:\/\/([^.]+)\./)?.[1]) ??
          "(unknown)",
      }
    : null;

  const extractToken = (raw: string) => {
    const cleaned = raw
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/^["'`\s]+|["'`\s]+$/g, "")
      .trim();
    const mm = cleaned.match(/\/e\/([A-Za-z0-9]+)/);
    return (mm ? mm[1] : cleaned.replace(/[?#].*$/, "")).trim();
  };

  const m = useMutation({
    mutationFn: async (raw: string) => {
      const token = extractToken(raw);
      const res = await scan({ data: { token } });
      if (!res.ok) throw new Error(res.error ?? "QR not recognized.");
      if (!res.patient_id) throw new Error("QR not recognized.");
      const session = await start({ data: { patient_id: res.patient_id } });
      if (!session?.id) throw new Error("Could not start emergency session.");
      return { ...res, session };
    },
    onSuccess: (r) => {
      navigate({ to: "/emt/session/$id", params: { id: r.session.id } });
    },
    onError: (e: any) => { toast.error(e.message); setScanning(true); },
  });

  return (
    <AppShell requireRole="emt">
      <Link to="/emt" className="inline-flex items-center text-sm text-muted-foreground mb-3"><ChevronLeft className="h-4 w-4" />Back</Link>
      <h1 className="text-2xl font-bold">Scan patient QR</h1>

      <div className="mt-4 flex gap-2">
        <Button size="sm" variant={mode === "camera" ? "default" : "outline"} onClick={() => setMode("camera")}><Camera /> Camera</Button>
        <Button size="sm" variant={mode === "manual" ? "default" : "outline"} onClick={() => setMode("manual")}><Keyboard /> Manual</Button>
      </div>

      {mode === "camera" ? (
        <div className="mt-4 overflow-hidden rounded-2xl border aspect-square bg-black">
          {scanning && !m.isPending && (
            <ClientOnly fallback={<div className="grid h-full place-items-center text-white">Camera starting…</div>}>
              <Suspense fallback={<div className="grid h-full place-items-center text-white">Camera starting…</div>}>
                <Scanner
                  onScan={(codes) => { const t = codes[0]?.rawValue; if (t) { setScanning(false); m.mutate(t); } }}
                  onError={() => {}}
                  constraints={{ facingMode: "environment" }}
                  styles={{ container: { width: "100%", height: "100%" } }}
                />
              </Suspense>
            </ClientOnly>
          )}
          {(!scanning || m.isPending) && <div className="grid h-full place-items-center text-white">Processing…</div>}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!manual) return;
            m.mutate(manual);
          }}
          className="mt-4 space-y-3"
        >
          <Input placeholder="Paste QR token" value={manual} onChange={(e) => setManual(e.target.value)} className="h-12" />
          <Button type="submit" disabled={m.isPending || !manual} className="w-full h-12 bg-neon hover:bg-neon/90 text-[oklch(0.16_0.04_145)] font-semibold">
            {m.isPending ? "Looking up…" : "Lookup patient"}
          </Button>
          {DEMO_MODE && envInfo && (
            <div className="rounded-lg border bg-muted/40 p-3 text-[11px] font-mono space-y-1">
              <div className="font-semibold text-xs mb-1">Demo diagnostics</div>
              <div className="flex gap-2"><span className="text-muted-foreground">ENVIRONMENT_ID:</span><span>{envInfo.ENVIRONMENT_ID}</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground">SUPABASE_PROJECT_ID:</span><span>{envInfo.SUPABASE_PROJECT_ID}</span></div>
            </div>
          )}
        </form>
      )}
      <p className="text-xs text-muted-foreground mt-4">Scanning logs an audit entry and notifies emergency contacts.</p>
    </AppShell>
  );
}
