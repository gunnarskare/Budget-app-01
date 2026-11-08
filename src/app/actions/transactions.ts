"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { fail, safe, type ActionResult } from "@/lib/action-result";
import { ruleFromChoice } from "@/lib/categorize/engine";
import { fingerprint } from "@/lib/csv/fingerprint";
import { cleanDescription } from "@/lib/csv/clean";
import { requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { refreshDerived } from "@/lib/data/derived";
import type { Transaction } from "@/lib/types";

const uuid = z.uuid();
const isoDate = z.iso.date();
const MAX_BULK = 500;

/** Beregn avledede data (innsikter m.m.) etter at svaret er sendt – gjør redigering rask. */
async function refreshLater(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string) {
  const { lk } = await getCore();
  after(async () => {
    try {
      await refreshDerived(supabase, userId, lk);
    } catch {
      /* ikke kritisk – beregnes på nytt ved neste endring */
    }
  });
}

/** Lagrer (eller oppdaterer) en lært regel av et valg. Returnerer true hvis regel ble laget. */
async function saveLearnedRule(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  merchantKey: string,
  categoryId: string | null,
  subcategoryId: string | null,
): Promise<boolean> {
  const rule = ruleFromChoice(merchantKey, { categoryId, subcategoryId });
  if (!rule) return false;
  const { error } = await supabase.from("categorization_rules").upsert(
    { user_id: userId, ...rule, source: "learned" },
    { onConflict: "user_id,match_type,pattern,direction" },
  );
  return !error;
}

const updateSchema = z.object({
  id: uuid,
  categoryId: uuid.nullable().optional(),
  subcategoryId: uuid.nullable().optional(),
  description: z.string().trim().min(1).max(500).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  /** Husk valget for fremtidige transaksjoner fra samme butikk */
  learn: z.boolean().optional(),
  /** Bruk valget på like transaksjoner som ikke er godkjent ennå */
  applyToSimilar: z.boolean().optional(),
});

export async function updateTransaction(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult<{ similarUpdated: number; ruleSaved: boolean; previous: { categoryId: string | null; subcategoryId: string | null } }>> {
  return safe("updateTransaction", async () => {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return fail("Ugyldige verdier.");
    const { id, categoryId, subcategoryId, description, note, learn, applyToSimilar } = parsed.data;
    const { supabase, user } = await requireUser();

    const { data: tx, error: readErr } = await supabase
      .from("transactions")
      .select("id, merchant_key, category_id, subcategory_id, review_status")
      .eq("id", id)
      .maybeSingle();
    if (readErr || !tx) return fail("Fant ikke transaksjonen.");
    const current = tx as { merchant_key: string; category_id: string | null; subcategory_id: string | null };

    const patch: Record<string, unknown> = {};
    if (description !== undefined) patch.description = description;
    if (note !== undefined) patch.note = note || null;

    const categoryChanged = categoryId !== undefined;
    if (categoryChanged) {
      patch.category_id = categoryId;
      patch.subcategory_id = categoryId ? (subcategoryId ?? null) : null;
      patch.category_source = "manual";
      patch.confidence = 1;
      patch.review_status = "user";
      patch.transfer_status = "none";
      patch.transfer_pair_id = null;
    }
    if (Object.keys(patch).length === 0) return fail("Ingen endringer.");

    const { error } = await supabase.from("transactions").update(patch).eq("id", id);
    if (error) return fail("Kunne ikke lagre endringen.");

    let similarUpdated = 0;
    let ruleSaved = false;
    if (categoryChanged && categoryId) {
      if (learn && current.merchant_key) {
        ruleSaved = await saveLearnedRule(supabase, user.id, current.merchant_key, categoryId, subcategoryId ?? null);
      }
      if (applyToSimilar && current.merchant_key) {
        const { data: updated } = await supabase
          .from("transactions")
          .update({
            category_id: categoryId,
            subcategory_id: subcategoryId ?? null,
            category_source: "rule",
            confidence: 0.99,
            review_status: "auto",
          })
          .eq("merchant_key", current.merchant_key)
          .neq("review_status", "user")
          .neq("id", id)
          .eq("transfer_status", "none")
          .select("id");
        similarUpdated = updated?.length ?? 0;
      }
    }

    if (categoryChanged) await refreshLater(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true, similarUpdated, ruleSaved, previous: { categoryId: current.category_id, subcategoryId: current.subcategory_id } };
  });
}

const bulkSchema = z.object({
  ids: z.array(uuid).min(1).max(MAX_BULK),
  categoryId: uuid,
  subcategoryId: uuid.nullable().optional(),
  learn: z.boolean().optional(),
});

/** Sett kategori for flere transaksjoner samtidig. */
export async function bulkUpdateCategory(input: z.input<typeof bulkSchema>): Promise<ActionResult<{ updated: number }>> {
  return safe("bulkUpdateCategory", async () => {
    const parsed = bulkSchema.safeParse(input);
    if (!parsed.success) return fail("Ugyldige verdier.");
    const { ids, categoryId, subcategoryId, learn } = parsed.data;
    const { supabase, user } = await requireUser();

    const { data, error } = await supabase
      .from("transactions")
      .update({
        category_id: categoryId,
        subcategory_id: subcategoryId ?? null,
        category_source: "manual",
        confidence: 1,
        review_status: "user",
        transfer_status: "none",
        transfer_pair_id: null,
      })
      .in("id", ids)
      .select("id, merchant_key");
    if (error) return fail("Kunne ikke oppdatere transaksjonene.");

    if (learn) {
      const keys = new Set((data ?? []).map((r: { merchant_key: string }) => r.merchant_key).filter(Boolean));
      for (const key of keys) await saveLearnedRule(supabase, user.id, key, categoryId, subcategoryId ?? null);
    }
    await refreshLater(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true, updated: data?.length ?? 0 };
  });
}

/** Godkjenn forslagene som de er (flytter dem ut av «Til godkjenning» og inn i historikken). */
export async function approveTransactions(ids: string[]): Promise<ActionResult<{ approved: number }>> {
  return safe("approveTransactions", async () => {
    const parsed = z.array(uuid).min(1).max(2000).safeParse(ids);
    if (!parsed.success) return fail("Ugyldige verdier.");
    const { supabase, user } = await requireUser();
    let approved = 0;
    for (let i = 0; i < parsed.data.length; i += MAX_BULK) {
      const { data, error } = await supabase
        .from("transactions")
        .update({ review_status: "user" })
        .in("id", parsed.data.slice(i, i + MAX_BULK))
        .select("id");
      if (error) return fail("Kunne ikke godkjenne.");
      approved += data?.length ?? 0;
    }
    await refreshLater(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true, approved };
  });
}

/** Angre en kategoriendring (tilbakestiller til forrige kategori). */
export async function restoreCategory(input: {
  id: string;
  categoryId: string | null;
  subcategoryId: string | null;
}): Promise<ActionResult> {
  return safe("restoreCategory", async () => {
    const parsed = z.object({ id: uuid, categoryId: uuid.nullable(), subcategoryId: uuid.nullable() }).safeParse(input);
    if (!parsed.success) return fail("Ugyldige verdier.");
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: parsed.data.categoryId, subcategory_id: parsed.data.subcategoryId, review_status: "review", category_source: "default", confidence: 0 })
      .eq("id", parsed.data.id);
    if (error) return fail("Kunne ikke angre.");
    await refreshLater(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function deleteTransactions(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  return safe("deleteTransactions", async () => {
    const parsed = z.array(uuid).min(1).max(MAX_BULK).safeParse(ids);
    if (!parsed.success) return fail("Ugyldige verdier.");
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.from("transactions").delete().in("id", parsed.data).select("id");
    if (error) return fail("Kunne ikke slette.");
    await refreshLater(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true, deleted: data?.length ?? 0 };
  });
}

/** Bekreft eller avvis foreslåtte interne overføringer (begge ledd oppdateres). */
export async function setTransfer(ids: string[], confirmed: boolean): Promise<ActionResult<{ updated: number }>> {
  return safe("setTransfer", async () => {
    const parsed = z.array(uuid).min(1).max(MAX_BULK).safeParse(ids);
    if (!parsed.success) return fail("Ugyldige verdier.");
    const { supabase, user } = await requireUser();

    const { data: rows } = await supabase.from("transactions").select("id, transfer_pair_id").in("id", parsed.data);
    const all = new Set<string>(parsed.data);
    for (const r of (rows ?? []) as Array<{ transfer_pair_id: string | null }>) if (r.transfer_pair_id) all.add(r.transfer_pair_id);

    const patch = confirmed
      ? { transfer_status: "confirmed" as const }
      : { transfer_status: "none" as const, transfer_pair_id: null };
    const { data, error } = await supabase.from("transactions").update(patch).in("id", [...all]).select("id");
    if (error) return fail("Kunne ikke oppdatere overføringen.");
    await refreshLater(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true, updated: data?.length ?? 0 };
  });
}

const manualSchema = z.object({
  accountId: uuid,
  date: isoDate,
  description: z.string().trim().min(1, "Skriv en beskrivelse").max(200),
  /** Positivt tall – retningen avgjøres av `kind` */
  amount: z.number().positive("Beløpet må være større enn 0").max(99_999_999),
  kind: z.enum(["expense", "income"]),
  categoryId: uuid.nullable(),
  subcategoryId: uuid.nullable().optional(),
  note: z.string().trim().max(1000).optional(),
});

async function nextOccurrence(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  accountId: string,
  fp: string,
  excludeId?: string,
): Promise<number> {
  let q = supabase.from("transactions").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("fingerprint", fp);
  if (excludeId) q = q.neq("id", excludeId);
  const { count } = await q;
  return (count ?? 0) + 1;
}

export async function createTransaction(input: z.input<typeof manualSchema>): Promise<ActionResult<{ id: string }>> {
  return safe("createTransaction", async () => {
    const parsed = manualSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ugyldige verdier.");
    const d = parsed.data;
    const { supabase, user } = await requireUser();
    const signed = d.kind === "expense" ? -Math.round(d.amount * 100) / 100 : Math.round(d.amount * 100) / 100;

    const { data: acc } = await supabase.from("accounts").select("id, currency").eq("id", d.accountId).maybeSingle();
    if (!acc) return fail("Fant ikke kontoen.");

    const clean = cleanDescription(d.description);
    const fp = fingerprint(d.accountId, d.date, signed, d.description);
    const occurrence = await nextOccurrence(supabase, d.accountId, fp);

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        account_id: d.accountId,
        source: "manual",
        booked_date: d.date,
        original_description: d.description,
        description: d.description,
        merchant_key: clean.key,
        amount: signed,
        currency: (acc as { currency: string }).currency,
        category_id: d.categoryId,
        subcategory_id: d.categoryId ? (d.subcategoryId ?? null) : null,
        category_source: "manual",
        confidence: 1,
        review_status: "user",
        note: d.note || null,
        fingerprint: fp,
        occurrence,
      })
      .select("id")
      .single();
    if (error || !data) return fail("Kunne ikke lagre transaksjonen.");
    await refreshLater(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true, id: (data as { id: string }).id };
  });
}

const editManualSchema = manualSchema.extend({ id: uuid });

/** Manuelt registrerte transaksjoner kan redigeres fullt ut (importerte kan ikke endres på beløp/dato). */
export async function updateManualTransaction(input: z.input<typeof editManualSchema>): Promise<ActionResult> {
  return safe("updateManualTransaction", async () => {
    const parsed = editManualSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ugyldige verdier.");
    const d = parsed.data;
    const { supabase, user } = await requireUser();

    const { data: existing } = await supabase.from("transactions").select("id, source").eq("id", d.id).maybeSingle();
    if (!existing || (existing as { source: string }).source !== "manual") return fail("Bare manuelt registrerte transaksjoner kan redigeres fullt ut.");

    const signed = d.kind === "expense" ? -Math.round(d.amount * 100) / 100 : Math.round(d.amount * 100) / 100;
    const clean = cleanDescription(d.description);
    const fp = fingerprint(d.accountId, d.date, signed, d.description);
    const occurrence = await nextOccurrence(supabase, d.accountId, fp, d.id);

    const { error } = await supabase
      .from("transactions")
      .update({
        account_id: d.accountId,
        booked_date: d.date,
        original_description: d.description,
        description: d.description,
        merchant_key: clean.key,
        amount: signed,
        category_id: d.categoryId,
        subcategory_id: d.categoryId ? (d.subcategoryId ?? null) : null,
        category_source: "manual",
        confidence: 1,
        review_status: "user",
        note: d.note || null,
        fingerprint: fp,
        occurrence,
      })
      .eq("id", d.id);
    if (error) return fail("Kunne ikke lagre endringene.");
    await refreshLater(supabase, user.id);
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

const drillSchema = z.object({
  categoryId: uuid.nullable(),
  subcategoryId: uuid.nullable().optional(),
  from: isoDate,
  to: isoDate,
});

/** Transaksjonene bak et tall (brukes når man trykker på en kategori i rapporter/dashboard). */
export async function getCategoryTransactions(
  input: z.input<typeof drillSchema>,
): Promise<ActionResult<{ rows: Array<Pick<Transaction, "id" | "booked_date" | "description" | "amount" | "category_id" | "subcategory_id" | "account_id">>; truncated: boolean }>> {
  return safe("getCategoryTransactions", async () => {
    const parsed = drillSchema.safeParse(input);
    if (!parsed.success) return fail("Ugyldige verdier.");
    const { supabase } = await requireUser();
    let q = supabase
      .from("transactions")
      .select("id, booked_date, description, amount, category_id, subcategory_id, account_id")
      .gte("booked_date", parsed.data.from)
      .lte("booked_date", parsed.data.to)
      .neq("transfer_status", "confirmed")
      .order("booked_date", { ascending: false })
      .limit(201);
    q = parsed.data.categoryId ? q.eq("category_id", parsed.data.categoryId) : q.is("category_id", null);
    if (parsed.data.subcategoryId) q = q.eq("subcategory_id", parsed.data.subcategoryId);
    const { data, error } = await q;
    if (error) return fail("Kunne ikke hente transaksjonene.");
    const rows = (data ?? []) as unknown as Array<Pick<Transaction, "id" | "booked_date" | "description" | "amount" | "category_id" | "subcategory_id" | "account_id">>;
    return { ok: true, rows: rows.slice(0, 200), truncated: rows.length > 200 };
  });
}

