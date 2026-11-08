"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { fail, safe, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { refreshDerived } from "@/lib/data/derived";
import { fetchBudgets } from "@/lib/data/loaders";
import { fetchTxLite } from "@/lib/data/transactions";
import { addMonths, monthKeyOf, monthStart, todayISO } from "@/lib/dates";
import { suggestBudget, type SuggestionResult } from "@/lib/finance/budget";
import { isValidISO } from "@/lib/dates";
import type { PeriodType } from "@/lib/types";

const uuid = z.uuid();
const period = z.object({ periodType: z.enum(["month", "week"]), periodStart: z.iso.date() });

function validPeriod(type: PeriodType, start: string): boolean {
  if (!isValidISO(start)) return false;
  const d = new Date(`${start}T00:00:00Z`);
  return type === "month" ? d.getUTCDate() === 1 : d.getUTCDay() === 1;
}

type Sb = Awaited<ReturnType<typeof requireUser>>["supabase"];

/**
 * Sørger for at perioden har et eget budsjett. Mangler det, opprettes det og linjene
 * kopieres fra forrige budsjett (copy-on-write), slik at endringer ikke «tømmer» budsjettet.
 */
async function ensureBudget(supabase: Sb, userId: string, type: PeriodType, start: string): Promise<string> {
  const { budgets, lines } = await fetchBudgets(supabase);
  const exact = budgets.find((b) => b.period_type === type && b.period_start === start);
  if (exact) return exact.id;

  const previous = budgets.filter((b) => b.period_type === type && b.period_start < start).sort((a, b) => b.period_start.localeCompare(a.period_start))[0];
  const { data, error } = await supabase
    .from("budgets")
    .insert({ user_id: userId, period_type: type, period_start: start, planned_income: previous?.planned_income ?? null })
    .select("id")
    .single();
  if (error || !data) throw new Error("budget insert");
  const id = (data as { id: string }).id;
  if (previous) {
    const copy = lines.filter((l) => l.budget_id === previous.id).map((l) => ({ user_id: userId, budget_id: id, category_id: l.category_id, amount: l.amount }));
    if (copy.length > 0) await supabase.from("budget_categories").insert(copy);
  }
  return id;
}

async function refreshLater(supabase: Sb, userId: string) {
  const { lk } = await getCore();
  after(async () => {
    try {
      await refreshDerived(supabase, userId, lk);
    } catch {
      /* ikke kritisk */
    }
  });
}

const amountSchema = z.object({ categoryId: uuid, amount: z.number().finite().min(0).max(99_999_999) }).and(period);

/** Sett planlagt beløp for én kategori (0 fjerner linjen). */
export async function setBudgetAmount(input: z.input<typeof amountSchema>): Promise<ActionResult> {
  return safe("setBudgetAmount", async () => {
    const parsed = amountSchema.safeParse(input);
    if (!parsed.success || !validPeriod(parsed.data.periodType, parsed.data.periodStart)) return fail("Ugyldige verdier.");
    const d = parsed.data;
    const { supabase, user } = await requireUser();
    const budgetId = await ensureBudget(supabase, user.id, d.periodType, d.periodStart);
    if (d.amount === 0) {
      await supabase.from("budget_categories").delete().eq("budget_id", budgetId).eq("category_id", d.categoryId);
    } else {
      const { error } = await supabase
        .from("budget_categories")
        .upsert({ user_id: user.id, budget_id: budgetId, category_id: d.categoryId, amount: Math.round(d.amount) }, { onConflict: "budget_id,category_id" });
      if (error) return fail("Kunne ikke lagre budsjettet.");
    }
    await refreshLater(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

const incomeSchema = z.object({ plannedIncome: z.number().finite().min(0).max(99_999_999).nullable() }).and(period);

export async function setPlannedIncome(input: z.input<typeof incomeSchema>): Promise<ActionResult> {
  return safe("setPlannedIncome", async () => {
    const parsed = incomeSchema.safeParse(input);
    if (!parsed.success || !validPeriod(parsed.data.periodType, parsed.data.periodStart)) return fail("Ugyldige verdier.");
    const { supabase, user } = await requireUser();
    const budgetId = await ensureBudget(supabase, user.id, parsed.data.periodType, parsed.data.periodStart);
    const { error } = await supabase.from("budgets").update({ planned_income: parsed.data.plannedIncome }).eq("id", budgetId);
    if (error) return fail("Kunne ikke lagre inntekten.");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

const copySchema = z.object({ periodType: z.enum(["month", "week"]), fromStart: z.iso.date(), toStart: z.iso.date() });

/** Kopier budsjettet fra en tidligere periode (erstatter linjene i målperioden). */
export async function copyBudget(input: z.input<typeof copySchema>): Promise<ActionResult<{ lines: number }>> {
  return safe("copyBudget", async () => {
    const parsed = copySchema.safeParse(input);
    if (!parsed.success || !validPeriod(parsed.data.periodType, parsed.data.fromStart) || !validPeriod(parsed.data.periodType, parsed.data.toStart)) {
      return fail("Ugyldige verdier.");
    }
    const { periodType, fromStart, toStart } = parsed.data;
    const { supabase, user } = await requireUser();
    const { budgets, lines } = await fetchBudgets(supabase);
    const from = budgets.find((b) => b.period_type === periodType && b.period_start === fromStart);
    if (!from) return fail("Fant ikke budsjettet du vil kopiere fra.");

    const { data: target, error } = await supabase
      .from("budgets")
      .upsert({ user_id: user.id, period_type: periodType, period_start: toStart, planned_income: from.planned_income }, { onConflict: "user_id,period_type,period_start" })
      .select("id")
      .single();
    if (error || !target) return fail("Kunne ikke opprette budsjettet.");
    const targetId = (target as { id: string }).id;
    await supabase.from("budget_categories").delete().eq("budget_id", targetId);
    const copy = lines.filter((l) => l.budget_id === from.id).map((l) => ({ user_id: user.id, budget_id: targetId, category_id: l.category_id, amount: l.amount }));
    if (copy.length > 0) {
      const { error: insErr } = await supabase.from("budget_categories").insert(copy);
      if (insErr) return fail("Kunne ikke kopiere budsjettlinjene.");
    }
    await refreshLater(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true, lines: copy.length };
  });
}

const applySchema = z
  .object({
    items: z.array(z.object({ categoryId: uuid, amount: z.number().finite().min(0).max(99_999_999) })).min(1).max(100),
    plannedIncome: z.number().finite().min(0).max(99_999_999).nullable().optional(),
  })
  .and(period);

/** Bruk budsjettforslag (fra historikken) på perioden. */
export async function applyBudgetSuggestions(input: z.input<typeof applySchema>): Promise<ActionResult<{ lines: number }>> {
  return safe("applyBudgetSuggestions", async () => {
    const parsed = applySchema.safeParse(input);
    if (!parsed.success || !validPeriod(parsed.data.periodType, parsed.data.periodStart)) return fail("Ugyldige verdier.");
    const d = parsed.data;
    const { supabase, user } = await requireUser();
    const { data: b, error } = await supabase
      .from("budgets")
      .upsert(
        { user_id: user.id, period_type: d.periodType, period_start: d.periodStart, ...(d.plannedIncome !== undefined ? { planned_income: d.plannedIncome } : {}) },
        { onConflict: "user_id,period_type,period_start" },
      )
      .select("id")
      .single();
    if (error || !b) return fail("Kunne ikke opprette budsjettet.");
    const budgetId = (b as { id: string }).id;
    await supabase.from("budget_categories").delete().eq("budget_id", budgetId);
    const rows = d.items.filter((i) => i.amount > 0).map((i) => ({ user_id: user.id, budget_id: budgetId, category_id: i.categoryId, amount: Math.round(i.amount) }));
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("budget_categories").insert(rows);
      if (insErr) return fail("Kunne ikke lagre budsjettet.");
    }
    await refreshLater(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true, lines: rows.length };
  });
}

/** Foreslår realistiske budsjetter ut fra de siste 3–6 månedene med transaksjoner. */
export async function getBudgetSuggestions(): Promise<ActionResult<{ result: SuggestionResult }>> {
  return safe("getBudgetSuggestions", async () => {
    const { supabase } = await requireUser();
    const { lk } = await getCore();
    const today = todayISO();
    const txs = await fetchTxLite(supabase, { from: monthStart(addMonths(monthKeyOf(today), -7)) });
    return { ok: true, result: suggestBudget(txs, lk, today) };
  });
}
