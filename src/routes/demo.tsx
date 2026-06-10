import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDemoState,
  resetAllDemoData,
  reseedAccounts,
  clearActiveIncidents,
  createFreshSosIncident,
  createFreshEmergencyIncident,
} from "@/lib/demo-control.functions";
import { DEMO_MODE } from "@/lib/demo-mode";
import { getPublicAppBaseUrl, buildQrTargetUrl } from "@/lib/qr-url";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RotateCcw, Trash2, Siren, Ambulance, Users, ChevronLeft, QrCode } from "lucide-react";
import { useState } from "react";


export const Route = createFileRoute("/demo")({
  beforeLoad: () => {
    if (!DEMO_MODE) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Demo Control Center — Savitri" }, { name: "robots", content: "noindex" }] }),
  component: DemoControlPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center bg-background">
      <div>
        <div className="text-2xl font-bold">Demo Control unavailable</div>
        <p className="text-muted-foreground mt-2">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function DemoControlPage() {
  const qc = useQueryClient();
  const fetchState = useServerFn(getDemoState);
  const { data: state, isLoading } = useQuery({
    queryKey: ["demo-state"],
    queryFn: () => fetchState(),
    refetchInterval: 5000,
  });

  const resetFn = useServerFn(resetAllDemoData);
  const reseedFn = useServerFn(reseedAccounts);
  const clearFn = useServerFn(clearActiveIncidents);
  const sosFn = useServerFn(createFreshSosIncident);
  const emtFn = useServerFn(createFreshEmergencyIncident);

  const refresh = () => qc.invalidateQueries({ queryKey: ["demo-state"] });

  const mk = (label: string, fn: () => Promise<any>) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => { toast.success(`${label} ✓`); refresh(); },
      onError: (e: any) => toast.error(`${label}: ${e?.message ?? "failed"}`),
    });

  const mReset = mk("Reset all demo data", () => resetFn());
  const mReseed = mk("Re-seed accounts", () => reseedFn());
  const mClear = mk("Clear active incidents", () => clearFn());
  const mSos = mk("Fresh SOS incident", () => sosFn());
  const mEmt = mk("Fresh EMT incident", () => emtFn());

  const anyBusy = mReset.isPending || mReseed.isPending || mClear.isPending || mSos.isPending || mEmt.isPending;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" />Home</Link>
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Demo Mode
          </span>
        </div>

        <header>
          <h1 className="text-3xl font-bold">Demo Control Center</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            One-click reset for hackathon demos. Restore a clean state in &lt; 10s.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          <ActionCard
            icon={<RotateCcw className="size-5" />}
            title="Reset all demo data"
            description="Wipe sessions, incidents, audit logs, notifications + re-seed."
            tone="critical"
            disabled={anyBusy}
            busy={mReset.isPending}
            onClick={() => mReset.mutate()}
          />
          <ActionCard
            icon={<Trash2 className="size-5" />}
            title="Clear active incidents"
            description="Close in-flight emergencies without re-seeding accounts."
            disabled={anyBusy}
            busy={mClear.isPending}
            onClick={() => mClear.mutate()}
          />
          <ActionCard
            icon={<Siren className="size-5" />}
            title="Create fresh SOS incident"
            description="Triggers a SOS as the demo patient with demo location."
            disabled={anyBusy}
            busy={mSos.isPending}
            onClick={() => mSos.mutate()}
          />
          <ActionCard
            icon={<Ambulance className="size-5" />}
            title="Create fresh EMT incident"
            description="Opens an EMT session + submits a HIGH-priority incident."
            disabled={anyBusy}
            busy={mEmt.isPending}
            onClick={() => mEmt.mutate()}
          />
          <ActionCard
            icon={<Users className="size-5" />}
            title="Re-seed patient / EMT / hospital"
            description="Idempotent: refreshes accounts, contacts, QR token."
            disabled={anyBusy}
            busy={mReseed.isPending}
            onClick={() => mReseed.mutate()}
            className="sm:col-span-2"
          />
        </section>

        <QrDiagnosticsPanel activeToken={state?.tokens?.find((t: any) => t.active)?.token ?? null} />



        <section className="rounded-2xl border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Current demo state</h2>
            <Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>
          </div>
          {isLoading || !state ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <StateChip ok={state.accounts.patient} label="Patient account" />
              <StateChip ok={state.accounts.emt} label="EMT account" />
              <StateChip ok={state.accounts.hospital} label="Hospital account" />
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Contacts</div>
                <div className="font-bold text-xl">{state.contacts.length}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Active QR tokens</div>
                <div className="font-bold text-xl">{state.tokens.filter((t: any) => t.active).length}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Open sessions</div>
                <div className="font-bold text-xl">{state.active_session_count}</div>
              </div>
              <div className="rounded-lg border p-3 sm:col-span-3">
                <div className="text-xs text-muted-foreground mb-2">Recent sessions</div>
                {state.sessions.length === 0 ? (
                  <div className="text-muted-foreground text-xs">None</div>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {state.sessions.map((s: any) => (
                      <li key={s.id} className="flex justify-between gap-3">
                        <span className="truncate font-mono">{s.id.slice(0, 8)}</span>
                        <span className="text-muted-foreground">{s.triggered_via}</span>
                        <span className="uppercase font-semibold">{s.status}</span>
                        <span className="text-muted-foreground">{new Date(s.opened_at).toLocaleTimeString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border p-3 sm:col-span-3">
                <div className="text-xs text-muted-foreground mb-2">Recent incidents</div>
                {state.incidents.length === 0 ? (
                  <div className="text-muted-foreground text-xs">None</div>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {state.incidents.map((i: any) => (
                      <li key={i.id} className="flex justify-between gap-3">
                        <span className="truncate">{i.incident_type ?? "—"}</span>
                        <span className="uppercase font-semibold">{i.status}</span>
                        <span className="text-muted-foreground">{i.registration_number ?? "no reg"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StateChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`rounded-lg border p-3 ${ok ? "border-neon/40 bg-neon/10" : "border-critical/40 bg-critical/10"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold">{ok ? "Ready" : "Missing"}</div>
    </div>
  );
}

function ActionCard({
  icon, title, description, onClick, disabled, busy, tone, className,
}: {
  icon: React.ReactNode; title: string; description: string;
  onClick: () => void; disabled?: boolean; busy?: boolean;
  tone?: "critical"; className?: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-3 ${className ?? ""}`}>
      <div className="flex items-center gap-2 font-semibold">{icon}{title}</div>
      <p className="text-xs text-muted-foreground flex-1">{description}</p>
      <Button
        onClick={onClick}
        disabled={disabled}
        className={tone === "critical" ? "bg-critical hover:bg-critical/90 text-white" : ""}
      >
        {busy ? "Running…" : "Run"}
      </Button>
    </div>
  );
}

function QrDiagnosticsPanel({ activeToken }: { activeToken: string | null }) {
  const { base, source } = getPublicAppBaseUrl();
  const envUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ?? "";
  const origin = base || "same-origin relative URL";
  const sampleToken = activeToken ?? "DEMO_TOKEN_PLACEHOLDER";
  const encoded = buildQrTargetUrl(sampleToken);
  const [revealed, setRevealed] = useState(false);

  return (
    <section className="rounded-2xl border p-5 space-y-3">
      <div className="flex items-center gap-2">
        <QrCode className="size-5" />
        <h2 className="text-lg font-bold">QR target diagnostics</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        QR codes embed <code>VITE_PUBLIC_APP_URL</code> when set; otherwise they fall back to{" "}
        <code>window.location.origin</code>. Set <code>VITE_PUBLIC_APP_URL</code> to your published
        domain to prevent preview-only QR codes during demos.
      </p>
      <dl className="grid gap-2 text-xs sm:grid-cols-[180px_1fr]">
        <dt className="text-muted-foreground">Current target base</dt>
        <dd className="font-mono break-all">{origin}</dd>
        <dt className="text-muted-foreground">VITE_PUBLIC_APP_URL</dt>
        <dd className="font-mono break-all">
          {envUrl ? envUrl : <span className="text-amber-600 dark:text-amber-400">(unset — using origin)</span>}
        </dd>
        <dt className="text-muted-foreground">Active source</dt>
        <dd className="font-mono uppercase">{source}</dd>
        <dt className="text-muted-foreground">QR target route</dt>
        <dd className="font-mono">/e/&lt;token&gt;</dd>
        <dt className="text-muted-foreground">Active patient token</dt>
        <dd className="font-mono break-all">
          {activeToken ? `${activeToken.slice(0, 8)}…${activeToken.slice(-6)}` : "(none — seed first)"}
        </dd>
      </dl>
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="text-xs text-muted-foreground">Exact URL currently encoded into the QR</div>
        <div className="font-mono text-xs break-all">
          {revealed ? encoded : "•••••••••••• (hidden)"}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setRevealed((v) => !v)}>
            {revealed ? "Hide" : "Verify QR target"}
          </Button>
          {revealed && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(encoded);
                toast.success("Copied");
              }}
            >
              Copy
            </Button>
          )}
          {revealed && activeToken && (
            <a
              href={encoded}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-md border px-3 text-xs font-medium"
            >
              Open
            </a>
          )}
        </div>
        {source === "origin" && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            ⚠ Using preview origin. QR codes generated here will only work on this exact host.
          </p>
        )}
      </div>
    </section>
  );
}

