import { cn } from "@/lib/utils";

/** Pengeflyt-merket: en myk, avrundet flate med en bølge (flyt) og en mynt. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[12px] bg-[linear-gradient(135deg,#8b6cff_0%,#5b3fd1_55%,#4326a8_100%)] shadow-[0_6px_16px_-6px_rgb(91_63_209/0.7),inset_0_1px_0_rgb(255_255_255/0.3)]",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[22px]" fill="none">
        <path d="M3.5 14.5c2.2 0 2.2-3 4.5-3s2.3 3 4.5 3 2.3-3 4.5-3 2.3 3 3.5 3" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
        <circle cx="12" cy="8" r="3.2" fill="white" />
        <path d="M3.5 19c2.2 0 2.2-3 4.5-3s2.3 3 4.5 3 2.3-3 4.5-3 2.3 3 3.5 3" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {showName && <span className="font-display text-[19px] font-bold tracking-tight">Pengeflyt</span>}
    </span>
  );
}
