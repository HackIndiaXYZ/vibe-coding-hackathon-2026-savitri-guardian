import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SavitriLogo } from "@/components/SavitriLogo";
import { DEMO_MODE } from "@/lib/demo-mode";
import { getDemoEmergencyContactToken } from "@/lib/demo-control.functions";
import { toast } from "sonner";
import { Ambulance, Hospital, User as UserIcon, Users } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Savitri" }] }),
  component: LoginPage,
});

const DEMO = {
  patient: { email: "demo.patient@savitri.app", password: "DemoPatient!2026" },
  emt: { email: "demo.emt@savitri.app", password: "DemoEmt!2026" },
  hospital: { email: "demo.hospital@savitri.app", password: "DemoHospital!2026" },
};

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const fetchContactToken = useServerFn(getDemoEmergencyContactToken);

  const signIn = async (em: string, pw: string) => {
    setBusy(true);
    if (em.endsWith("@savitri.app")) {
      try { await fetch("/api/public/seed", { method: "POST" }); } catch {}
    }
    const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Signed in");
    navigate({ to: "/" });
  };

  const openContactPortal = async () => {
    setBusy(true);
    try {
      try { await fetch("/api/public/seed", { method: "POST" }); } catch {}
      const { token } = await fetchContactToken();
      navigate({ to: "/n/$token", params: { token } });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open contact portal");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="px-5 py-4"><Link to="/"><SavitriLogo /></Link></header>
      <main className="flex-1 px-5 pt-6 pb-20 mx-auto w-full max-w-md">
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="mt-2 text-muted-foreground">Sign in to continue.</p>

        <form onSubmit={(e) => { e.preventDefault(); signIn(email, password); }} className="mt-8 space-y-4">
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 mt-1" /></div>
          <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12 mt-1" /></div>
          <Button type="submit" disabled={busy} className="w-full h-12 bg-neon hover:bg-neon/90 text-[oklch(0.16_0.04_145)] font-semibold">{busy ? "Signing in…" : "Sign in"}</Button>
        </form>

        <div className="mt-8">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Demo access</div>
          <div className="grid grid-cols-2 gap-2">
            <DemoBtn icon={<UserIcon />} label="Patient" onClick={() => signIn(DEMO.patient.email, DEMO.patient.password)} disabled={busy} />
            {DEMO_MODE && (
              <DemoBtn icon={<Users />} label="Emergency Contact" onClick={openContactPortal} disabled={busy} />
            )}
            <DemoBtn icon={<Ambulance />} label="EMT" onClick={() => signIn(DEMO.emt.email, DEMO.emt.password)} disabled={busy} />
            <DemoBtn icon={<Hospital />} label="Hospital" onClick={() => signIn(DEMO.hospital.email, DEMO.hospital.password)} disabled={busy} />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await fetch("/api/public/demo-reset", { method: "POST" });
                const j = await res.json();
                if (!j.ok) throw new Error(j.error || "Reset failed");
                toast.success("Demo data reset");
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setBusy(false);
              }
            }}
            className="mt-3 w-full text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
          >
            Reset demo data
          </button>
        </div>

        <p className="mt-6 text-sm text-muted-foreground text-center">No account? <Link to="/signup" className="text-neon font-medium">Create patient profile</Link></p>
      </main>
    </div>
  );
}

function DemoBtn({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled: boolean }) {
  return (
    <Button variant="outline" className="h-12 justify-start" onClick={onClick} disabled={disabled}>
      {icon}<span className="ml-2 truncate">{label}</span>
    </Button>
  );
}
