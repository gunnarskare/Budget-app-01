"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { fail, safe, type ActionResult } from "@/lib/action-result";
import { categoryBudgetLines, planTotals, type PlanLine } from "@/lib/budget/plan";
import { requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { refreshDerived } from "@/lib/data/derived";
import { fetchPlanItems } from "@/lib/data/loaders";
import { addMonths, isValidMonthKey, monthKeyOf, monthStart, todayISO } from "@/lib/dates";

const uuid = z.uuid();

const itemSchema = z.object({
  id: uuid.nullable(),
  slot: z.string().trim().min(1).max(60).nullable(),
  kind: z.enum(["income", "expense", "saving"]),
  nature: z.enum(["fixed", "variable"]),
  name: z.string().trim().min(1).max(80),
  categoryId: uuid.nullable(),
  subcategoryId: uuid.nullable(),
  amount: z.number().finite().positive().max(99_999_999),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  sortOrder: z.number().int().min(0).max(10_000),
});

const planSchema = z.object({
  /** Måneden planen gjelder fra («2026-11»). Senere måneder arver den. */
  month: z.string(),
  /** Alle poster med beløp. Poster som mangler her fjernes fra planen. */
  items: z.array(itemSchema).max(150),
  /** Månedlig sparing per sparemål */
  goals: z.array(z.object({ id: uuid, monthlyContribution: z.number().finite().min(0).max(99_999_999) })).max(50),
});

/**
 * Lagrer budsjettplanen og bruker den på en måned: postene lagres, og måneden får
 * forventet inntekt, planlagt sparing og kategorilinjer regnet ut fra postene.
 * Sparemålenes månedlige bidrag oppdateres samtidig.
 */
export async function savePlan(input: z.input<typeof planSchema>): Promise<ActionResult<{ month: string; lines: number }>> {
  return safe("savePlan", async () => {
    const parsed = planSchema.safeParse(input);
    if (!parsed.success) return fail("Ugyldige verdier.");
    const { month, items, goals } = parsed.data;

    const currentKey = monthKeyOf(todayISO());
    if (!isValidMonthKey(month) || month < addMonths(currentKey, -12) || month > addMonths(currentKey, 12)) return fail("Ugyldig måned.");

    const { supabase, user } = await requireUser();
    const { lk } = await getCore();

    // ---- validering mot brukerens egne kategorier ----
    const slots = new Set<string>();
    for (const it of items) {
      if (it.slot) {
        if (slots.has(it.slot)) return fail("Ugyldige verdier.");
        slots.add(it.slot);
      }
      const cat = it.categoryId ? lk.categories.get(it.categoryId) : undefined;
      if (it.categoryId && !cat) return fail("Ugyldige verdier.");
      if (it.kind === "expense" && cat?.kind !== "expense") return fail("Velg en utgiftskategori for alle utgiftsposter.");
      if (it.kind === "income" && cat && cat.kind !== "income") return fail("Inntekter må ligge i en inntektskategori.");
      if (it.subcategoryId) {
        const sub = lk.subcategories.get(it.subcategoryId);
        if (!sub || sub.category_id !== it.categoryId) return fail("Ugyldige verdier.");
      }
    }

    // ---- postene: lagre nye/endrede først, fjern de som er borte til slutt ----
    const existing = await fetchPlanItems(supabase);
    const byId = new Map(existing.map((e) => [e.id, e]));
    const bySlot = new Map(existing.filter((e) => e.slot).map((e) => [e.slot as string, e]));

    const keep = new Set<string>();
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    for (const it of items) {
      const id = it.id && byId.has(it.id) ? it.id : it.slot ? (bySlot.get(it.slot)?.id ?? null) : null;
      if (id && keep.has(id)) return fail("Ugyldige verdier.");
      const row = {
        user_id: user.id,
        kind: it.kind,
        nature: it.nature,
        slot: it.slot,
        name: it.name,
        category_id: it.categoryId,
        subcategory_id: it.subcategoryId,
        amount: it.amount,
        frequency: it.frequency,
        sort_order: it.sortOrder,
      };
      if (id) {
        keep.add(id);
        updates.push({ id, ...row });
      } else {
        inserts.push(row);
      }
    }
    if (updates.length > 0) {
      const { error } = await supabase.from("budget_plan_items").upsert(updates, { onConflict: "id" });
      if (error) return fail("Kunne ikke lagre budsjettplanen.");
    }
    if (inserts.length > 0) {
      const { error } = await supabase.from("budget_plan_items").insert(inserts);
      if (error) return fail("Kunne ikke lagre budsjettplanen.");
    }
    const stale = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
    if (stale.length > 0) {
      const { error } = await supabase.from("budget_plan_items").delete().in("id", stale);
      if (error) return fail("Kunne ikke lagre budsjettplanen.");
    }

    // ---- sparemål ----
    const goalRows = goals.map((g) => ({ id: g.id, monthly: Math.round(g.monthlyContribution) }));
    const goalResults = await Promise.all(goalRows.map(async (g) => (await supabase.from("savings_goals").update({ monthly_contribution: g.monthly }).eq("id", g.id)).error));
    if (goalResults.some(Boolean)) return fail("Kunne ikke oppdatere sparemålene.");
    const goalSaving = goalRows.reduce((n, g) => n + g.monthly, 0);

    // ---- bruk planen på måneden ----
    const lines: PlanLine[] = items.map((it) => ({
      kind: it.kind,
      nature: it.nature,
      categoryId: it.categoryId,
      subcategoryId: it.subcategoryId,
      amount: it.amount,
      frequency: it.frequency,
    }));
    const totals = planTotals(lines, lk, goalSaving);
    const budgetLines = categoryBudgetLines(totals);

    // is_demo: false – et budsjett brukeren har bygget selv skal ikke forsvinne når eksempeldata fjernes
    const { data: b, error: bErr } = await supabase
      .from("budgets")
      .upsert(
        {
          user_id: user.id,
          period_type: "month",
          period_start: monthStart(month),
          planned_income: totals.income > 0 ? totals.income : null,
          planned_saving: totals.saving > 0 ? totals.saving : null,
          is_demo: false,
        },
        { onConflict: "user_id,period_type,period_start" },
      )
      .select("id")
      .single();
    if (bErr || !b) return fail("Kunne ikke lagre budsjettet.");
    const budgetId = (b as { id: string }).id;

    const rows = budgetLines.map((l) => ({ user_id: user.id, budget_id: budgetId, category_id: l.categoryId, amount: l.amount }));
    if (rows.length > 0) {
      const { error } = await supabase.from("budget_categories").upsert(rows, { onConflict: "budget_id,category_id" });
      if (error) return fail("Kunne ikke lagre budsjettlinjene.");
    }
    // Linjer for kategorier som ikke lenger er med i planen fjernes
    const cleanup = supabase.from("budget_categories").delete().eq("budget_id", budgetId);
    const { error: cleanErr } = rows.length > 0 ? await cleanup.not("category_id", "in", `(${rows.map((r) => r.category_id).join(",")})`) : await cleanup;
    if (cleanErr) return fail("Kunne ikke lagre budsjettlinjene.");

    after(async () => {
      try {
        await refreshDerived(supabase, user.id, lk);
      } catch {
        /* ikke kritisk */
      }
    });
    revalidatePath("/", "layout");
    return { ok: true, month, lines: rows.length };
  });
}
