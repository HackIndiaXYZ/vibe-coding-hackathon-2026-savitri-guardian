import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Icon-first, large-touch-target action button.
 * Always renders the icon prominently above the label, with a min 72px height
 * to satisfy WCAG 2.5.5 large-target guidance for users with low dexterity.
 */
type Tone = "default" | "neutral" | "critical" | "warn" | "ok";

const toneClass: Record<Tone, string> = {
  default: "bg-neon text-[oklch(0.16_0.04_145)] hover:bg-neon/90",
  neutral: "bg-card text-foreground border border-border hover:bg-accent/40",
  critical: "bg-critical text-white hover:bg-critical/90",
  warn: "bg-warn text-[oklch(0.2_0.05_70)] hover:bg-warn/90",
  ok: "bg-ok text-[oklch(0.16_0.04_145)] hover:bg-ok/90",
};

export interface BigActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  tone?: Tone;
  iconSize?: "lg" | "xl";
}

export const BigActionButton = forwardRef<HTMLButtonElement, BigActionButtonProps>(
  ({ icon, label, sublabel, tone = "default", iconSize = "lg", className, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={rest["aria-label"] ?? label}
        className={cn(
          "w-full rounded-2xl px-5 py-5 min-h-[72px] flex items-center gap-4 text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "active:scale-[0.99] shadow-sm",
          toneClass[tone],
          className
        )}
        {...rest}
      >
        <span
          aria-hidden
          className={cn(
            "grid place-items-center rounded-xl shrink-0",
            iconSize === "xl" ? "h-16 w-16 [&_svg]:size-10" : "h-14 w-14 [&_svg]:size-8",
            tone === "neutral" ? "bg-accent text-accent-foreground" : "bg-black/10"
          )}
        >
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-lg font-bold leading-tight">{label}</span>
          {sublabel && <span className="block text-sm opacity-80 mt-0.5">{sublabel}</span>}
        </span>
      </button>
    );
  }
);
BigActionButton.displayName = "BigActionButton";
