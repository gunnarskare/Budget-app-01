import { CalendarDays, ChevronLeft, ChevronRight, Hammer, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BudgetEditor, type BudgetRow } from "@/components/budget/budget-editor";
import { PlanOverview } from "@/components/budget/plan-overview";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Meter } from "@/components/ui/progress";
import { getProfile, requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { groupAmountsForBudget, monthlyOf } from "@/lib/budget/plan";
import { fetchBudgets, fetchPlanItems, fetchRecurring } from "@/lib/data/loaders";
import { fetchTxLite } from "@/lib/data/transactions";
import { addDays, addMonths, daysInMonth, isValidISO, isValidMonthKey, isoWeekNumber, monthKeyOf, monthStart, todayISO, weekEnd, weekStart } from "@/lib/dates";
import { inRange, spendByCategory, totals } from "@/lib/finance/aggregate";
import { buildBudgetView, paceProjection, periodRange } from "@/lib/finance/budget";
import { forecastMonth } from "@/lib/finance/forecast";
import { capitalize, formatDateShort, formatMoney, monthLabel, monthName } from "@/lib/format";
import { cn } from "@/lib/utils";

// Server Actions på denne siden (import, eksempeldata, omberegning) kan ta noen sekunder.
export const maxDuration = 60;

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

  const [{ budgets, lines }, recurringAll, planItems, txs] = await Promise.all([
    fetchBudgets(supabase),
    fetchRecurring(supabase),
    fetchPlanItems(supabase),
    fetchTxLite(supabase, { from: monthStart(addMonths(monthKeyOf(from), -2)), to }),
  ]);

  const view = buildBudgetView(budgets, lines, type, periodStart, txs, lk);
  const spend = new Map(spendByCategory(inRange(txs, from, to), lk).map((s) => [s.categoryId, s.amount]));

  // Hva hvert kategoribeløp er bygget opp av (fra budsjettplanen) – kun for månedsbudsjett
  const planByCategory = new Map<string, { total: number; items: Array<{ name: string; monthly: number }> }>();
  for (const it of planItems) {
    if (it.kind !== "expense" || !it.category_id) continue;
    const monthly = monthlyOf({ amount: it.amount, frequency: it.frequency });
    if (monthly <= 0) continue;
    const entry = planByCategory.get(it.category_id) ?? { total: 0, items: [] };
    entry.total += monthly;
    entry.items.push({ name: it.name, monthly });
    planByCategory.set(it.category_id, entry);
  }

  const rows: BudgetRow[] = categories
    .filter((c) => c.kind === "expense" && !c.archived_at)
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      planned: view.plan.get(c.id) ?? null,
      spent: Math.max(0, spend.get(c.id) ?? 0),
      plan: type === "month" ? planByCategory.get(c.id) : undefined,
    }));

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

  // Fremover: hva gjenstår per dag hvis resten fordeles jevnt (kun inneværende måned)
  let perDayNote: string | null = null;
  if (hasPlan && isCurrent && type === "month" && view.totalRemaining > 0) {
    const daysLeft = daysInMonth(periodStart.slice(0, 7)) - Number(today.slice(8, 10)) + 1;
    if (daysLeft > 0) perDayNote = `Fordeler du det som gjenstår jevnt, tilsvarer det omtrent ${formatMoney(view.totalRemaining / daysLeft, { currency })} per dag resten av måneden.`;
  }

  const periodLines = [...view.plan.entries()].map(([categoryId, amount]) => ({ categoryId, amount }));
  const groups = groupAmountsForBudget(periodLines, type === "month" ? planItems : [], lk);
  const savedSoFar = type === "month" ? totals(inRange(txs, from, to), lk).savings : null;

  const base = "/budsjett";
  const hrefFor = (p: string, t = type) => `${base}?type=${t === "week" ? "uke" : "maned"}&p=${t === "month" ? p.slice(0, 7) : p}`;
  const unplanned = view.plannedIncome != null ? view.plannedIncome - view.totalPlanned - (view.budget?.planned_saving ?? 0) : null;
  const copyFrom = view.inheritedFrom ?? (budgets.some((b) => b.period_type === type && b.period_start === prevStart) ? prevStart : null);
  const copyFromLabel = copyFrom ? (type === "month" ? monthName(copyFrom.slice(0, 7)) : `uke ${isoWeekNumber(copyFrom)}`) : null;

  const btn = "grid size-9 place-items-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink";

  return (
    <>
      <PageHeader
        title="Budsjett"
        description="Planlegg hva du vil bruke – og se hvordan det går."
        actions={
          <>
            <Button asChild variant={hasPlan ? "secondary" : "primary"}>
              <Link href="/budsjett/bygg">
                <Hammer /> {planItems.length > 0 ? "Juster planen" : "Bygg budsjettet"}
              </Link>
            </Button>
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
          </>
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

      {hasPlan && type === "month" && (
        <PlanOverview
          income={view.plannedIncome}
          expenses={view.totalPlanned}
          saving={view.budget?.planned_saving ?? null}
          need={groups.need}
          want={groups.want}
          savedSoFar={savedSoFar}
          periodWord={periodWord}
          currency={currency}
        />
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
            {perDayNote && <p>{perDayNote}</p>}
            {unplanned !== null && (
              <p>
                {unplanned >= 0 ? `${formatMoney(unplanned, { currency })} av forventet inntekt er ikke fordelt ennå – kan gå til sparing.` : `Du har planlagt ${formatMoney(-unplanned, { currency })} mer enn forventet inntekt.`}
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
            {type === "month" ? <Hammer className="size-6" /> : <CalendarDays className="size-6" />}
          </span>
          <h2 className="text-lg font-semibold">Ingen budsjett for {periodWord} ennå</h2>
          {type === "month" ? (
            <>
              <p className="max-w-md text-sm text-ink-2">Bygg budsjettet steg for steg: start med inntekten, legg til faste utgifter, sett rammer og bestem hvor mye du vil spare. Du trenger ingen transaksjoner for å komme i gang.</p>
              <Button asChild size="lg" className="mt-2">
                <Link href="/budsjett/bygg">
                  <Hammer /> Bygg budsjettet
                </Link>
              </Button>
            </>
          ) : (
            <p className="max-w-md text-sm text-ink-2">Skriv inn et beløp per kategori under, eller foreslå et ukebudsjett ut fra det du har brukt tidligere.</p>
          )}
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
        hasHistory={txs.length > 0}
      />
    </>
  );
}
