import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  sub,
  icon,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  tone: "pos" | "neg" | "brand";
  className?: string;
}) {
  const toneCls = tone === "pos" ? "bg-pos-soft text-pos" : tone === "neg" ? "bg-neg-soft text-neg" : "bg-primary-soft text-primary-soft-ink";
  return (
    <Card className={cn("flex items-center gap-4 p-4 transition-transform duration-200 hover:-translate-y-0.5 sm:p-5", className)}>
      <span aria-hidden="true" className={cn("grid size-11 shrink-0 place-items-center rounded-2xl [&_svg]:size-5", toneCls)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] text-ink-2">{label}</p>
        <p className="num-display truncate text-[1.45rem]">{value}</p>
        {sub && <p className="truncate text-xs text-ink-3">{sub}</p>}
      </div>
    </Card>
  );
}
