"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { fail, safe, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { refreshDerived } from "@/lib/data/derived";

const uuid = z.uuid();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Ugyldig farge");
const icon = z.string().trim().min(1).max(40);

const categorySchema = z.object({
  name: z.string().trim().min(1, "Gi kategorien et navn").max(60, "Navnet er for langt"),
  icon,
  color,
  kind: z.enum(["expense", "income"]),
});

export async function createCategory(input: z.input<typeof categorySchema>): Promise<ActionResult<{ id: string }>> {
  return safe("createCategory", async () => {
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ugyldige verdier.");
    const { supabase, user } = await requireUser();
    const { categories } = await getCore();
    const sort = Math.max(0, ...categories.map((c) => c.sort_order)) + 10;
    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: user.id, ...parsed.data, sort_order: sort })
      .select("id")
      .single();
    if (error || !data) return fail("Kunne ikke opprette kategorien.");
    revalidatePath("/", "layout");
    return { ok: true, id: (data as { id: string }).id };
  });
}

export async function updateCategory(id: string, input: z.input<typeof categorySchema>): Promise<ActionResult> {
  return safe("updateCategory", async () => {
    const parsed = categorySchema.safeParse(input);
    if (!uuid.safeParse(id).success || !parsed.success) return fail(parsed.success ? "Ugyldig kategori." : (parsed.error.issues[0]?.message ?? "Ugyldige verdier."));
    const { supabase } = await requireUser();
    const { error } = await supabase.from("categories").update(parsed.data).eq("id", id);
    if (error) return fail("Kunne ikke lagre endringene.");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

/** Sletter en kategori. Transaksjoner flyttes til `reassignTo` (påkrevd hvis kategorien er i bruk). */
export async function deleteCategory(id: string, reassignTo: string | null): Promise<ActionResult<{ moved: number }>> {
  return safe("deleteCategory", async () => {
    if (!uuid.safeParse(id).success || (reassignTo !== null && !uuid.safeParse(reassignTo).success)) return fail("Ugyldige verdier.");
    if (reassignTo === id) return fail("Velg en annen kategori å flytte transaksjonene til.");
    const { supabase, user } = await requireUser();
    const { lk } = await getCore();

    const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("category_id", id);
    if ((count ?? 0) > 0 && !reassignTo) return fail("Velg hvilken kategori transaksjonene skal flyttes til.");

    let moved = 0;
    if (reassignTo && (count ?? 0) > 0) {
      const { data, error } = await supabase
        .from("transactions")
        .update({ category_id: reassignTo, subcategory_id: null, review_status: "review" })
        .eq("category_id", id)
        .select("id");
      if (error) return fail("Kunne ikke flytte transaksjonene.");
      moved = data?.length ?? 0;
    }
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return fail("Kunne ikke slette kategorien.");
    after(async () => {
      try {
        const core = await getCore().catch(() => null);
        await refreshDerived(supabase, user.id, core?.lk ?? lk);
      } catch {
        /* ikke kritisk */
      }
    });
    revalidatePath("/", "layout");
    return { ok: true, moved };
  });
}

const subSchema = z.object({
  categoryId: uuid,
  name: z.string().trim().min(1, "Gi underkategorien et navn").max(60, "Navnet er for langt"),
  isSaving: z.boolean().optional(),
});

export async function createSubcategory(input: z.input<typeof subSchema>): Promise<ActionResult<{ id: string }>> {
  return safe("createSubcategory", async () => {
    const parsed = subSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ugyldige verdier.");
    const { supabase, user } = await requireUser();
    const { subcategories } = await getCore();
    const sort = Math.max(0, ...subcategories.filter((s) => s.category_id === parsed.data.categoryId).map((s) => s.sort_order)) + 10;
    const { data, error } = await supabase
      .from("subcategories")
      .insert({ user_id: user.id, category_id: parsed.data.categoryId, name: parsed.data.name, is_saving: parsed.data.isSaving ?? false, sort_order: sort })
      .select("id")
      .single();
    if (error || !data) return fail(error?.code === "23505" ? "Det finnes allerede en underkategori med det navnet." : "Kunne ikke opprette underkategorien.");
    revalidatePath("/", "layout");
    return { ok: true, id: (data as { id: string }).id };
  });
}

export async function renameSubcategory(id: string, name: string): Promise<ActionResult> {
  return safe("renameSubcategory", async () => {
    const n = z.string().trim().min(1).max(60).safeParse(name);
    if (!uuid.safeParse(id).success || !n.success) return fail("Ugyldige verdier.");
    const { supabase } = await requireUser();
    const { error } = await supabase.from("subcategories").update({ name: n.data }).eq("id", id);
    if (error) return fail(error.code === "23505" ? "Det finnes allerede en underkategori med det navnet." : "Kunne ikke lagre endringen.");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function deleteSubcategory(id: string): Promise<ActionResult> {
  return safe("deleteSubcategory", async () => {
    if (!uuid.safeParse(id).success) return fail("Ugyldig underkategori.");
    const { supabase } = await requireUser();
    const { error } = await supabase.from("subcategories").delete().eq("id", id);
    if (error) return fail("Kunne ikke slette underkategorien.");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

// ---------------- Regler ----------------

const ruleSchema = z.object({
  pattern: z.string().trim().toLowerCase().min(2, "Mønsteret må ha minst 2 tegn").max(80),
  matchType: z.enum(["contains", "equals", "starts_with"]).default("contains"),
  direction: z.enum(["any", "in", "out"]).default("any"),
  categoryId: uuid.nullable(),
  subcategoryId: uuid.nullable().optional(),
  markTransfer: z.boolean().optional(),
  applyToExisting: z.boolean().optional(),
});

export async function createRule(input: z.input<typeof ruleSchema>): Promise<ActionResult<{ applied: number }>> {
  return safe("createRule", async () => {
    const parsed = ruleSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ugyldige verdier.");
    const d = parsed.data;
    if (!d.categoryId && !d.markTransfer) return fail("Velg en kategori, eller marker regelen som intern overføring.");
    const { supabase, user } = await requireUser();

    const { error } = await supabase.from("categorization_rules").upsert(
      {
        user_id: user.id,
        pattern: d.pattern,
        match_type: d.matchType,
        direction: d.direction,
        category_id: d.categoryId,
        subcategory_id: d.categoryId ? (d.subcategoryId ?? null) : null,
        mark_transfer: !!d.markTransfer,
        source: "user",
        priority: 50,
      },
      { onConflict: "user_id,match_type,pattern,direction" },
    );
    if (error) return fail("Kunne ikke lagre regelen.");

    let applied = 0;
    if (d.applyToExisting) {
      const like = d.pattern.replace(/[\\%_]/g, (c) => `\\${c}`);
      const pat = d.matchType === "equals" ? like : d.matchType === "starts_with" ? `${like}%` : `%${like}%`;
      let q = supabase
        .from("transactions")
        .update(
          d.markTransfer
            ? { transfer_status: "confirmed", category_source: "rule", confidence: 0.99, review_status: "auto" }
            : { category_id: d.categoryId, subcategory_id: d.subcategoryId ?? null, category_source: "rule", confidence: 0.99, review_status: "auto", transfer_status: "none" },
        )
        .ilike("description", pat)
        .neq("review_status", "user");
      if (d.direction === "in") q = q.gt("amount", 0);
      if (d.direction === "out") q = q.lt("amount", 0);
      const { data } = await q.select("id");
      applied = data?.length ?? 0;
      if (applied > 0) {
        const { lk } = await getCore();
        after(async () => {
          try {
            await refreshDerived(supabase, user.id, lk);
          } catch {
            /* ikke kritisk */
          }
        });
      }
    }
    revalidatePath("/", "layout");
    return { ok: true, applied };
  });
}

export async function deleteRule(id: string): Promise<ActionResult> {
  return safe("deleteRule", async () => {
    if (!uuid.safeParse(id).success) return fail("Ugyldig regel.");
    const { supabase } = await requireUser();
    const { error } = await supabase.from("categorization_rules").delete().eq("id", id);
    if (error) return fail("Kunne ikke slette regelen.");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}
