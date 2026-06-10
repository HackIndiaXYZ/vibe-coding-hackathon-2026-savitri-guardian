import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthReady } from "@/lib/auth-context";

import { QRCodeSVG } from "qrcode.react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getMyPatientProfile, issueEmergencyToken } from "@/lib/patient.functions";
import { buildQrTargetUrl } from "@/lib/qr-url";
import { ChevronLeft, RefreshCw, Copy, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

async function copyText(text: string, label: string) {
  // Try modern Clipboard API first, but fall back to a hidden textarea +
  // execCommand("copy") when the API is blocked (e.g. iframe Permissions
  // Policy in the Lovable preview, or insecure context on Android).
  const tryClipboard = async () => {
    if (!navigator.clipboard?.writeText) throw new Error("no clipboard api");
    await navigator.clipboard.writeText(text);
  };
  const tryExecCommand = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (!ok) throw new Error("execCommand copy returned false");
  };
  try {
    try { await tryClipboard(); } catch { tryExecCommand(); }
    toast.success(label);
  } catch {
    toast.error("Copy failed — long-press the text to copy manually");
  }
}

import { RouteError, RouteNotFound } from "@/components/RouteBoundary";

export const Route = createFileRoute("/patient/qr")({
  head: () => ({ meta: [{ title: "My QR — Savitri" }] }),
  component: QrPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="patient" />,
  notFoundComponent: () => <RouteNotFound scope="patient" />,
});

function QrPage() {
  const get = useServerFn(getMyPatientProfile);
  const issue = useServerFn(issueEmergencyToken);
  const qc = useQueryClient();
  const ready = useAuthReady();
  const { data, isLoading } = useQuery({ queryKey: ["patient-profile"], queryFn: () => get({}), enabled: ready });

  const m = useMutation({
    mutationFn: () => issue({}),
    onSuccess: () => { toast.success("New QR issued"); qc.invalidateQueries({ queryKey: ["patient-profile"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const token = data?.token?.token;
  const qrValue = token ? buildQrTargetUrl(token) : "";


  return (
    <AppShell requireRole="patient">
      <Link to="/patient" className="inline-flex items-center text-sm text-muted-foreground mb-3"><ChevronLeft className="h-4 w-4" />Back</Link>
      <h1 className="text-2xl font-bold">Your emergency QR</h1>
      <p className="text-sm text-muted-foreground mt-1">Contains a secure token only. No medical data is on the code.</p>

      <div className="mt-6 rounded-3xl border bg-white p-6 grid place-items-center neon-glow">
        {isLoading ? <div className="h-64 grid place-items-center text-muted-foreground">Loading…</div>
          : token ? <QRCodeSVG value={qrValue} size={240} level="H" includeMargin />
          : (
            <div className="text-center py-10">
              <p className="text-muted-foreground text-sm mb-3 text-black">No active QR yet.</p>
              <Button onClick={() => m.mutate()} className="bg-neon text-[oklch(0.16_0.04_145)] hover:bg-neon/90">Generate QR</Button>
            </div>
          )}
      </div>

      {token && (
        <>
          <div className="mt-4 rounded-xl border p-3 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-neon/20 text-[oklch(0.16_0.04_145)] border border-neon/40 px-2 py-0.5 text-xs font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-neon animate-pulse" /> QR Status: Active
              </span>
              {data?.token?.created_at && (
                <span className="text-xs text-muted-foreground">
                  Last generated: {new Date(data.token.created_at).toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Issuing a new QR revokes the previous one. EMTs scanning a revoked QR will see a "QR not recognized" message.
            </p>
          </div>

          <div className="mt-4 rounded-xl border p-3 space-y-2">
            <div className="text-xs text-muted-foreground">Token</div>
            <p className="font-mono text-xs break-all">{token}</p>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => copyText(token, "Emergency token copied.")}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button size="sm" variant="outline" onClick={() => copyText(qrValue, "QR URL copied.")}>
                <LinkIcon className="h-4 w-4" /> Copy QR URL
              </Button>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground break-all">{qrValue}</p>
          </div>
          <Button variant="outline" className="w-full mt-4 h-12" onClick={() => m.mutate()} disabled={m.isPending}>
            <RefreshCw /> {m.isPending ? "Issuing…" : "Issue new QR (revokes old)"}
          </Button>
        </>
      )}
    </AppShell>
  );
}
