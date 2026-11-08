import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findTransferPairs, type TransferCandidate } from "@/lib/categorize/transfers";
import { addDays } from "@/lib/dates";

export interface FreshTx {
  id: string;
  account_id: string;
  booked_date: string;
  amount: number;
  original_description: string;
}

const toCandidate = (t: FreshTx): TransferCandidate => ({
  id: t.id,
  accountId: t.account_id,
  date: t.booked_date,
  amount: t.amount,
  description: t.original_description,
});

/**
 * Finner mulige interne overføringer blant nye transaksjoner (mot nye og eksisterende) og markerer dem:
 *  – tydelig overføringstekst → «confirmed» (telles ikke som inntekt/utgift)
 *  – ellers → «suggested» (brukeren får spørsmål; teller som vanlig til de svarer)
 * Slår aldri sammen eller sletter noe.
 */
export async function applyTransferPairs(supabase: SupabaseClient, fresh: FreshTx[]): Promise<number> {
  if (fresh.length === 0) return 0;
  const dates = fresh.map((t) => t.booked_date).sort();
  const from = addDays(dates[0], -2);
  const to = addDays(dates[dates.length - 1], 2);

  const pool = new Map<string, FreshTx>(fresh.map((t) => [t.id, t]));
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, account_id, booked_date, amount, original_description")
      .eq("transfer_status", "none")
      .gte("booked_date", from)
      .lte("booked_date", to)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error("Kunne ikke lete etter overføringer");
    for (const t of (data ?? []) as unknown as FreshTx[]) pool.set(t.id, t);
    if (!data || data.length < 1000) break;
  }

  const pairs = findTransferPairs(fresh.map(toCandidate), [...pool.values()].map(toCandidate));
  for (const p of pairs.slice(0, 200)) {
    const status = p.strong ? "confirmed" : "suggested";
    const a = await supabase.from("transactions").update({ transfer_status: status, transfer_pair_id: p.inId }).eq("id", p.outId);
    const b = await supabase.from("transactions").update({ transfer_status: status, transfer_pair_id: p.outId }).eq("id", p.inId);
    if (a.error || b.error) throw new Error("Kunne ikke lagre overføring");
  }
  return pairs.length;
}
