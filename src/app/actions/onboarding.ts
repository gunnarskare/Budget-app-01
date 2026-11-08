"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, safe, type ActionResult } from "@/lib/action-result";
import { Catalog, categorize, type EngineContext } from "@/lib/categorize/engine";
import { COLUMNS } from "@/lib/data/core";
import { requireUser } from "@/lib/data/context";
import { refreshDerived } from "@/lib/data/derived";
import { seedDefaultCategories } from "@/lib/data/seed";
import { applyTransferPairs, type FreshTx } from "@/lib/data/transfers";
import { addMonths, monthKeyOf, monthStart, todayISO } from "@/lib/dates";
import { DEMO_GOALS, generateDemoRows } from "@/lib/demo";
import { suggestBudget } from "@/lib/finance/budget";
import { buildDrafts, choiceFromSuggestion } from "@/lib/import/drafts";
import { buildLookups, type Account, type Category, type Subcategory, type TxLite } from "@/lib/types";
import { fetchTxLite } from "@/lib/data/transactions";

const CURRENCIES = ["NOK", "EUR", "SEK", "DKK", "USD", "GBP"] as const;

const startSchema = z.object({
  name: z.string().trim().max(80).optional(),
  currency: z.enum(CURRENCIES).default("NOK"),
});

/** Steg 1–2: navn og valuta. Oppretter standard kategorisystem og en første konto. */
export async function startOnboarding(input: z.input<typeof startSchema>): Promise<ActionResult> {
  return safe("startOnboarding", async () => {
    const parsed = startSchema.safeParse(input);
    if (!parsed.success) return fail("Sjekk valgene dine og prøv igjen.");
    const { supabase, user } = await requireUser();

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: parsed.data.name || null, currency: parsed.data.currency })
      .eq("id", user.id);
    if (error) return fail("Kunne ikke lagre profilen.");

    await seedDefaultCategories(supabase, user.id);

    const { count } = await supabase.from("accounts").select("id", { count: "exact", head: true });
    if (!count) {
      const { error: accErr } = await supabase
        .from("accounts")
        .insert({ user_id: user.id, name: "Brukskonto", kind: "checking", currency: parsed.data.currency });
      if (accErr) return fail("Kunne ikke opprette konto.");
    }
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function completeOnboarding(): Promise<ActionResult> {
  return safe("completeOnboarding", async () => {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id);
    if (error) return fail("Kunne ikke fullføre oppsettet.");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

/** Laster inn realistiske eksempeldata (to kontoer, 7 måneder, budsjett og sparemål). Kan fjernes igjen. */
export async function seedDemoData(): Promise<ActionResult<{ transactions: number }>> {
  return safe("seedDemoData", async () => {
    const { supabase, user } = await requireUser();
    await seedDefaultCategories(supabase, user.id);

    // Start rent hvis eksempeldata finnes fra før
    await supabase.rpc("delete_demo_data");

    const { data: cats } = await supabase.from("categories").select("id, system_key, name, icon, color, kind, sort_order, archived_at");
    const { data: subs } = await supabase.from("subcategories").select("id, category_id, system_key, name, is_saving, sort_order");
    const categories = (cats ?? []) as unknown as Category[];
    const subcategories = (subs ?? []) as unknown as Subcategory[];
    const catalog = new Catalog(categories, subcategories);
    const ctx: EngineContext = { catalog, rules: [], history: new Map() };

    const today = todayISO();
    const { data: accs, error: accErr } = await supabase
      .from("accounts")
      .insert([
        { user_id: user.id, name: "Brukskonto (eksempel)", bank: "Eksempelbanken", kind: "checking", is_demo: true, opening_balance: 8500 },
        { user_id: user.id, name: "Sparekonto (eksempel)", bank: "Eksempelbanken", kind: "savings", is_demo: true, opening_balance: 15000 },
      ])
      .select("id, kind");
    if (accErr || !accs) return fail("Kunne ikke opprette eksempelkontoer.");
    const checking = (accs as Array<{ id: string; kind: string }>).find((a) => a.kind === "checking")!.id;
    const savings = (accs as Array<{ id: string; kind: string }>).find((a) => a.kind === "savings")!.id;

    const rows = generateDemoRows(today);
    const fresh: FreshTx[] = [];
    for (const [accountId, kind] of [
      [checking, "checking"],
      [savings, "savings"],
    ] as const) {
      const own = rows.filter((r) => r.account === kind);
      const items = own.map((r) => ({
        row: { date: r.date, description: r.description, amount: r.amount },
        choice: choiceFromSuggestion(categorize({ description: r.description, amount: r.amount }, ctx)),
      }));
      const drafts = buildDrafts(items, { accountId, batchId: null, source: "demo" });
      for (let i = 0; i < drafts.length; i += 500) {
        const { data, error } = await supabase
          .from("transactions")
          .insert(drafts.slice(i, i + 500).map((d) => ({ ...d, user_id: user.id })))
          .select("id, account_id, booked_date, amount, original_description");
        if (error) return fail("Kunne ikke lagre eksempeltransaksjoner.");
        fresh.push(...((data ?? []) as unknown as FreshTx[]));
      }
    }
    await applyTransferPairs(supabase, fresh);

    // ---- budsjett (forslag fra dataene) for inneværende og to forrige måneder ----
    const { data: allAccounts } = await supabase.from("accounts").select(COLUMNS.account);
    const lk = buildLookups(categories, subcategories, (allAccounts ?? []) as unknown as Account[]);
    const txs: TxLite[] = await fetchTxLite(supabase);
    const sug = suggestBudget(txs, lk, today);
    const currentKey = monthKeyOf(today);
    for (const key of [addMonths(currentKey, -2), addMonths(currentKey, -1), currentKey]) {
      const { data: b, error } = await supabase
        .from("budgets")
        .upsert(
          { user_id: user.id, period_type: "month", period_start: monthStart(key), planned_income: sug.suggestedIncome, is_demo: true },
          { onConflict: "user_id,period_type,period_start" },
        )
        .select("id")
        .single();
      if (error || !b) continue;
      await supabase.from("budget_categories").upsert(
        sug.suggestions.map((s) => ({ user_id: user.id, budget_id: (b as { id: string }).id, category_id: s.categoryId, amount: s.suggested })),
        { onConflict: "budget_id,category_id" },
      );
    }

    // ---- sparemål ----
    await supabase.from("savings_goals").insert(
      DEMO_GOALS.map((g) => ({
        user_id: user.id,
        name: g.name,
        icon: g.icon,
        color: g.color,
        target_amount: g.target_amount,
        current_amount: g.current_amount,
        monthly_contribution: g.monthly_contribution,
        target_date: g.months_ahead ? `${addMonths(currentKey, g.months_ahead)}-${today.slice(8, 10)}` : null,
        is_demo: true,
      })),
    );

    await refreshDerived(supabase, user.id, lk);
    revalidatePath("/", "layout");
    return { ok: true, transactions: rows.length };
  });
}
