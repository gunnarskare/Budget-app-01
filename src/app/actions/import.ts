"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, safe, type ActionResult } from "@/lib/action-result";
import { Catalog, categorize, statusForSource, type Suggestion } from "@/lib/categorize/engine";
import { cleanDescription } from "@/lib/csv/clean";
import { assignOccurrences, fingerprint } from "@/lib/csv/fingerprint";
import { getAiConfig, suggestWithAi } from "@/lib/data/ai";
import { getProfile, requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { refreshDerived } from "@/lib/data/derived";
import { fetchHistory, fetchRules } from "@/lib/data/rules";
import { applyTransferPairs, type FreshTx } from "@/lib/data/transfers";
import { buildDrafts } from "@/lib/import/drafts";
import { MAX_IMPORT_ROWS, type CommitResult, type PreviewResult, type PreviewRow } from "@/lib/import/types";

const uuid = z.uuid();

const rowBase = {
  line: z.number().int().min(0).max(10_000_000),
  date: z.iso.date(),
  description: z.string().trim().min(1).max(500),
  amount: z.number().finite().refine((v) => v !== 0 && Math.abs(v) < 1e11, "Ugyldig beløp"),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  balance: z.number().finite().nullable().optional(),
  bankType: z.string().max(80).nullable().optional(),
};

const previewSchema = z.object({
  accountId: uuid,
  rows: z.array(z.object(rowBase)).min(1).max(MAX_IMPORT_ROWS),
});

type Awaited2<T> = T extends Promise<infer U> ? U : never;
type Supabase = Awaited2<ReturnType<typeof requireUser>>["supabase"];

async function existingFingerprints(supabase: Supabase, accountId: string, from: string, to: string) {
  const exact = new Set<string>();
  const soft = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("transactions")
      .select("booked_date, amount, fingerprint, occurrence")
      .eq("account_id", accountId)
      .gte("booked_date", from)
      .lte("booked_date", to)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error("Kunne ikke sjekke duplikater");
    for (const r of (data ?? []) as Array<{ booked_date: string; amount: number; fingerprint: string; occurrence: number }>) {
      exact.add(`${r.fingerprint}#${r.occurrence}`);
      soft.add(`${r.booked_date}|${Number(r.amount).toFixed(2)}`);
    }
    if (!data || data.length < 1000) break;
  }
  return { exact, soft };
}

/**
 * Steg «Kategoriser»: foreslår kategori for hver rad (regler → historikk → butikk → nøkkelord → AI),
 * og markerer duplikater. Skriver ingenting til databasen.
 */
export async function previewImport(input: z.input<typeof previewSchema>): Promise<ActionResult<{ preview: PreviewResult }>> {
  return safe("previewImport", async () => {
    const parsed = previewSchema.safeParse(input);
    if (!parsed.success) return fail("Filen inneholder ugyldige rader. Gå tilbake og sjekk kolonnene.");
    const { accountId, rows } = parsed.data;
    const { supabase } = await requireUser();
    const profile = await getProfile();

    const { categories, subcategories } = await getCore();
    if (categories.length === 0) return fail("Kategoriene er ikke satt opp ennå. Gå gjennom oppstarten først.");
    const catalog = new Catalog(categories, subcategories);

    const { data: account } = await supabase.from("accounts").select("id").eq("id", accountId).maybeSingle();
    if (!account) return fail("Fant ikke kontoen.");

    const rules = await fetchRules(supabase);
    const history = await fetchHistory(supabase, rows.map((r) => cleanDescription(r.description).key));
    const ctx = { catalog, rules, history };
    const suggestions: Suggestion[] = rows.map((r) => categorize({ description: r.description, amount: r.amount }, ctx));

    // ---- AI for det som fortsatt er usikkert ----
    const aiConfig = getAiConfig();
    const aiAvailable = !!aiConfig && profile.ai_enabled;
    let aiUsed = false;
    let aiNote: string | null = null;
    if (aiAvailable && aiConfig) {
      const { results, error } = await suggestWithAi(
        rows.map((r, index) => ({ index, description: r.description, amount: r.amount, current: suggestions[index] })),
        catalog,
        aiConfig,
      );
      aiNote = error;
      for (const [index, ai] of results) {
        const current = suggestions[index];
        if (ai.confidence <= current.confidence) continue;
        aiUsed = true;
        suggestions[index] = {
          ...current,
          categoryId: ai.ref.categoryId ?? current.categoryId,
          subcategoryId: ai.ref.categoryId ? ai.ref.subcategoryId : current.subcategoryId,
          source: "ai",
          confidence: ai.confidence,
          reason: `AI-forslag (${Math.round(ai.confidence * 100)} % sikker)`,
          isSubscription: ai.subscription || current.isSubscription,
          // AI bekrefter aldri en overføring på egen hånd – bare foreslår
          transfer: ai.transfer && current.transfer === "none" ? "suggested" : current.transfer,
        };
      }
    }

    // ---- duplikater ----
    const dates = rows.map((r) => r.date).sort();
    const { exact, soft } = await existingFingerprints(supabase, accountId, dates[0], dates[dates.length - 1]);
    const withOcc = assignOccurrences(rows, (r) => fingerprint(accountId, r.date, r.amount, r.description));

    const out: PreviewRow[] = rows.map((r, index) => {
      const s = suggestions[index];
      const occ = withOcc[index];
      const duplicate = exact.has(`${occ.fingerprint}#${occ.occurrence}`)
        ? "exact"
        : soft.has(`${r.date}|${r.amount.toFixed(2)}`)
          ? "possible"
          : "none";
      return {
        index,
        categoryId: s.categoryId,
        subcategoryId: s.subcategoryId,
        transfer: s.transfer,
        source: s.source,
        confidence: s.confidence,
        reason: s.reason,
        display: s.display,
        merchantKey: s.merchantKey,
        isSubscription: s.isSubscription,
        isRefund: s.isRefund,
        duplicate,
        status: statusForSource(s.source, s.confidence) === "auto" ? "auto" : "review",
      };
    });

    return { ok: true, preview: { rows: out, aiUsed, aiAvailable, aiNote } };
  });
}

const commitRow = z.object({
  ...rowBase,
  raw: z
    .record(z.string().max(80), z.string().max(300))
    .refine((o) => Object.keys(o).length <= 40, "For mange kolonner"),
  categoryId: uuid.nullable(),
  subcategoryId: uuid.nullable(),
  transfer: z.enum(["none", "suggested", "confirmed"]),
  source: z.enum(["rule", "history", "merchant", "keyword", "ai", "manual", "default"]),
  confidence: z.number().min(0).max(1),
  approved: z.boolean(),
  include: z.boolean(),
  duplicate: z.enum(["none", "exact", "possible"]),
});

const commitSchema = z.object({
  accountId: uuid,
  filename: z.string().trim().min(1).max(255),
  bankProfile: z.string().max(60).nullable(),
  mapping: z.record(z.string(), z.unknown()).nullable(),
  /** Rader som ble hoppet over ved lesing av fila (feil, reservert, 0 kr) */
  skippedRows: z.number().int().min(0).max(1_000_000),
  rows: z.array(commitRow).min(1).max(MAX_IMPORT_ROWS),
  /** Valg brukeren vil at appen skal huske (lærte regler) */
  learn: z
    .array(z.object({ merchantKey: z.string().min(3).max(120), categoryId: uuid, subcategoryId: uuid.nullable() }))
    .max(1000),
});

/** Steg «Importer»: lagrer valgte rader som én importbatch. Kan angres i sin helhet. */
export async function commitImport(input: z.input<typeof commitSchema>): Promise<ActionResult<{ result: CommitResult }>> {
  return safe("commitImport", async () => {
    const parsed = commitSchema.safeParse(input);
    if (!parsed.success) return fail("Importen inneholder ugyldige data. Last opp filen på nytt.");
    const d = parsed.data;
    const { supabase, user } = await requireUser();
    const { categories, subcategories, lk } = await getCore();

    const { data: account } = await supabase.from("accounts").select("id, currency").eq("id", d.accountId).maybeSingle();
    if (!account) return fail("Fant ikke kontoen.");

    // Kategori-id-er må tilhøre brukeren; ukjente nullstilles heller enn å feile hele importen.
    const catIds = new Set(categories.map((c) => c.id));
    const subById = new Map(subcategories.map((s) => [s.id, s]));
    const clean = (categoryId: string | null, subcategoryId: string | null) => {
      if (!categoryId || !catIds.has(categoryId)) return { categoryId: null, subcategoryId: null };
      const sub = subcategoryId ? subById.get(subcategoryId) : undefined;
      return { categoryId, subcategoryId: sub && sub.category_id === categoryId ? subcategoryId : null };
    };

    const included = d.rows.filter((r) => r.include);
    if (included.length === 0) return fail("Ingen rader er valgt for import.");
    const excludedDuplicates = d.rows.filter((r) => !r.include && r.duplicate !== "none").length;

    const dates = included.map((r) => r.date).sort();
    const { data: batch, error: batchErr } = await supabase
      .from("import_batches")
      .insert({
        user_id: user.id,
        account_id: d.accountId,
        filename: d.filename,
        bank_profile: d.bankProfile,
        column_mapping: d.mapping,
        row_count: d.rows.length + d.skippedRows,
        date_from: dates[0],
        date_to: dates[dates.length - 1],
      })
      .select("id")
      .single();
    if (batchErr || !batch) return fail("Kunne ikke starte importen.");
    const batchId = (batch as { id: string }).id;

    try {
      const drafts = buildDrafts(
        included.map((r) => ({
          row: { date: r.date, description: r.description, amount: r.amount, currency: r.currency ?? (account as { currency: string }).currency, balance: r.balance, bankType: r.bankType, raw: r.raw },
          choice: {
            ...clean(r.categoryId, r.subcategoryId),
            transfer: r.transfer,
            source: r.source,
            confidence: r.confidence,
            approved: r.approved,
          },
        })),
        { accountId: d.accountId, batchId, source: "import" },
      );

      const fresh: FreshTx[] = [];
      let needsReview = 0;
      for (let i = 0; i < drafts.length; i += 400) {
        const chunk = drafts.slice(i, i + 400).map((x) => ({ ...x, user_id: user.id }));
        const { data, error } = await supabase
          .from("transactions")
          .upsert(chunk, { onConflict: "user_id,account_id,fingerprint,occurrence", ignoreDuplicates: true })
          .select("id, account_id, booked_date, amount, original_description, review_status");
        if (error) throw new Error("insert");
        const rows = (data ?? []) as unknown as Array<FreshTx & { review_status: string }>;
        fresh.push(...rows);
        needsReview += rows.filter((r) => r.review_status === "review").length;
      }

      const imported = fresh.length;
      const duplicates = excludedDuplicates + (included.length - imported);
      await supabase
        .from("import_batches")
        .update({ imported_count: imported, duplicate_count: duplicates, skipped_count: d.skippedRows })
        .eq("id", batchId);

      // Husk valg (lærte regler)
      if (d.learn.length > 0) {
        const rules = d.learn
          .map((l) => ({ ...clean(l.categoryId, l.subcategoryId), pattern: l.merchantKey.trim().toLowerCase() }))
          .filter((l) => l.categoryId)
          .map((l) => ({
            user_id: user.id,
            pattern: l.pattern,
            match_type: "contains" as const,
            direction: "any" as const,
            category_id: l.categoryId,
            subcategory_id: l.subcategoryId,
            source: "learned" as const,
          }));
        if (rules.length > 0) {
          await supabase.from("categorization_rules").upsert(rules, { onConflict: "user_id,match_type,pattern,direction" });
        }
      }

      await applyTransferPairs(supabase, fresh);
      await refreshDerived(supabase, user.id, lk);
      revalidatePath("/", "layout");
      return { ok: true, result: { batchId, imported, duplicates, skipped: d.skippedRows, needsReview } };
    } catch (e) {
      // Rull tilbake: sletting av batchen fjerner alle tilhørende transaksjoner (cascade).
      await supabase.from("import_batches").delete().eq("id", batchId);
      throw e;
    }
  });
}

/** Angre en hel import. */
export async function undoImport(batchId: string): Promise<ActionResult<{ removed: number }>> {
  return safe("undoImport", async () => {
    if (!uuid.safeParse(batchId).success) return fail("Ugyldig import.");
    const { supabase, user } = await requireUser();

    // Overføringsmotparter utenfor importen mister sin overføringsmarkering
    const { data: partners } = await supabase
      .from("transactions")
      .select("transfer_pair_id")
      .eq("import_batch_id", batchId)
      .not("transfer_pair_id", "is", null);
    const partnerIds = [...new Set((partners ?? []).map((p: { transfer_pair_id: string }) => p.transfer_pair_id))];

    const { data, error } = await supabase.rpc("undo_import_batch", { p_batch_id: batchId });
    if (error) return fail(error.code === "P0002" ? "Importen er allerede angret." : "Kunne ikke angre importen.");

    if (partnerIds.length > 0) {
      await supabase.from("transactions").update({ transfer_status: "none", transfer_pair_id: null }).in("id", partnerIds);
    }
    const { lk } = await getCore();
    await refreshDerived(supabase, user.id, lk);
    revalidatePath("/", "layout");
    return { ok: true, removed: typeof data === "number" ? data : 0 };
  });
}
