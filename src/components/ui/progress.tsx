import { cn } from "@/lib/utils";

export type MeterTone = "ok" | "warn" | "over" | "brand";

const FILL: Record<MeterTone, string> = {
  ok: "var(--meter-ok)",
  brand: "var(--meter-ok)",
  warn: "var(--meter-warn)",
  over: "var(--meter-over)",
};

/**
 * Måler: fyllet bærer alvorlighet; sporet er et lysere trinn av samme farge.
 * `value` er 0–1 (verdier over 1 vises som full).
 */
export function Meter({
  value,
  tone = "ok",
  label,
  className,
  height = 8,
  animate = true,
}: {
  value: number;
  tone?: MeterTone;
  label: string;
  className?: string;
  height?: number;
  animate?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(value, 9.99) * 100)}
      className={cn("meter-track w-full overflow-hidden rounded-full", className)}
      style={{ height, ["--meter-fill" as string]: FILL[tone] }}
    >
      <div
        className={cn("h-full origin-left rounded-full", animate && "animate-grow")}
        style={{ width: `${pct * 100}%`, background: FILL[tone] }}
      />
    </div>
  );
}
