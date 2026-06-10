import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { BigActionButton } from "@/components/BigActionButton";
import { useAuthReady } from "@/lib/auth-context";
import { getMyPatientProfile, getPatientActiveSession } from "@/lib/patient.functions";
import { AlertCircle, ChevronRight, QrCode, Siren, UserCog } from "lucide-react";

import { RouteError, RouteNotFound } from "@/components/RouteBoundary";

export const Route = createFileRoute("/patient/")({
  head: () => ({ meta: [{ title: "Patient — Savitri" }] }),
  component: PatientHome,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} scope="patient" />,
  notFoundComponent: () => <RouteNotFound scope="patient" />,
});

function PatientHome() {
  const navigate = useNavigate();
  const enabled = useAuthReady();
  const getProfile = useServerFn(getMyPatientProfile);
  const getActive = useServerFn(getPatientActiveSession);
  const { data, isLoading } = useQuery({ queryKey: ["patient-profile"], queryFn: () => getProfile({}), enabled });
  const { data: active } = useQuery({ queryKey: ["patient-active"], queryFn: () => getActive({}), refetchInterval: 5000, enabled });



  return (
    <AppShell requireRole="patient">
      <div className="space-y-5">
        <div>
          <div className="text-base text-muted-foreground">Hello,</div>
          <div className="text-2xl font-bold">{data?.profile?.full_name || "Patient"}</div>
        </div>

        {/* PROMINENT SOS — icon-first, full-width, emergency red, one tap to open */}
        <button
          onClick={() => navigate({ to: "/patient/sos" })}
          aria-label="Open emergency SOS"
          className="relative w-full rounded-3xl bg-critical text-white p-6 flex items-center gap-5 shadow-xl active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-critical/40"
        >
          <span aria-hidden className="absolute inset-0 rounded-3xl bg-critical/40 animate-ping" />
          <span aria-hidden className="relative grid place-items-center h-20 w-20 rounded-2xl bg-white/15">
            <Siren className="size-12" strokeWidth={2.5} />
          </span>
          <span className="relative flex-1 text-left">
            <span className="block text-3xl font-extrabold leading-tight">SOS</span>
            <span className="block text-base/snug opacity-90 mt-1">Tap for emergency help</span>
          </span>
        </button>

        {active && (
          <button onClick={() => navigate({ to: "/patient/session/$id", params: { id: active.session.id } })}
            className="w-full text-left rounded-2xl border border-critical/40 bg-critical/10 p-5 flex items-center gap-3 min-h-[72px]">
            <AlertCircle className="size-7 text-[var(--critical)]" />
            <div className="flex-1">
              <div className="font-semibold text-base">Active emergency session</div>
              <div className="text-sm text-muted-foreground">
                Status: {active.incident?.status ?? "in progress"}{active.incident?.registration_number ? ` • Reg ${active.incident.registration_number}` : ""}
              </div>
            </div>
            <ChevronRight className="size-6" />
          </button>
        )}

        {!isLoading && !data?.medical && (
          <div className="rounded-2xl border border-warn/40 bg-warn/10 p-5">
            <div className="font-semibold text-base">Complete your emergency profile</div>
            <p className="text-sm text-muted-foreground mt-1">Add medical info so EMTs can help faster.</p>
            <BigActionButton
              icon={<UserCog />} label="Complete now" tone="default" className="mt-3"
              onClick={() => navigate({ to: "/patient/profile" })}
            />
          </div>
        )}

        <div className="grid gap-3">
          <BigActionButton
            icon={<QrCode />} label="My emergency QR" sublabel="Show this to EMTs in an emergency"
            tone="neutral" onClick={() => navigate({ to: "/patient/qr" })}
          />
          <BigActionButton
            icon={<UserCog />} label="Emergency profile" sublabel="Medical info, allergies, contacts"
            tone="neutral" onClick={() => navigate({ to: "/patient/profile" })}
          />
        </div>

        <Link to="/" className="block text-center text-sm text-muted-foreground underline pt-2">Sign out / switch role</Link>
      </div>
    </AppShell>
  );
}
