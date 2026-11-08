"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, safe, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/data/context";
import { getCore } from "@/lib/data/core";
import { refreshDerived } from "@/lib/data/derived";

const uuid = z.uuid();

const profileSchema = z.object({
  name: z.string().trim().max(80).optional(),
  currency: z.enum(["NOK", "EUR", "SEK", "DKK", "USD", "GBP"]),
  aiEnabled: z.boolean(),
});

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  return safe("updateProfile", async () => {
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return fail("Ugyldige verdier.");
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: parsed.data.name || null, currency: parsed.data.currency, ai_enabled: parsed.data.aiEnabled })
      .eq("id", user.id);
    if (error) return fail("Kunne ikke lagre innstillingene.");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

const accountSchema = z.object({
  name: z.string().trim().min(1, "Gi kontoen et navn").max(80),
  bank: z.string().trim().max(60).optional(),
  kind: z.enum(["checking", "savings", "credit", "investment", "cash"]),
  openingBalance: z.number().finite().min(-99_999_999).max(99_999_999).default(0),
});

export async function createAccount(input: z.input<typeof accountSchema>): Promise<ActionResult<{ id: string }>> {
  return safe("createAccount", async () => {
    const parsed = accountSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ugyldige verdier.");
    const { supabase, user } = await requireUser();
    const { data: profile } = await supabase.from("profiles").select("currency").eq("id", user.id).maybeSingle();
    const { data, error } = await supabase
      .from("accounts")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        bank: parsed.data.bank || null,
        kind: parsed.data.kind,
        opening_balance: parsed.data.openingBalance,
        currency: (profile as { currency?: string } | null)?.currency ?? "NOK",
      })
      .select("id")
      .single();
    if (error || !data) return fail("Kunne ikke opprette kontoen.");
    revalidatePath("/", "layout");
    return { ok: true, id: (data as { id: string }).id };
  });
}

export async function updateAccount(id: string, input: z.input<typeof accountSchema>): Promise<ActionResult> {
  return safe("updateAccount", async () => {
    const parsed = accountSchema.safeParse(input);
    if (!uuid.safeParse(id).success) return fail("Ugyldig konto.");
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Ugyldige verdier.");
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("accounts")
      .update({ name: parsed.data.name, bank: parsed.data.bank || null, kind: parsed.data.kind, opening_balance: parsed.data.openingBalance })
      .eq("id", id);
    if (error) return fail("Kunne ikke lagre endringene.");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function deleteAccount(id: string): Promise<ActionResult<{ deletedTransactions: number }>> {
  return safe("deleteAccount", async () => {
    if (!uuid.safeParse(id).success) return fail("Ugyldig konto.");
    const { supabase, user } = await requireUser();
    const { count } = await supabase.from("accounts").select("id", { count: "exact", head: true });
    if ((count ?? 0) <= 1) return fail("Du må beholde minst én konto.");
    const { count: txCount } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("account_id", id);
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) return fail("Kunne ikke slette kontoen.");
    const { lk } = await getCore();
    await refreshDerived(supabase, user.id, lk).catch(() => undefined);
    revalidatePath("/", "layout");
    return { ok: true, deletedTransactions: txCount ?? 0 };
  });
}

/** Slett alle transaksjoner og importhistorikk (kontoer, kategorier, budsjetter og sparemål beholdes). */
export async function deleteAllTransactions(): Promise<ActionResult<{ deleted: number }>> {
  return safe("deleteAllTransactions", async () => {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("delete_my_transactions");
    if (error) return fail("Kunne ikke slette transaksjonene.");
    revalidatePath("/", "layout");
    return { ok: true, deleted: typeof data === "number" ? data : 0 };
  });
}

export async function removeDemoData(): Promise<ActionResult> {
  return safe("removeDemoData", async () => {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.rpc("delete_demo_data");
    if (error) return fail("Kunne ikke fjerne eksempeldata.");
    const { lk } = await getCore();
    await refreshDerived(supabase, user.id, lk).catch(() => undefined);
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

/** Sletter kontoen og alle data for godt. Krever at brukeren har skrevet «slett». */
export async function deleteMyAccount(confirmation: string): Promise<ActionResult> {
  return safe("deleteMyAccount", async () => {
    if (confirmation.trim().toLowerCase() !== "slett") return fail("Skriv «slett» for å bekrefte.");
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("delete_my_account");
    if (error) return fail("Kunne ikke slette kontoen.");
    await supabase.auth.signOut();
    redirect("/login");
  });
}

export async function dismissInsight(id: string): Promise<ActionResult> {
  return safe("dismissInsight", async () => {
    if (!uuid.safeParse(id).success) return fail("Ugyldig innsikt.");
    const { supabase } = await requireUser();
    const { error } = await supabase.from("financial_insights").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
    if (error) return fail("Kunne ikke skjule innsikten.");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function setRecurringStatus(id: string, status: "active" | "ignored"): Promise<ActionResult> {
  return safe("setRecurringStatus", async () => {
    if (!uuid.safeParse(id).success) return fail("Ugyldig betaling.");
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("recurring_transactions").update({ status }).eq("id", id);
    if (error) return fail("Kunne ikke oppdatere.");
    const { lk } = await getCore();
    await refreshDerived(supabase, user.id, lk).catch(() => undefined);
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

/** Beregn innsikter og gjentakende betalinger på nytt. */
export async function refreshInsightsNow(): Promise<ActionResult> {
  return safe("refreshInsightsNow", async () => {
    const { supabase, user } = await requireUser();
    const { lk } = await getCore();
    await refreshDerived(supabase, user.id, lk);
    revalidatePath("/", "layout");
    return { ok: true };
  });
}
