import { CalendarDays, FileBarChart, Gauge, PiggyBank, TrendingDown, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { SavingsChart } from "@/components/charts/savings-chart";
import { InsightsCard } from "@/components/dashboard/insights-card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { MonthSwitcher } from "@/components/month-switcher";
import { PageHeader } from "@/components/page-header";
import { CategoryBars, type BarItem } from "@/components/reports/category-bars";
import { RecurringCard, type RecurringItem } from "@/components/reports/recurring-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getProfile, requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { countTransactions, fetchInsights, fetchRecurring } from "@/lib/data/loaders";
import { fetchTxLite } from "@/lib/data/transactions";
import { addMonths, daysInMonth, dayOfMonth, isValidMonthKey, monthEnd, monthKeyOf, monthStart, monthsBetween, todayISO } from "@/lib/dates";
import { inMonth, inRange, monthlyTotals, spendByCategory, totals } from "@/lib/finance/aggregate";
import { classify } from "@/lib/finance/classify";
import { dataBasisNote } from "@/lib/finance/insights";
import { monthlyEquivalent } from "@/lib/finance/recurring";
import { formatMoney, monthLabel, monthName, monthShort, capitalize } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rapporter" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { currency } = await getProfile();
  const { lk } = await getCore();
  const today = todayISO();
  const currentKey = monthKeyOf(today);
  const year = one(sp.visning) === "ar";
  const tabCls = "inline-flex h-8 items-center rounded-[9px] px-3.5 text-[13px] font-medium text-ink-2";

  if ((await countTransactions(supabase)) === 0) {
    return (
      <>
        <PageHeader title="Rapporter" description="Analyser forbruket ditt på tvers av måneder og kategorier." />
        <Card>
          <EmptyState icon={<FileBarChart />} title="Ingen data å analysere ennå" description="Importer en bankfil eller last inn eksempeldata, så fyller rapportene seg med grafer, toppliste og gjentakende betalinger.">
            <Link href="/transaksjoner/import" className="inline-flex h-10 items-center rounded-ctl bg-primary px-4 text-sm font-medium text-primary-ink hover:bg-primary-hover">
              Importer CSV
            </Link>
          </EmptyState>
        </Card>
      </>
    );
  }

  const [recurringAll, insights] = await Promise.all([fetchRecurring(supabase), fetchInsights(supabase)]);
  const categoryName = (id: string | null) => (id ? lk.categories.get(id)?.name ?? null : null);
  const recurringItems: RecurringItem[] = recurringAll.map((r) => ({
    id: r.id,
    name: r.display_name,
    amount: r.typical_amount,
    frequency: r.frequency,
    monthly: monthlyEquivalent(r.typical_amount, r.frequency),
    nextExpected: r.next_expected,
    isSubscription: r.is_subscription,
    ignored: r.status === "ignored",
    categoryName: categoryName(r.category_id),
  }));

  const toBars = (spend: ReturnType<typeof spendByCategory>, prev?: Map<string | null, number>): BarItem[] =>
    spend
      .filter((s) => s.amount > 0)
      .map((s) => {
        const cat = s.categoryId ? lk.categories.get(s.categoryId) : undefined;
        return { id: s.categoryId, name: cat?.name ?? "Ukategorisert", icon: cat?.icon ?? "tag", color: cat?.color ?? "#898781", amount: s.amount, share: s.share, prev: prev ? (prev.get(s.categoryId) ?? 0) : null };
      });

  // ======================= ÅRSVISNING =======================
  if (year) {
    const y = /^\d{4}$/.test(one(sp.ar)) ? one(sp.ar) : today.slice(0, 4);
    const from = `${y}-01-01`;
    const lastMonth = y === today.slice(0, 4) ? currentKey : `${y}-12`;
    const to = monthEnd(lastMonth);
    const txs = await fetchTxLite(supabase, { from, to });
    const months = monthsBetween(`${y}-01`, lastMonth);
    const monthly = monthlyTotals(txs, lk, months);
    const t = totals(txs, lk);
    const savingsSeries: Array<{ month: string; label: string; saved: number; total: number }> = [];
    for (const m of monthly) {
      const previous = savingsSeries[savingsSeries.length - 1]?.total ?? 0;
      savingsSeries.push({ month: m.month, label: monthShort(m.month), saved: m.savings, total: previous + m.savings });
    }
    const spend = spendByCategory(txs, lk);
    const avgMonthly = monthly.length ? t.expenses / monthly.length : 0;

    return (
      <>
        <PageHeader
          title="Rapporter"
          description={`Hele ${y}. ${dataBasisNote(txs, today)}`}
          actions={
            <div role="tablist" aria-label="Periode" className="inline-flex gap-1 rounded-ctl bg-surface-2 p-1">
              <Link role="tab" aria-selected={false} href="/rapporter" className={tabCls}>
                Måned
              </Link>
              <Link role="tab" aria-selected className={cn(tabCls, "bg-surface text-ink shadow-sm")} href="/rapporter?visning=ar">
                År
              </Link>
            </div>
          }
        />
        <div className="mb-5 flex items-center gap-3 text-sm">
          <Link href={`/rapporter?visning=ar&ar=${Number(y) - 1}`} className="rounded-full border border-line bg-surface px-3.5 py-1.5 font-medium text-ink-2 hover:bg-surface-2">
            ← {Number(y) - 1}
          </Link>
          <span className="font-display text-lg font-semibold">{y}</span>
          {Number(y) < Number(today.slice(0, 4)) && (
            <Link href={`/rapporter?visning=ar&ar=${Number(y) + 1}`} className="rounded-full border border-line bg-surface px-3.5 py-1.5 font-medium text-ink-2 hover:bg-surface-2">
              {Number(y) + 1} →
            </Link>
          )}
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Inntekt" value={formatMoney(t.income, { currency })} icon={<TrendingUp />} tone="pos" />
          <StatTile label="Utgifter" value={formatMoney(t.expenses, { currency })} icon={<TrendingDown />} tone="neg" />
          <StatTile label="Spart" value={formatMoney(t.savings, { currency })} icon={<PiggyBank />} tone="brand" />
          <StatTile label="Snitt per måned" value={formatMoney(avgMonthly, { currency })} sub="utgifter" icon={<Gauge />} tone="brand" />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <IncomeExpenseChart data={monthly.map((m) => ({ month: m.month, label: monthShort(m.month), income: m.income, expenses: m.expenses }))} title="Inntekt og utgifter" description={`Per måned i ${y}`} />
          <SavingsChart data={savingsSeries} />
          <div className="lg:col-span-2">
            <CategoryBars items={toBars(spend)} from={from} to={to} currency={currency} title="Utgifter per kategori" description={`Hele ${y} – trykk for å se transaksjonene`} />
          </div>
          <RecurringCard items={recurringItems} currency={currency} title="Gjentakende betalinger" description="Faste utgifter og inntekter vi har funnet" />
          <RecurringCard items={recurringItems} currency={currency} onlySubscriptions title="Abonnementer" description="Tjenester du betaler for jevnlig" />
        </div>
      </>
    );
  }

  // ======================= MÅNEDSVISNING =======================
  const m = one(sp.m);
  const monthKey = isValidMonthKey(m) && m <= currentKey ? m : currentKey;
  const prevKey = addMonths(monthKey, -1);
  const isCurrent = monthKey === currentKey;
  const txs = await fetchTxLite(supabase, { from: monthStart(addMonths(monthKey, -12)), to: monthEnd(monthKey) });
  const monthTxs = inMonth(txs, monthKey);
  const t = totals(monthTxs, lk);
  const prevT = totals(inMonth(txs, prevKey), lk);
  const spend = spendByCategory(monthTxs, lk);
  const prevSpend = new Map(spendByCategory(inMonth(txs, prevKey), lk).map((s) => [s.categoryId, s.amount]));
  const elapsed = isCurrent ? dayOfMonth(today) : daysInMonth(monthKey);

  const biggest = monthTxs
    .map((tx) => ({ tx, c: classify(tx, lk) }))
    .filter(({ c }) => c.bucket === "expense" && c.value > 0)
    .sort((a, b) => b.c.value - a.c.value)
    .slice(0, 8);

  const last6 = monthlyTotals(txs, lk, monthsBetween(addMonths(monthKey, -5), monthKey));
  return (
    <>
      <PageHeader
        title="Rapporter"
        description={dataBasisNote(txs, today)}
        actions={
          <div role="tablist" aria-label="Periode" className="inline-flex gap-1 rounded-ctl bg-surface-2 p-1">
            <Link role="tab" aria-selected className={cn(tabCls, "bg-surface text-ink shadow-sm")} href="/rapporter">
              Måned
            </Link>
            <Link role="tab" aria-selected={false} href="/rapporter?visning=ar" className={tabCls}>
              År
            </Link>
          </div>
        }
      />
      <div className="mb-5">
        <MonthSwitcher monthKey={monthKey} currentKey={currentKey} basePath="/rapporter" />
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Utgifter" value={formatMoney(t.expenses, { currency })} sub={`Forrige måned: ${formatMoney(prevT.expenses, { currency })}`} icon={<TrendingDown />} tone="neg" />
        <StatTile label="Inntekt" value={formatMoney(t.income, { currency })} sub={`Forrige måned: ${formatMoney(prevT.income, { currency })}`} icon={<TrendingUp />} tone="pos" />
        <StatTile label="Spart" value={formatMoney(t.savings, { currency })} sub={`Forrige måned: ${formatMoney(prevT.savings, { currency })}`} icon={<PiggyBank />} tone="brand" />
        <StatTile label="Snitt per dag" value={formatMoney(elapsed > 0 ? t.expenses / elapsed : 0, { currency })} sub={`utgifter over ${elapsed} dager`} icon={<CalendarDays />} tone="brand" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <CategoryBars
          items={toBars(spend, prevSpend)}
          from={monthStart(monthKey)}
          to={monthEnd(monthKey)}
          currency={currency}
          title={`Utgifter i ${monthName(monthKey)}`}
          description="Trykk på en kategori for å se transaksjonene"
          compareLabel={`enn ${monthName(prevKey)}`}
        />
        <div className="space-y-5">
          <Card>
            <div className="px-5 pb-1 pt-5 sm:px-6 sm:pt-6">
              <h3 className="text-[15px] font-semibold">Største utgiftsposter</h3>
              <p className="mt-0.5 text-[13px] text-ink-2">I {monthName(monthKey)}</p>
            </div>
            <ul className="divide-y divide-line/70 px-5 pb-4 pt-2 sm:px-6">
              {biggest.length === 0 && <li className="py-6 text-center text-sm text-ink-2">Ingen utgifter denne måneden.</li>}
              {biggest.map(({ tx, c }, i) => (
                <li key={tx.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{tx.description}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {capitalize(tx.booked_date.slice(8, 10).replace(/^0/, ""))}. {monthShort(monthKey)} · {tx.category_id ? lk.categories.get(tx.category_id)?.name : "Ukategorisert"}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatMoney(c.value, { currency })}</span>
                </li>
              ))}
            </ul>
          </Card>
          <IncomeExpenseChart data={last6.map((x) => ({ month: x.month, label: monthShort(x.month), income: x.income, expenses: x.expenses }))} title="Utvikling" description={`Seks måneder til og med ${monthLabel(monthKey)}`} />
        </div>
        <RecurringCard items={recurringItems} currency={currency} title="Gjentakende betalinger" description="Faste utgifter og inntekter vi har funnet" />
        <RecurringCard items={recurringItems} currency={currency} onlySubscriptions title="Abonnementer" description="Tjenester du betaler for jevnlig" />
        <div className="lg:col-span-2">
          <InsightsCard insights={insights} title="Økonomiassistenten" description="Konkrete observasjoner basert på dine egne data" />
        </div>
      </div>
      {inRange(txs, monthStart(monthKey), monthEnd(monthKey)).length === 0 && <p className="mt-4 text-center text-sm text-ink-2">Ingen transaksjoner i {monthLabel(monthKey)}.</p>}
    </>
  );
}
