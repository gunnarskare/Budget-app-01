"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, safe, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/data/context";
import { crossedMilestone } from "@/lib/finance/goals";

const uuid = z.uuid();

const goalSchema = z.object({
  name: z.string().trim().min(1, "Gi målet et navn").max(80),
  icon: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  targetAmount: z.number().finite().positive("Målsummen må være større enn 0").max(999_999_999),
  currentAmount: z.number().finite().min(0).max(999_999_999).default(0),
  targetDate: z.iso.date().nullable().optional(),
  monthlyContribution: z.number().finite().min(0).max(99_999_999).default(0),
});

export async function createGoal(input: z.input<typeof goalSchema>): Promise<ActionResult<{ id: string }>> {
  return safe("createGoal", async () => {
    const parsed = goalSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ugyldige verdier.");
    const d = parsed.data;
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from("savings_goals")
      .insert({
        user_id: user.id,
        name: d.name,
        icon: d.icon,
        color: d.color,
        target_amount: d.targetAmount,
        current_amount: d.currentAmount,
        target_date: d.targetDate || null,
        monthly_contribution: d.monthlyContribution,
        completed_at: d.currentAmount >= d.targetAmount ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error || !data) return fail("Kunne ikke opprette sparemålet.");
    revalidatePath("/", "layout");
    return { ok: true, id: (data as { id: string }).id };
  });
}

export async function updateGoal(id: string, input: z.input<typeof goalSchema>): Promise<ActionResult> {
  return safe("updateGoal", async () => {
    const parsed = goalSchema.safeParse(input);
    if (!uuid.safeParse(id).success) return fail("Ugyldig sparemål.");
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ugyldige verdier.");
    const d = parsed.data;
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("savings_goals")
      .update({
        name: d.name,
        icon: d.icon,
        color: d.color,
        target_amount: d.targetAmount,
        current_amount: d.currentAmount,
        target_date: d.targetDate || null,
        monthly_contribution: d.monthlyContribution,
        completed_at: d.currentAmount >= d.targetAmount ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) return fail("Kunne ikke lagre endringene.");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  return safe("deleteGoal", async () => {
    if (!uuid.safeParse(id).success) return fail("Ugyldig sparemål.");
    const { supabase } = await requireUser();
    const { error } = await supabase.from("savings_goals").delete().eq("id", id);
    if (error) return fail("Kunne ikke slette sparemålet.");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

const contribSchema = z.object({
  goalId: uuid,
  amount: z.number().finite().refine((v) => v !== 0, "Beløpet må være ulikt 0").refine((v) => Math.abs(v) <= 99_999_999, "Beløpet er for stort"),
  note: z.string().trim().max(200).optional(),
});

/** Legg til (eller trekk fra) penger på et sparemål. Svaret forteller om en milepæl ble nådd (for feiring). */
export async function addContribution(
  input: z.input<typeof contribSchema>,
): Promise<ActionResult<{ before: number; after: number; milestone: 25 | 50 | 75 | 100 | null }>> {
  return safe("addContribution", async () => {
    const parsed = contribSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ugyldige verdier.");
    const { goalId, amount, note } = parsed.data;
    const { supabase } = await requireUser();

    const { data: before } = await supabase.from("savings_goals").select("current_amount, target_amount").eq("id", goalId).maybeSingle();
    if (!before) return fail("Fant ikke sparemålet.");
    const b = before as { current_amount: number; target_amount: number };

    const { data, error } = await supabase.rpc("add_goal_contribution", { p_goal_id: goalId, p_amount: amount, p_note: note ?? null });
    if (error) return fail("Kunne ikke legge til beløpet.");
    const after = Number((data as { current_amount: number }).current_amount);
    revalidatePath("/", "layout");
    return { ok: true, before: b.current_amount, after, milestone: crossedMilestone(b.target_amount, b.current_amount, after) };
  });
}
