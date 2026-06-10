import { Link, useRouter } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldAlert, FileQuestion, Clock } from "lucide-react";

export type RouteScope = "patient" | "emt" | "hospital" | "contact" | "public";

const SCOPE = {
  patient: { home: "/patient", homeLabel: "Return to Patient Dashboard", role: "patient" as const },
  emt: { home: "/emt", homeLabel: "Return to EMT Dashboard", role: "emt" as const },
  hospital: { home: "/hospital", homeLabel: "Return to Hospital Dashboard", role: "hospital" as const },
  contact: { home: "/", homeLabel: "Return Home", role: undefined },
  public: { home: "/", homeLabel: "Return Home", role: undefined },
};

function classifyError(msg: string): "auth" | "expired" | "notfound" | "generic" {
  const m = (msg || "").toLowerCase();
  if (m.includes("expired") || m.includes("no longer active") || m.includes("invalid token")) return "expired";
  if (m.includes("not found") || m.includes("no rows") || m.includes("pgrst116")) return "notfound";
  if (
    m.includes("not authorized") ||
    m.includes("unauthorized") ||
    m.includes("forbidden") ||
    m.includes("permission") ||
    m.includes("not signed in") ||
    m.includes("no authorization header") ||
    m.includes("access denied")
  )
    return "auth";
  return "generic";
}

function Frame({
  scope,
  title,
  icon,
  message,
  children,
}: {
  scope: RouteScope;
  title: string;
  icon: React.ReactNode;
  message: string;
  children: React.ReactNode;
}) {
  const cfg = SCOPE[scope];
  const body = (
    <div className="min-h-[60vh] grid place-items-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted grid place-items-center">{icon}</div>
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">{children}</div>
      </div>
    </div>
  );
  if (cfg.role) {
    return (
      <AppShell title={title} requireRole={cfg.role}>
        {body}
      </AppShell>
    );
  }
  return <div className="min-h-screen bg-background">{body}</div>;
}

export function RouteError({
  error,
  reset,
  scope,
}: {
  error: Error;
  reset?: () => void;
  scope: RouteScope;
}) {
  const router = useRouter();
  const kind = classifyError(error?.message ?? "");
  const cfg = SCOPE[scope];

  if (kind === "auth") {
    return (
      <Frame
        scope={scope}
        title="Access Restricted"
        icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
        message="You do not have permission to access this page."
      >
        <Button asChild>
          <Link to={cfg.home}>{cfg.homeLabel}</Link>
        </Button>
      </Frame>
    );
  }

  if (kind === "expired") {
    return (
      <Frame
        scope={scope}
        title="Link Expired"
        icon={<Clock className="h-6 w-6 text-warn" />}
        message="This emergency access link is no longer active. Contact the patient or emergency coordinator."
      >
        <Button asChild variant="outline">
          <Link to={cfg.home}>{cfg.homeLabel}</Link>
        </Button>
      </Frame>
    );
  }

  if (kind === "notfound") {
    return (
      <Frame
        scope={scope}
        title="Record Not Found"
        icon={<FileQuestion className="h-6 w-6 text-muted-foreground" />}
        message="The requested information could not be located."
      >
        <Button asChild>
          <Link to={cfg.home}>{cfg.homeLabel}</Link>
        </Button>
      </Frame>
    );
  }

  return (
    <Frame
      scope={scope}
      title="Something Went Wrong"
      icon={<AlertTriangle className="h-6 w-6 text-destructive" />}
      message="An unexpected error occurred."
    >
      <Button
        onClick={() => {
          router.invalidate();
          reset?.();
        }}
      >
        Try Again
      </Button>
      <Button asChild variant="outline">
        <Link to={cfg.home}>{cfg.homeLabel}</Link>
      </Button>
    </Frame>
  );
}

export function RouteNotFound({ scope }: { scope: RouteScope }) {
  const cfg = SCOPE[scope];
  return (
    <Frame
      scope={scope}
      title="Record Not Found"
      icon={<FileQuestion className="h-6 w-6 text-muted-foreground" />}
      message="The requested information could not be located."
    >
      <Button asChild>
        <Link to={cfg.home}>{cfg.homeLabel}</Link>
      </Button>
    </Frame>
  );
}
