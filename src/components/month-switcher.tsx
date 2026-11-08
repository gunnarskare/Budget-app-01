import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { addMonths } from "@/lib/dates";
import { capitalize, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Bla mellom måneder med vanlige lenker (virker uten JavaScript). */
export function MonthSwitcher({ monthKey, currentKey, basePath, param = "m", className }: { monthKey: string; currentKey: string; basePath: string; param?: string; className?: string }) {
  const prev = addMonths(monthKey, -1);
  const next = addMonths(monthKey, 1);
  const hrefFor = (k: string) => (k === currentKey ? basePath : `${basePath}?${param}=${k}`);
  const btn = "grid size-9 place-items-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink";
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Link href={hrefFor(prev)} className={btn} aria-label={`Forrige måned (${monthLabel(prev)})`}>
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-36 text-center font-display text-[15px] font-semibold" aria-live="polite">
        {capitalize(monthLabel(monthKey))}
      </span>
      {next <= currentKey ? (
        <Link href={hrefFor(next)} className={btn} aria-label={`Neste måned (${monthLabel(next)})`}>
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={cn(btn, "pointer-events-none opacity-40")} aria-hidden="true">
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );
}
