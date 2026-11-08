import * as React from "react";
import { cn } from "@/lib/utils";

/** Tydelig tomtilstand: forklarer hva som mangler og gir én primærhandling. */
export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && (
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary-soft-ink [&_svg]:size-7">{icon}</div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-2">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}
