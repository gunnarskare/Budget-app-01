// Typer som speiler databasen (se supabase/migrations). PostgREST returnerer
// numeric som JSON-tall, så beløp er `number` i appen.

export type CategoryKind = "expense" | "income";
export type AccountKind = "checking" | "savings" | "credit" | "investment" | "cash";
export type ReviewStatus = "auto" | "review" | "user";
export type TransferStatus = "none" | "suggested" | "confirmed";
export type CategorySource = "rule" | "history" | "merchant" | "keyword" | "ai" | "manual" | "default";
export type TransactionSource = "import" | "manual" | "demo";

export interface Profile {
  id: string;
  display_name: string | null;
  currency: string;
  ai_enabled: boolean;
  onboarded_at: string | null;
}

export interface Account {
  id: string;
  name: string;
  bank: string | null;
  account_number_last4: string | null;
  kind: AccountKind;
  currency: string;
  opening_balance: number;
  is_demo: boolean;
  archived_at: string | null;
}

export interface Category {
  id: string;
  system_key: string | null;
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
  sort_order: number;
  archived_at: string | null;
}

export interface Subcategory {
  id: string;
  category_id: string;
  system_key: string | null;
  name: string;
  is_saving: boolean;
  sort_order: number;
}

export interface Transaction {
  id: string;
  account_id: string;
  import_batch_id: string | null;
  source: TransactionSource;
  booked_date: string;
  original_description: string;
  description: string;
  merchant_key: string;
  amount: number;
  currency: string;
  balance_after: number | null;
  bank_type: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  category_source: CategorySource;
  confidence: number;
  review_status: ReviewStatus;
  transfer_status: TransferStatus;
  transfer_pair_id: string | null;
  note: string | null;
  created_at: string;
}

/** Slank variant brukt i beregninger. */
export type TxLite = Pick<
  Transaction,
  | "id"
  | "account_id"
  | "booked_date"
  | "amount"
  | "description"
  | "merchant_key"
  | "category_id"
  | "subcategory_id"
  | "transfer_status"
  | "review_status"
>;

export interface ImportBatch {
  id: string;
  account_id: string;
  filename: string;
  bank_profile: string | null;
  row_count: number;
  imported_count: number;
  duplicate_count: number;
  skipped_count: number;
  date_from: string | null;
  date_to: string | null;
  status: "imported" | "undone";
  undone_at: string | null;
  created_at: string;
}

export type PeriodType = "month" | "week";

export interface Budget {
  id: string;
  period_type: PeriodType;
  period_start: string;
  planned_income: number | null;
  /** Planlagt sparing i perioden (øyeblikksbilde fra budsjettplanen). */
  planned_saving: number | null;
  is_demo: boolean;
}

export type PlanKind = "income" | "expense" | "saving";
/** Faste utgifter har avtalt beløp (husleie, lån); variable er en ramme (mat, fritid). */
export type PlanNature = "fixed" | "variable";

/** En post i budsjettplanen. Beløpet gjelder per `frequency` og regnes om til måned i appen. */
export interface BudgetPlanItem {
  id: string;
  kind: PlanKind;
  nature: PlanNature;
  /** Nøkkel for forslagsradene i veiviseren («bolig.husleie»); null for egne poster */
  slot: string | null;
  name: string;
  category_id: string | null;
  subcategory_id: string | null;
  amount: number;
  frequency: Frequency;
  sort_order: number;
}

export interface BudgetCategory {
  id: string;
  budget_id: string;
  category_id: string;
  amount: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  icon: string;
  color: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  monthly_contribution: number;
  is_demo: boolean;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export type MatchType = "contains" | "equals" | "starts_with";
export type RuleDirection = "any" | "in" | "out";

export interface CategorizationRule {
  id: string;
  pattern: string;
  match_type: MatchType;
  direction: RuleDirection;
  category_id: string | null;
  subcategory_id: string | null;
  mark_transfer: boolean;
  source: "user" | "learned";
  priority: number;
  hit_count: number;
  created_at: string;
}

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringTransaction {
  id: string;
  merchant_key: string;
  display_name: string;
  category_id: string | null;
  subcategory_id: string | null;
  typical_amount: number;
  frequency: Frequency;
  occurrences: number;
  first_seen: string | null;
  last_seen: string | null;
  next_expected: string | null;
  is_subscription: boolean;
  status: "active" | "ignored" | "ended";
}

export type InsightSeverity = "good" | "info" | "warn" | "bad";

export interface FinancialInsight {
  id: string;
  insight_key: string;
  kind: string;
  severity: InsightSeverity;
  confidence: "low" | "medium" | "high";
  period: string | null;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  sort_order: number;
  dismissed_at: string | null;
}

/** Oppslag over kategorier/underkategorier/kontoer brukt av alle beregninger. */
export interface Lookups {
  categories: Map<string, Category>;
  subcategories: Map<string, Subcategory>;
  accounts: Map<string, Account>;
}

export function buildLookups(
  categories: Category[],
  subcategories: Subcategory[],
  accounts: Account[],
): Lookups {
  return {
    categories: new Map(categories.map((c) => [c.id, c])),
    subcategories: new Map(subcategories.map((s) => [s.id, s])),
    accounts: new Map(accounts.map((a) => [a.id, a])),
  };
}
