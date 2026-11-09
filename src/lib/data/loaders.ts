import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Budget,
  BudgetCategory,
  BudgetPlanItem,
  FinancialInsight,
  ImportBatch,
  RecurringTransaction,
  SavingsGoal,
} from "@/lib/types";

const RECURRING_COLUMNS =
  "id, merchant_key, display_name, category_id, subcategory_id, typical_amount, frequency, occurrences, first_seen, last_seen, next_expected, is_subscription, status";

export async function fetchBudgets(supabase: SupabaseClient): Promise<{ budgets: Budget[]; lines: BudgetCategory[] }> {
  const [b, l] = await Promise.all([
    supabase.from("budgets").select("id, period_type, period_start, planned_income, planned_saving, is_demo").order("period_start", { ascending: false }).limit(300),
    supabase.from("budget_categories").select("id, budget_id, category_id, amount").limit(10000),
  ]);
  if (b.error || l.error) throw new Error("Kunne ikke hente budsjett");
  return { budgets: (b.data ?? []) as unknown as Budget[], lines: (l.data ?? []) as unknown as BudgetCategory[] };
}

/** Budsjettplanen: postene (inntekt, utgift, sparing) budsjettet er bygget opp av. */
export async function fetchPlanItems(supabase: SupabaseClient): Promise<BudgetPlanItem[]> {
  const { data, error } = await supabase
    .from("budget_plan_items")
    .select("id, kind, nature, slot, name, category_id, subcategory_id, amount, frequency, sort_order")
    .order("sort_order")
    .order("created_at")
    .limit(500);
  if (error) throw new Error("Kunne ikke hente budsjettplanen");
  return (data ?? []) as unknown as BudgetPlanItem[];
}

export async function fetchRecurring(supabase: SupabaseClient): Promise<RecurringTransaction[]> {
  const { data, error } = await supabase.from("recurring_transactions").select(RECURRING_COLUMNS).order("typical_amount");
  if (error) throw new Error("Kunne ikke hente gjentakende betalinger");
  return (data ?? []) as unknown as RecurringTransaction[];
}

export async function fetchInsights(supabase: SupabaseClient): Promise<FinancialInsight[]> {
  const { data, error } = await supabase
    .from("financial_insights")
    .select("id, insight_key, kind, severity, confidence, period, title, body, data, sort_order, dismissed_at")
    .is("dismissed_at", null)
    .order("sort_order")
    .limit(40);
  if (error) throw new Error("Kunne ikke hente innsikter");
  return (data ?? []) as unknown as FinancialInsight[];
}

export async function fetchGoals(supabase: SupabaseClient): Promise<SavingsGoal[]> {
  const { data, error } = await supabase
    .from("savings_goals")
    .select("id, name, icon, color, target_amount, current_amount, target_date, monthly_contribution, is_demo, completed_at, archived_at, created_at")
    .is("archived_at", null)
    .order("created_at");
  if (error) throw new Error("Kunne ikke hente sparemål");
  return (data ?? []) as unknown as SavingsGoal[];
}

export async function fetchImportBatches(supabase: SupabaseClient, limit = 50): Promise<ImportBatch[]> {
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, account_id, filename, bank_profile, row_count, imported_count, duplicate_count, skipped_count, date_from, date_to, status, undone_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Kunne ikke hente importhistorikk");
  return (data ?? []) as unknown as ImportBatch[];
}

export async function countReview(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("review_status", "review");
  return count ?? 0;
}

export async function countTransactions(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true });
  return count ?? 0;
}
