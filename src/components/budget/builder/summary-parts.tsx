"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { CategoryIcon } from "@/components/category-chip";
import { Button } from "@/components/ui/button";
import { GROUP_GUIDE, GROUP_LABEL, type AllocationSegment, type PlanCheck, type PlanTotals, type RealityRow } from "@/lib/budget/plan";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

// Kategoripaletten (--c1…) er validert for lys og mørk modus; «til overs» er en dempet nøytral.
const SEGMENT = {
  need: { label: GROUP_LABEL.need, color: "var(--c1)" },
  want: { label: GROUP_LABEL.want, color: "var(--c2)" },
  saving: { label: GROUP_LABEL.saving, color: "var(--c3)" },
  leftover: { label: "Til overs", color: "color-mix(in srgb, var(--ink-3) 55%, var(--surface))" },
} as const;

/** Stolpe som viser hvordan inntekten fordeles. Tallene står i tegnforklaringen, ikke bare i fargene. */
export function AllocationBar({ segments, overspent, currency }: { segments: AllocationSegment[]; overspent: number; currency: string }) {
  if (segments.length === 0) {
    return <p className="text-sm text-ink-2">Legg inn inntekt og utgifter for å se hvordan pengene fordeles.</p>;
  }
  const summary = segments.map((s) => `${SEGMENT[s.key].label} ${formatPercent(s.share)}`).join(", ");
  return (
    <div>
      <div role="img" aria-label={`Fordeling: ${summary}`} className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full">
        {segments.map((s) => (
          <div key={s.key} className="h-full min-w-1" style={{ width: `${s.share * 100}%`, background: SEGMENT[s.key].color }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: SEGMENT[s.key].color }} aria-hidden="true" />
            <span className="text-ink-2">{SEGMENT[s.key].label}</span>
            <span className="font-medium tabular-nums">{formatMoney(s.amount, { currency })}</span>
            <span className="tabular-nums text-ink-3">{formatPercent(s.share)}</span>
          </li>
        ))}
      </ul>
      {overspent > 0 && <p className="mt-2 text-xs text-neg">Planen er {formatMoney(overspent, { currency })} større enn inntekten.</p>}
    </div>
  );
}

/** Din fordeling ved siden av tommelfingerregelen 50/30/20. */
export function GuideTable({ income, groups }: { income: number; groups: PlanTotals["groups"] }) {
  if (income <= 0) return null;
  const keys = ["need", "want", "saving"] as const;
  return (
    <div>
      <table className="w-full text-sm">
        <caption className="sr-only">Din fordeling sammenlignet med tommelfingerregelen 50/30/20</caption>
        <thead>
          <tr className="text-left text-xs text-ink-3">
            <th scope="col" className="pb-1.5 font-medium" />
            <th scope="col" className="pb-1.5 text-right font-medium">
              Din plan
            </th>
            <th scope="col" className="pb-1.5 text-right font-medium">
              Tommelfingerregel
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {keys.map((k) => (
            <tr key={k}>
              <th scope="row" className="py-2 text-left font-medium">
                {GROUP_LABEL[k]}
              </th>
              <td className="py-2 text-right tabular-nums">{formatPercent(groups[k] / income)}</td>
              <td className="py-2 text-right tabular-nums text-ink-2">{formatPercent(GROUP_GUIDE[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-3">50/30/20 er en rettesnor, ikke et krav. Behov er bl.a. bolig, mat, transport og helse; ønsker er resten.</p>
    </div>
  );
}

const CHECK_ICON: Record<PlanCheck["tone"], LucideIcon> = { good: CheckCircle2, info: Info, warn: AlertTriangle, bad: XCircle };
const CHECK_TONE: Record<PlanCheck["tone"], string> = { good: "text-pos", info: "text-accent", warn: "text-warn", bad: "text-neg" };

export function CheckList({ checks, onAction }: { checks: PlanCheck[]; onAction: (action: NonNullable<PlanCheck["action"]>) => void }) {
  if (checks.length === 0) return null;
  return (
    <ul className="divide-y divide-line">
      {checks.map((c) => {
        const Icon = CHECK_ICON[c.tone];
        return (
          <li key={c.id} className="flex items-start gap-3 py-3">
            <Icon className={cn("mt-0.5 size-5 shrink-0", CHECK_TONE[c.tone])} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{c.title}</p>
              <p className="mt-0.5 text-sm text-ink-2">{c.text}</p>
              {c.action === "leftover_to_saving" && (
                <Button variant="soft" size="sm" className="mt-2" onClick={() => onAction(c.action!)}>
                  Sett av til sparing
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Der planen avviker tydelig fra det du faktisk har brukt. Valgfritt, og kun når det finnes data. */
export function RealityList({
  rows,
  months,
  currency,
  names,
  canApply,
  onApply,
}: {
  rows: RealityRow[];
  months: number;
  currency: string;
  names: Map<string, { name: string; icon: string; color: string }>;
  canApply: (categoryId: string) => boolean;
  onApply: (row: RealityRow) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const cat = names.get(r.categoryId);
        if (!cat) return null;
        return (
          <li key={r.categoryId} className="flex items-center gap-3 py-3">
            <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{cat.name}</p>
              <p className="text-xs text-ink-2">
                Planlagt {formatMoney(r.planned, { currency })} · snitt siste {months} mnd {formatMoney(r.average, { currency })}
                {r.level === "under" ? " – kan det være litt knapt?" : " – du har god margin her."}
              </p>
            </div>
            {r.level === "under" && canApply(r.categoryId) && (
              <Button variant="secondary" size="sm" onClick={() => onApply(r)}>
                Bruk snittet
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className={cn("truncate text-[15px] font-semibold tabular-nums", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</dd>
    </div>
  );
}

/** Løpende status som følger deg gjennom stegene: hva som blir til overs akkurat nå. */
export function StatusBar({ totals, currency }: { totals: PlanTotals; currency: string }) {
  const money = (n: number) => formatMoney(n, { currency });
  return (
    <div className="sticky top-16 z-10 mb-5 rounded-2xl border border-line bg-surface/95 px-4 py-2.5 shadow-card backdrop-blur md:top-[4.5rem]">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        <Stat label="Inntekt" value={money(totals.income)} />
        <Stat label="Utgifter" value={money(totals.expenses)} />
        <Stat label="Sparing" value={money(totals.saving)} />
        <Stat label={totals.leftover < 0 ? "Mangler" : "Til overs"} value={money(Math.abs(totals.leftover))} tone={totals.income > 0 || totals.expenses > 0 ? (totals.leftover < 0 ? "neg" : "pos") : undefined} />
      </dl>
    </div>
  );
}
