import { FlaskConical } from "lucide-react";
import { DEMO_MODE } from "@/lib/demo-mode";

export function DemoModeBadge({ className = "" }: { className?: string }) {
  if (!DEMO_MODE) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 ${className}`}
      title="Demo Mode: phone OTP, geolocation and emergency calls are simulated"
    >
      <FlaskConical className="size-3" /> Demo Mode
    </span>
  );
}
