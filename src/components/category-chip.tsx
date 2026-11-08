import { Icon } from "@/components/icons";
import { themed } from "@/lib/colors";
import { cn } from "@/lib/utils";

/** Ikon på avrundet, tonet flate i kategoriens farge. */
export function CategoryIcon({ icon, color, size = "md", className }: { icon: string; color: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const dims = size === "sm" ? "size-7 rounded-[9px] [&_svg]:size-3.5" : size === "lg" ? "size-12 rounded-2xl [&_svg]:size-6" : "size-9 rounded-xl [&_svg]:size-[18px]";
  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center", dims, className)}
      style={{ background: `color-mix(in srgb, ${themed(color)} 16%, var(--surface))`, color: themed(color) }}
    >
      <Icon name={icon} />
    </span>
  );
}

export function CategoryChip({
  icon,
  color,
  name,
  sub,
  className,
}: {
  icon: string;
  color: string;
  name: string;
  sub?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <CategoryIcon icon={icon} color={color} size="sm" />
      <span className="min-w-0 truncate">
        <span className="font-medium">{name}</span>
        {sub && <span className="text-ink-3"> › {sub}</span>}
      </span>
    </span>
  );
}
