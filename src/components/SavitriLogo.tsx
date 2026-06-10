export function SavitriLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative h-8 w-8 rounded-xl bg-neon neon-glow grid place-items-center">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 2v20M2 12h20" strokeLinecap="round" />
        </svg>
      </div>
      <span className="font-display text-xl font-bold tracking-tight">Savitri</span>
    </div>
  );
}
