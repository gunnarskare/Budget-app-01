import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Meter } from "@/components/ui/progress";
import { allocation } from "@/lib/budget/plan";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AllocationBar } from "./builder/summary-parts";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-ink-2">{label}</p>
      <p className={cn("num-display truncate text-2xl sm:text-3xl", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</p>
    </div>
  );
}

/** «Slik er pengene fordelt»: inntekt → utgifter → sparing → til overs, uavhengig av hva som er brukt. */
export function PlanOverview({
  income,
  expenses,
  saving,
  need,
  want,
  savedSoFar,
  periodWord,
  currency,
  builderHref = "/budsjett/bygg",
}: {
  income: number | null;
  expenses: number;
  saving: number | null;
  need: number;
  want: number;
  /** Faktisk spart i perioden (null = ukjent) */
  savedSoFar: number | null;
  periodWord: string;
  currency: string;
  builderHref?: string;
}) {
  const money = (n: number) => formatMoney(n, { currency });
  const plannedSaving = saving ?? 0;
  const leftover = income != null && income > 0 ? income - expenses - plannedSaving : null;
  const alloc = allocation({ income: income ?? 0, need, want, saving: plannedSaving });

  return (
    <Card className="mb-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Slik er pengene fordelt</h2>
          <p className="text-[13px] text-ink-2">Planen for {periodWord}, før noe er brukt</p>
        </div>
        <Button asChild variant="soft" size="sm">
          <Link href={builderHref}>Juster planen</Link>
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Inntekt" value={income != null && income > 0 ? money(income) : "Ikke satt"} />
        <Stat label="Utgifter" value={money(expenses)} />
        <Stat label="Sparing" value={plannedSaving > 0 ? money(plannedSaving) : "Ikke planlagt"} />
        <Stat label={leftover != null && leftover < 0 ? "Mangler" : "Til overs"} value={leftover != null ? money(Math.abs(leftover)) : "–"} tone={leftover == null ? undefined : leftover < 0 ? "neg" : "pos"} />
      </div>

      <div className="mt-5">
        <AllocationBar segments={alloc.segments} overspent={alloc.overspent} currency={currency} />
      </div>

      {income == null || income <= 0 ? (
        <p className="mt-4 text-sm text-ink-2">Legg inn forventet inntekt under for å se hva som blir til overs.</p>
      ) : null}

      {plannedSaving > 0 && savedSoFar != null && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">Spart hittil</span>
            <span className="tabular-nums text-ink-2">
              {money(Math.max(0, savedSoFar))} <span className="text-ink-3">av {money(plannedSaving)}</span>
            </span>
          </div>
          <Meter value={Math.max(0, savedSoFar) / plannedSaving} tone="brand" label={`Spart ${money(Math.max(0, savedSoFar))} av planlagt ${money(plannedSaving)}`} />
        </div>
      )}
    </Card>
  );
}
