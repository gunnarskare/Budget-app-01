import type { Metadata } from "next";
import { BudgetBuilder, type BuilderRecurring } from "@/components/budget/budget-builder";
import type { BuilderGoal } from "@/components/budget/builder/goal-row";
import { PageHeader } from "@/components/page-header";
import { buildDraft } from "@/lib/budget/draft";
import type { PlanHistory } from "@/lib/budget/plan";
import { getProfile, requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { fetchBudgets, fetchGoals, fetchPlanItems, fetchRecurring } from "@/lib/data/loaders";
import { fetchTxLite } from "@/lib/data/transactions";
import { addMonths, monthKeyOf, monthStart, todayISO } from "@/lib/dates";
import { resolveBudget, suggestBudget } from "@/lib/finance/budget";

// Lagring av planen skriver til flere tabeller og kan ta noen sekunder.
export const maxDuration = 60;

export const metadata: Metadata = { title: "Bygg budsjett" };

export default async function BuildBudgetPage() {
  const { supabase } = await requireUser();
  const { currency } = await getProfile();
  const { categories, subcategories, lk } = await getCore();
  const today = todayISO();
  const currentMonth = monthKeyOf(today);

  const [planItems, goalRows, { budgets, lines }, recurringAll, txs] = await Promise.all([
    fetchPlanItems(supabase),
    fetchGoals(supabase),
    fetchBudgets(supabase),
    fetchRecurring(supabase),
    fetchTxLite(supabase, { from: monthStart(addMonths(currentMonth, -7)) }),
  ]);

  // Historikk er kun en valgfri pekepinn (referanse og realitetssjekk) – budsjettet bygges uten den.
  const suggestion = suggestBudget(txs, lk, today, 3);
  const history: PlanHistory | null =
    suggestion.months.length > 0 && !suggestion.usedPartialMonth
      ? { months: suggestion.months.length, average: Object.fromEntries(suggestion.suggestions.map((s) => [s.categoryId, Math.round(s.average)])) }
      : null;
  const historyIncome = history && suggestion.suggestedIncome ? suggestion.suggestedIncome : null;

  // Har brukeren et manuelt budsjett fra før (men ingen plan), tar vi det med som utgangspunkt.
  const current = resolveBudget(budgets, lines, "month", monthStart(currentMonth));
  const fallback =
    current.plan.size > 0 || (current.budget?.planned_income ?? 0) > 0
      ? { plannedIncome: current.budget?.planned_income ?? null, lines: [...current.plan.entries()].map(([categoryId, amount]) => ({ categoryId, amount })) }
      : null;

  const { draft, importedFromBudget } = buildDraft({ items: planItems, categories, subcategories, fallback });

  // Faste betalinger vi har funnet i transaksjonene tilbys som snarvei første gang planen bygges.
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const recurring: BuilderRecurring[] =
    planItems.length > 0
      ? []
      : recurringAll
          .filter((r) => r.status === "active" && r.typical_amount < 0 && r.category_id && lk.categories.get(r.category_id)?.kind === "expense")
          .filter((r) => !(r.subcategory_id && lk.subcategories.get(r.subcategory_id)?.is_saving))
          .sort((a, b) => Math.abs(b.typical_amount) - Math.abs(a.typical_amount))
          .slice(0, 12)
          .map((r) => ({
            id: r.id,
            name: r.display_name,
            categoryId: r.category_id as string,
            categoryName: categoryName.get(r.category_id as string) ?? "",
            subcategoryId: r.subcategory_id,
            amount: Math.abs(r.typical_amount),
            frequency: r.frequency,
          }));

  const goals: BuilderGoal[] = goalRows.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    color: g.color,
    targetAmount: g.target_amount,
    currentAmount: g.current_amount,
    targetDate: g.target_date,
    monthlyContribution: g.monthly_contribution,
    completed: !!g.completed_at,
  }));

  return (
    <>
      <PageHeader
        title={planItems.length > 0 ? "Juster budsjettplanen" : "Bygg budsjettet"}
        description="Fra inntekt og faste utgifter til sparing. Du trenger ingen transaksjoner for å komme i gang."
      />
      <BudgetBuilder
        initialDraft={draft}
        importedFromBudget={importedFromBudget}
        hasPlan={planItems.length > 0}
        categories={categories}
        subcategories={subcategories}
        goals={goals}
        recurring={recurring}
        history={history}
        historyIncome={historyIncome}
        currency={currency}
        today={today}
        currentMonth={currentMonth}
      />
    </>
  );
}
