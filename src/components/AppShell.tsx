import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { SavitriLogo } from "./SavitriLogo";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import { LogOut } from "lucide-react";
import { DemoModeBadge } from "./DemoModeBadge";

export function AppShell({
  children, requireRole, title,
}: { children: ReactNode; requireRole: AppRole; title?: string }) {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (role && role !== requireRole) navigate({ to: "/" });
  }, [user, role, loading, requireRole, navigate]);

  if (loading || !user || role !== requireRole) {
    return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-background/85 backdrop-blur z-20">
        <Link to="/"><SavitriLogo /></Link>
        <div className="flex items-center gap-1">
          <DemoModeBadge className="mr-1" />
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out"><LogOut /></Button>
        </div>
      </header>
      {title && <div className="px-5 pt-5"><h1 className="text-2xl font-bold">{title}</h1></div>}
      <main className="flex-1 px-5 py-5 mx-auto w-full max-w-md">{children}</main>
    </div>
  );
}
