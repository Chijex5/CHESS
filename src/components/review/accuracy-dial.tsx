import { cn } from "@/lib/utils";

/** Accuracy as an arc. The number is the point, so the arc stays quiet. */
export function AccuracyDial({
  value,
  label,
  sublabel,
  className,
}: {
  value: number;
  label: string;
  sublabel?: string;
  className?: string;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative size-16 shrink-0">
        <svg viewBox="0 0 64 64" className="size-full -rotate-90">
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="6"
          />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c - filled}`}
          />
        </svg>
        <span className="tnum absolute inset-0 grid place-items-center font-mono text-sm font-semibold">
          {value.toFixed(0)}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {sublabel && (
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        )}
      </div>
    </div>
  );
}
