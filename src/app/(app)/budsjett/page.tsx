import { CalendarDays, ChevronLeft, ChevronRight, Info, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BudgetEditor, type BudgetRow } from "@/components/budget/budget-editor";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Meter } from "@/components/ui/progress";
import { getProfile, requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { fetchBudgets, fetchRecurring } from "@/lib/data/loaders";
import { fetchTxLite } from "@/lib/data/transactions";
import { addDays, addMonths, isValidISO, isValidMonthKey, isoWeekNumber, monthKeyOf, monthStart, todayISO, weekEnd, weekStart } from "@/lib/dates";
import { inRange, spendByCategory } from "@/lib/finance/aggregate";
import { buildBudgetView, paceProjection, periodRange } from "@/lib/finance/budget";
import { forecastMonth } from "@/lib/finance/forecast";
import { capitalize, formatDateShort, formatMoney, monthLabel, monthName } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Budsjett" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { currency } = await getProfile();
  const { categories, lk } = await getCore();
  const today = todayISO();

  const type = one(sp.type) === "uke" ? "week" : "month";
  let periodStart: string;
  if (type === "month") {
    const p = one(sp.p);
    periodStart = monthStart(isValidMonthKey(p) ? p : monthKeyOf(today));
  } else {
    const p = one(sp.p);
    periodStart = weekStart(isValidISO(p) ? p : today);
  }
  const { from, to } = periodRange(type, periodStart);
  const prevStart = type === "month" ? monthStart(addMonths(periodStart.slice(0, 7), -1)) : addDays(periodStart, -7);
  const nextStart = type === "month" ? monthStart(addMonths(periodStart.slice(0, 7), 1)) : addDays(periodStart, 7);
  const isCurrent = today >= from && today <= to;

  const [{ budgets, lines }, recurringAll, txs] = await Promise.all([
    fetchBudgets(supabase),
    fetchRecurring(supabase),
    fetchTxLite(supabase, { from: monthStart(addMonths(monthKeyOf(from), -2)), to }),
  ]);

  const view = buildBudgetView(budgets, lines, type, periodStart, txs, lk);
  const spend = new Map(spendByCategory(inRange(txs, from, to), lk).map((s) => [s.categoryId, s.amount]));

  const rows: BudgetRow[] = categories
    .filter((c) => c.kind === "expense" && !c.archived_at)
    .map((c) => ({ categoryId: c.id, name: c.name, icon: c.icon, color: c.color, planned: view.plan.get(c.id) ?? null, spent: Math.max(0, spend.get(c.id) ?? 0) }));

  const label = type === "month" ? capitalize(monthLabel(periodStart.slice(0, 7))) : `Uke ${isoWeekNumber(periodStart)} · ${formatDateShort(periodStart)} – ${formatDateShort(weekEnd(periodStart))}`;
  const periodWord = type === "month" ? monthName(periodStart.slice(0, 7)) : `uke ${isoWeekNumber(periodStart)}`;
  const hasPlan = view.totalPlanned > 0;

  // Prognose for måneden (kun månedsbudsjett i inneværende måned)
  let forecastNote: string | null = null;
  if (hasPlan && isCurrent) {
    if (type === "month") {
      const f = forecastMonth({ txs, lk, monthKey: periodStart.slice(0, 7), today, recurring: recurringAll.filter((r) => r.status === "active") });
      const diff = f.projectedExpenses - view.totalPlanned;
      forecastNote =
        f.confidence === "low"
          ? "Foreløpig for tidlig til å si noe sikkert om hvor du ender."
          : diff > 0
            ? `I dette tempoet ender du på omtrent ${formatMoney(f.projectedExpenses, { currency })} – ${formatMoney(diff, { currency })} over budsjettet.`
            : `I dette tempoet ender du på omtrent ${formatMoney(f.projectedExpenses, { currency })} – ${formatMoney(-diff, { currency })} under budsjettet.`;
    } else {
      const pace = paceProjection(view.totalSpent, from, to, today);
      if (pace) forecastNote = `Med samme tempo ender uka på omtrent ${formatMoney(pace.projected, { currency })} (budsjett ${formatMoney(view.totalPlanned, { currency })}).`;
    }
  }

  const base = "/budsjett";
  const hrefFor = (p: string, t = type) => `${base}?type=${t === "week" ? "uke" : "maned"}&p=${t === "month" ? p.slice(0, 7) : p}`;
  const unplanned = view.plannedIncome != null ? view.plannedIncome - view.totalPlanned : null;
  const copyFrom = view.inheritedFrom ?? (budgets.some((b) => b.period_type === type && b.period_start === prevStart) ? prevStart : null);
  const copyFromLabel = copyFrom ? (type === "month" ? monthName(copyFrom.slice(0, 7)) : `uke ${isoWeekNumber(copyFrom)}`) : null;

  const btn = "grid size-9 place-items-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink";

  return (
    <>
      <PageHeader
        title="Budsjett"
        description="Planlegg hva du vil bruke – og se hvordan det går."
        actions={
          <div role="tablist" aria-label="Periode" className="inline-flex gap-1 rounded-ctl bg-surface-2 p-1">
            {[
              { v: "month", l: "Måned" },
              { v: "week", l: "Uke" },
            ].map((t) => (
              <Link key={t.v} role="tab" aria-selected={type === t.v} href={hrefFor(t.v === "month" ? monthStart(monthKeyOf(today)) : weekStart(today), t.v as "month" | "week")} className={cn("inline-flex h-8 items-center rounded-[9px] px-3.5 text-[13px] font-medium text-ink-2", type === t.v && "bg-surface text-ink shadow-sm")}>
                {t.l}
              </Link>
            ))}
          </div>
        }
      />

      <div className="mb-5 flex items-center gap-2">
        <Link href={hrefFor(prevStart)} className={btn} aria-label="Forrige periode">
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-52 text-center font-display text-[15px] font-semibold">{label}</span>
        <Link href={hrefFor(nextStart)} className={btn} aria-label="Neste periode">
          <ChevronRight className="size-4" />
        </Link>
        {!isCurrent && (
          <Link href={hrefFor(type === "month" ? monthStart(monthKeyOf(today)) : weekStart(today))} className="ml-1 text-sm font-medium text-accent hover:underline">
            I dag
          </Link>
        )}
      </div>

      {view.inheritedFrom && hasPlan && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-line bg-primary-soft px-4 py-3 text-sm text-primary-soft-ink">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Du har ikke satt eget budsjett for {periodWord}, så vi bruker budsjettet fra {type === "month" ? monthName(view.inheritedFrom.slice(0, 7)) : `uke ${isoWeekNumber(view.inheritedFrom)}`}. Endrer du et beløp under, opprettes et eget budsjett for denne perioden.
          </p>
        </div>
      )}

      {hasPlan ? (
        <Card className="mb-5 p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <p className="text-sm text-ink-2">Planlagt</p>
              <p className="num-display text-3xl">{formatMoney(view.totalPlanned, { currency })}</p>
            </div>
            <div>
              <p className="text-sm text-ink-2">Brukt</p>
              <p className="num-display text-3xl">{formatMoney(view.totalSpent, { currency })}</p>
            </div>
            <div>
              <p className="text-sm text-ink-2">{view.totalRemaining >= 0 ? "Gjenstår" : "Overskredet med"}</p>
              <p className={cn("num-display text-3xl", view.totalRemaining >= 0 ? "text-pos" : "text-neg")}>{formatMoney(Math.abs(view.totalRemaining), { currency })}</p>
            </div>
          </div>
          <div className="mt-5">
            <Meter value={view.totalSpent / view.totalPlanned} tone={view.totalSpent > view.totalPlanned ? "over" : view.totalSpent / view.totalPlanned >= 0.85 ? "warn" : "ok"} label="Totalt brukt av budsjett" height={12} />
          </div>
          <div className="mt-4 space-y-1 text-sm text-ink-2">
            {forecastNote && <p>{forecastNote}</p>}
            {unplanned !== null && (
              <p>
                {unplanned >= 0 ? `${formatMoney(unplanned, { currency })} av forventet inntekt er ikke planlagt brukt – kan gå til sparing.` : `Du har planlagt ${formatMoney(-unplanned, { currency })} mer enn forventet inntekt.`}
              </p>
            )}
            {view.unbudgeted.length > 0 && (
              <p>
                I tillegg er {formatMoney(view.unbudgeted.reduce((n, u) => n + u.spent, 0), { currency })} brukt i kategorier uten budsjett.
              </p>
            )}
          </div>
        </Card>
      ) : (
        <Card className="mb-5 flex flex-col items-center gap-2 p-8 text-center">
          <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary-soft-ink">
            {type === "month" ? <Sparkles className="size-6" /> : <CalendarDays className="size-6" />}
          </span>
          <h2 className="text-lg font-semibold">Ingen budsjett for {periodWord} ennå</h2>
          <p className="max-w-md text-sm text-ink-2">La oss lage et realistisk budsjett ut fra det du faktisk bruker – eller skriv inn beløp selv under.</p>
        </Card>
      )}

      <BudgetEditor
        key={`${type}-${periodStart}`}
        periodType={type}
        periodStart={periodStart}
        rows={rows}
        currency={currency}
        plannedIncome={view.plannedIncome}
        copyFrom={copyFrom}
        copyFromLabel={copyFromLabel}
        periodLabel={periodWord}
      />
    </>
  );
}
