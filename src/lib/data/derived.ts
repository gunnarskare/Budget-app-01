import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, monthKeyOf, monthStart, todayISO } from "@/lib/dates";
import { buildBudgetView } from "@/lib/finance/budget";
import { forecastMonth } from "@/lib/finance/forecast";
import { generateInsights } from "@/lib/finance/insights";
import { detectRecurring } from "@/lib/finance/recurring";
import type { Lookups, RecurringTransaction } from "@/lib/types";
import { fetchBudgets, fetchRecurring } from "./loaders";
import { fetchTxLite } from "./transactions";

/**
 * Beregner avledede data på nytt: gjentakende betalinger og innsikter.
 * Kalles etter import, eksempeldata og endringer som påvirker tallene.
 * Avviste innsikter (dismissed) beholdes og dukker ikke opp igjen.
 */
export async function refreshDerived(supabase: SupabaseClient, userId: string, lk: Lookups): Promise<void> {
  const today = todayISO();
  const currentKey = monthKeyOf(today);
  const txs = await fetchTxLite(supabase, { from: monthStart(addMonths(currentKey, -13)) });

  // ---- gjentakende ----
  const detected = detectRecurring(txs, lk, today);
  const existing = await fetchRecurring(supabase);
  const ignored = new Set(existing.filter((r) => r.status === "ignored").map((r) => r.merchant_key));

  if (detected.length > 0) {
    const { error } = await supabase.from("recurring_transactions").upsert(
      detected.map((d) => ({
        user_id: userId,
        merchant_key: d.merchantKey,
        display_name: d.displayName.slice(0, 200),
        category_id: d.categoryId,
        subcategory_id: d.subcategoryId,
        typical_amount: d.typicalAmount,
        frequency: d.frequency,
        occurrences: d.occurrences,
        first_seen: d.firstSeen,
        last_seen: d.lastSeen,
        next_expected: d.nextExpected,
        is_subscription: d.isSubscription,
        status: ignored.has(d.merchantKey) ? "ignored" : d.status,
      })),
      { onConflict: "user_id,merchant_key" },
    );
    if (error) throw new Error("Kunne ikke lagre gjentakende betalinger");
  }
  const keep = new Set(detected.map((d) => d.merchantKey));
  const stale = existing.filter((r) => r.status !== "ignored" && !keep.has(r.merchant_key)).map((r) => r.id);
  if (stale.length > 0) await supabase.from("recurring_transactions").delete().in("id", stale);

  // ---- innsikter ----
  const recurring: RecurringTransaction[] = (await fetchRecurring(supabase)).filter((r) => r.status === "active");
  const { budgets, lines } = await fetchBudgets(supabase);
  const budget = buildBudgetView(budgets, lines, "month", monthStart(currentKey), txs, lk);
  const forecast = forecastMonth({ txs, lk, monthKey: currentKey, today, recurring });
  const drafts = generateInsights({ txs, lk, today, recurring, budget: budget.budget ? budget : null, forecast });

  await supabase.from("financial_insights").delete().is("dismissed_at", null);
  if (drafts.length > 0) {
    await supabase.from("financial_insights").upsert(
      drafts.map((d) => ({
        user_id: userId,
        insight_key: d.key,
        kind: d.kind,
        severity: d.severity,
        confidence: d.confidence,
        period: d.period,
        title: d.title.slice(0, 200),
        body: d.body.slice(0, 600),
        data: d.data ?? null,
        sort_order: d.sort,
      })),
      { onConflict: "user_id,insight_key", ignoreDuplicates: true },
    );
  }
}
