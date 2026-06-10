import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { SavitriLogo } from "@/components/SavitriLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { ShieldPlus, QrCode, Hospital, Ambulance } from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user) return;
    if (role === "patient") navigate({ to: "/patient" });
    else if (role === "emt") navigate({ to: "/emt" });
    else if (role === "hospital") navigate({ to: "/hospital" });
  }, [user, role, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-5 py-4">
        <SavitriLogo />
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-md px-5 pt-8 pb-20">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-neon" /> Emergency response, reimagined
        </div>
        <h1 className="mt-4 text-4xl font-bold leading-tight">
          Every second matters. <span className="text-neon">Savitri</span> saves them.
        </h1>
        <p className="mt-3 text-muted-foreground">
          A secure QR-driven bridge between patients, EMTs, and hospitals — so critical care begins before arrival.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-3">
          <Feature icon={<QrCode />} title="Carry your emergency profile" desc="A QR token only — no medical data on the code." />
          <Feature icon={<Ambulance />} title="EMTs act in seconds" desc="Scan, view profile, capture voice, alert a hospital." />
          <Feature icon={<Hospital />} title="Hospitals prepare ahead" desc="Real-time alerts with AI-prepared incident reports." />
        </div>

        <div className="mt-10 flex flex-col gap-3">
          <Button asChild size="lg" className="h-14 text-base font-semibold bg-neon hover:bg-neon/90 text-[oklch(0.16_0.04_145)]">
            <Link to="/signup"><ShieldPlus /> Create patient profile</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-14 text-base">
            <Link to="/login">I already have an account</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border bg-card p-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">{icon}</div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}
