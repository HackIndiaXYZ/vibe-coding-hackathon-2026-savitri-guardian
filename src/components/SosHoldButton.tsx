import { useCallback, useEffect, useRef, useState } from "react";
import { Siren } from "lucide-react";
import { haptic } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Press-and-hold (2 s) SOS trigger with circular progress.
 * - Release before completion = cancel.
 * - Haptic taps at start, every 500 ms, and a long buzz at trigger.
 * - Pointer events (works for mouse + touch + stylus).
 */
const HOLD_MS = 2000;
const TICK_MS = 33; // ~30fps for smooth ring

export function SosHoldButton({
  onTrigger,
  label = "Hold for SOS",
  releaseLabel = "Release to cancel",
  firingLabel = "Sending…",
  disabled,
}: {
  onTrigger: () => void;
  label?: string;
  releaseLabel?: string;
  firingLabel?: string;
  disabled?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [fired, setFired] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastHapticRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current) { window.clearInterval(rafRef.current); rafRef.current = null; }
    startRef.current = null;
    setHolding(false);
    if (!fired) setProgress(0);
  }, [fired]);

  const start = useCallback(() => {
    if (disabled || fired) return;
    setHolding(true);
    haptic(40);
    startRef.current = performance.now();
    lastHapticRef.current = 0;
    rafRef.current = window.setInterval(() => {
      if (startRef.current == null) return;
      const elapsed = performance.now() - startRef.current;
      const pct = Math.min(1, elapsed / HOLD_MS);
      setProgress(pct);
      // periodic haptic taps as we charge
      const slot = Math.floor(elapsed / 500);
      if (slot > lastHapticRef.current) { lastHapticRef.current = slot; haptic(20); }
      if (pct >= 1) {
        haptic([60, 40, 120]);
        setFired(true);
        if (rafRef.current) { window.clearInterval(rafRef.current); rafRef.current = null; }
        startRef.current = null;
        onTrigger();
      }
    }, TICK_MS);
  }, [disabled, fired, onTrigger]);

  useEffect(() => () => { if (rafRef.current) window.clearInterval(rafRef.current); }, []);

  // SVG ring geometry
  const size = 240;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const offset = C * (1 - progress);

  const stateLabel = fired ? firingLabel : holding ? releaseLabel : label;

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      <button
        type="button"
        aria-label="Hold 2 seconds to send emergency SOS"
        aria-pressed={holding}
        disabled={disabled || fired}
        onPointerDown={(e) => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); start(); }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "relative grid place-items-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-offset-2",
          "touch-none disabled:opacity-60",
          holding && "scale-[1.02]",
          "transition-transform"
        )}
        style={{ width: size, height: size }}
      >
        {/* pulsing halo when idle */}
        {!holding && !fired && (
          <span aria-hidden className="absolute inset-0 rounded-full animate-ping bg-critical/30" />
        )}
        {/* progress ring */}
        <svg aria-hidden width={size} height={size} className="absolute inset-0 -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke="white" strokeWidth={stroke} fill="none"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset}
            style={{ transition: holding ? "none" : "stroke-dashoffset 200ms ease-out" }}
          />
        </svg>
        {/* core */}
        <span
          className={cn(
            "relative grid place-items-center rounded-full bg-critical text-white shadow-2xl",
            "transition-shadow",
            holding && "shadow-[0_0_60px_-5px_rgba(239,68,68,0.7)]"
          )}
          style={{ width: size - 40, height: size - 40 }}
        >
          <Siren className="size-20" strokeWidth={2.5} />
        </span>
      </button>
      <div className="text-center">
        <div className="text-xl font-bold">{stateLabel}</div>
        <div className="text-sm text-muted-foreground">2-second press to confirm</div>
      </div>
    </div>
  );
}
