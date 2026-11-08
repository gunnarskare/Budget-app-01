import { AlertTriangle, CheckCircle2, CircleHelp, UserCheck } from "lucide-react";
import type { CategorySource } from "@/lib/types";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<CategorySource, string> = {
  rule: "Regel",
  history: "Tidligere valg",
  merchant: "Kjent butikk",
  keyword: "Nøkkelord",
  ai: "AI-forslag",
  manual: "Valgt av deg",
  default: "Ingen treff",
};

/** Kategoriseringsstatus + konfidens. Ikon og tekst bærer meningen – ikke farge alene. */
export function ConfidencePill({
  confidence,
  source,
  approved,
  reason,
  compact,
}: {
  confidence: number;
  source: CategorySource;
  approved?: boolean;
  reason?: string;
  compact?: boolean;
}) {
  let tone = "bg-pos-soft text-pos";
  let Icon = CheckCircle2;
  let label = "Høy";
  if (approved) {
    tone = "bg-primary-soft text-primary-soft-ink";
    Icon = UserCheck;
    label = "Godkjent";
  } else if (source === "default" || confidence < 0.5) {
    tone = "bg-neg-soft text-neg";
    Icon = AlertTriangle;
    label = "Lav";
  } else if (confidence < 0.8) {
    tone = "bg-warn-soft text-warn";
    Icon = CircleHelp;
    label = "Middels";
  }
  const pct = Math.round(confidence * 100);
  const title = `${SOURCE_LABEL[source]}${reason ? ` – ${reason}` : ""}${approved ? "" : ` (${pct} % sikker)`}`;
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tone)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
      {!compact && !approved && source !== "default" && <span className="font-normal opacity-80">· {pct} %</span>}
    </span>
  );
}

export { SOURCE_LABEL };
