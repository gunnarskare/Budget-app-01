import type { Metadata } from "next";
import Link from "next/link";
import { CategoryManager, type CategoryStat } from "@/components/categories/category-manager";
import { RulesManager } from "@/components/categories/rules-manager";
import { PageHeader } from "@/components/page-header";
import { getProfile, requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { fetchBudgets } from "@/lib/data/loaders";
import { fetchRules } from "@/lib/data/rules";
import { fetchTxLite } from "@/lib/data/transactions";
import { monthEnd, monthKeyOf, monthStart, todayISO } from "@/lib/dates";
import { spendByCategory, spendBySubcategory } from "@/lib/finance/aggregate";
import { resolveBudget } from "@/lib/finance/budget";
import { classify } from "@/lib/finance/classify";
import { monthName } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Kategorier" };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ fane?: string }> }) {
  const { fane } = await searchParams;
  const { supabase } = await requireUser();
  const { currency } = await getProfile();
  const { categories, subcategories, lk } = await getCore();
  const today = todayISO();
  const monthKey = monthKeyOf(today);
  const rulesTab = fane === "regler";

  const [txs, { budgets, lines }, rules] = await Promise.all([
    fetchTxLite(supabase, { from: monthStart(monthKey), to: monthEnd(monthKey) }),
    fetchBudgets(supabase),
    rulesTab ? fetchRules(supabase) : Promise.resolve([]),
  ]);

  const { plan } = resolveBudget(budgets, lines, "month", monthStart(monthKey));
  const spend = spendByCategory(txs, lk);
  const bySpend = new Map(spend.map((s) => [s.categoryId, s]));
  const stats: Record<string, CategoryStat> = {};
  for (const c of categories) {
    const s = bySpend.get(c.id);
    let amount = s?.amount ?? 0;
    let count = s?.count ?? 0;
    if (c.kind === "income") {
      // inntekt: summer inntektsbøtten for kategorien
      amount = 0;
      count = 0;
      for (const t of txs) {
        if (t.category_id !== c.id) continue;
        const cl = classify(t, lk);
        if (cl.bucket === "income") {
          amount += cl.value;
          count++;
        }
      }
    }
    stats[c.id] = {
      categoryId: c.id,
      spent: Math.round(amount * 100) / 100,
      share: s?.share ?? 0,
      count,
      planned: plan.get(c.id) ?? null,
      subs: spendBySubcategory(txs, lk, c.id),
    };
  }

  const tab = "inline-flex h-8 items-center rounded-[9px] px-3.5 text-[13px] font-medium text-ink-2";
  return (
    <>
      <PageHeader title="Kategorier" description={rulesTab ? "Regler som styrer hvordan transaksjoner kategoriseres." : `Forbruk og budsjettgrenser for ${monthName(monthKey)}.`} />
      <div role="tablist" aria-label="Visning" className="mb-5 inline-flex gap-1 rounded-ctl bg-surface-2 p-1">
        <Link role="tab" aria-selected={!rulesTab} href="/kategorier" className={cn(tab, !rulesTab && "bg-surface text-ink shadow-sm")}>
          Kategorier
        </Link>
        <Link role="tab" aria-selected={rulesTab} href="/kategorier?fane=regler" className={cn(tab, rulesTab && "bg-surface text-ink shadow-sm")}>
          Regler{rules.length > 0 ? ` (${rules.length})` : ""}
        </Link>
      </div>
      {rulesTab ? <RulesManager rules={rules} categories={categories} subcategories={subcategories} /> : <CategoryManager categories={categories} subcategories={subcategories} stats={stats} currency={currency} monthKey={monthKey} />}
    </>
  );
}
