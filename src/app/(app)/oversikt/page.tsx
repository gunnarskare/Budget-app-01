import { ArrowDownLeft, ArrowUpRight, ClipboardCheck, PiggyBank } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BudgetIndicators } from "@/components/dashboard/budget-indicators";
import { GetStarted } from "@/components/dashboard/get-started";
import { HeroCard } from "@/components/dashboard/hero-card";
import { InsightsCard } from "@/components/dashboard/insights-card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { CumulativeChart, type DayPoint } from "@/components/charts/cumulative-chart";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { SpendDonut } from "@/components/charts/spend-donut";
import { MonthSwitcher } from "@/components/month-switcher";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { getProfile, requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { countReview, countTransactions, fetchBudgets, fetchInsights, fetchRecurring } from "@/lib/data/loaders";
import { fetchTxLite } from "@/lib/data/transactions";
import { addMonths, daysInMonth, isValidMonthKey, monthEnd, monthKeyOf, monthStart, todayISO } from "@/lib/dates";
import { dailyCumulativeExpenses, inMonth, monthlyTotals, spendByCategory, totals } from "@/lib/finance/aggregate";
import { buildBudgetView } from "@/lib/finance/budget";
import { buildSlices } from "@/lib/finance/donut";
import { forecastMonth } from "@/lib/finance/forecast";
import { formatMoney, monthName, monthShort } from "@/lib/format";

export const metadata: Metadata = { title: "Oversikt" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const { supabase } = await requireUser();
  const profile = await getProfile();
  const { currency } = profile;
  const { categories, subcategories, accounts, lk } = await getCore();

  const today = todayISO();
  const currentKey = monthKeyOf(today);
  const monthKey = m && isValidMonthKey(m) && m <= currentKey ? m : currentKey;
  const prevKey = addMonths(monthKey, -1);

  const txCount = await countTransactions(supabase);
  if (txCount === 0) {
    return (
      <>
        <PageHeader title={profile.display_name ? `Hei, ${profile.display_name}!` : "Velkommen!"} description="Her får du full oversikt så fort du har lagt inn noen transaksjoner." />
        <GetStarted accounts={accounts} categories={categories} subcategories={subcategories} />
      </>
    );
  }

  const [txs, recurringAll, { budgets, lines }, insights, reviewCount] = await Promise.all([
    fetchTxLite(supabase, { from: monthStart(addMonths(monthKey, -5)), to: monthEnd(monthKey) }),
    fetchRecurring(supabase),
    fetchBudgets(supabase),
    fetchInsights(supabase),
    countReview(supabase),
  ]);
  const recurring = recurringAll.filter((r) => r.status === "active");
  const monthTxs = inMonth(txs, monthKey);
  const t = totals(monthTxs, lk);
  const prev = totals(inMonth(txs, prevKey), lk);
  const forecast = forecastMonth({ txs, lk, monthKey, today, recurring });
  const isCurrent = monthKey === currentKey;

  // Forventet inntektsdato (til forklaringstekst)
  const incomeDue = recurring
    .filter((r) => r.typical_amount > 0 && r.next_expected && r.next_expected.startsWith(monthKey) && r.next_expected >= today)
    .sort((a, b) => (a.next_expected ?? "").localeCompare(b.next_expected ?? ""))[0];

  // Diagramdata
  const slices = buildSlices(spendByCategory(monthTxs, lk), lk);
  const total = slices.reduce((n, s) => n + s.amount, 0);
  const from = monthStart(monthKey);
  const to = monthEnd(monthKey);
  const donut = slices.map((s) => ({
    ...s,
    href: s.other || !s.categoryId ? undefined : `/transaksjoner?kategori=${s.categoryId}&fra=${from}&til=${to}`,
  }));

  const monthsList = Array.from({ length: 6 }, (_, i) => addMonths(monthKey, i - 5));
  const bars = monthlyTotals(txs, lk, monthsList).map((x) => ({ month: x.month, label: monthShort(x.month), income: x.income, expenses: x.expenses }));

  const throughDay = isCurrent ? Number(today.slice(8, 10)) : daysInMonth(monthKey);
  const cur = dailyCumulativeExpenses(txs, lk, monthKey, throughDay);
  const prv = dailyCumulativeExpenses(txs, lk, prevKey);
  const days: DayPoint[] = cur.map((c, i) => ({ day: i + 1, current: c, previous: prv[i] ?? null }));

  const budget = buildBudgetView(budgets, lines, "month", from, txs, lk);

  return (
    <>
      <PageHeader
        title={profile.display_name ? `Hei, ${profile.display_name}!` : "Oversikt"}
        description="Slik ligger økonomien din an."
        actions={<MonthSwitcher monthKey={monthKey} currentKey={currentKey} basePath="/oversikt" />}
      />

      {reviewCount > 0 && (
        <Link
          href="/transaksjoner?visning=godkjenning"
          className="mb-5 flex items-center gap-3 rounded-2xl border border-warn-fill/40 bg-warn-soft px-4 py-3 text-sm text-warn transition-colors hover:brightness-95"
        >
          <ClipboardCheck className="size-5 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            <strong className="font-semibold">{reviewCount.toLocaleString("nb-NO")} transaksjoner</strong> venter på godkjenning – det tar bare et øyeblikk.
          </span>
          <span className="font-medium underline">Gå gjennom</span>
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] lg:gap-5">
        <HeroCard
          monthKey={monthKey}
          isCurrent={isCurrent}
          available={isCurrent ? forecast.availableNow : t.available}
          projected={forecast.projectedAvailable}
          confidence={forecast.confidence}
          elapsedDays={forecast.elapsedDays}
          daysInMonth={forecast.daysInMonth}
          expectedIncome={forecast.expectedIncomeRemaining}
          expectedIncomeDate={incomeDue?.next_expected ?? null}
          basisMonths={forecast.basisMonths}
        />
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <StatTile
            label={`Inntekt i ${monthName(monthKey)}`}
            value={formatMoney(t.income, { currency })}
            sub={`Forrige måned: ${formatMoney(prev.income, { currency })}`}
            icon={<ArrowDownLeft />}
            tone="pos"
          />
          <StatTile
            label={`Utgifter i ${monthName(monthKey)}`}
            value={formatMoney(t.expenses, { currency })}
            sub={`Forrige måned: ${formatMoney(prev.expenses, { currency })}`}
            icon={<ArrowUpRight />}
            tone="neg"
          />
          <StatTile
            label="Sparing denne måneden"
            value={formatMoney(t.savings, { currency })}
            sub={t.income > 0 ? `${Math.round((t.savings / t.income) * 100)} % av inntekten` : "Overføringer til sparing"}
            icon={<PiggyBank />}
            tone="brand"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <InsightsCard insights={insights} limit={4} description="Basert på dine egne tall" moreHref="/rapporter" />
        </div>
        <SpendDonut slices={donut} total={total} description={`Utgifter i ${monthName(monthKey)}`} />
        <BudgetIndicators lines={budget.lines} lk={lk} currency={currency} inheritedNote={budget.inheritedFrom ? `Bruker budsjettet fra ${monthName(budget.inheritedFrom.slice(0, 7))}` : null} />
        <IncomeExpenseChart data={bars} />
        <CumulativeChart
          data={days}
          currentName={monthName(monthKey)}
          previousName={monthName(prevKey)}
          budgetTotal={budget.totalPlanned > 0 ? budget.totalPlanned : null}
          endDay={isCurrent ? throughDay : null}
        />
      </div>

      {isCurrent && forecast.confidence === "low" && (
        <Card className="mt-5 p-4 text-sm text-ink-2">
          Prognosen er foreløpig – den blir mer treffsikker etter hvert som du har flere dager og måneder med transaksjoner.
        </Card>
      )}
    </>
  );
}
