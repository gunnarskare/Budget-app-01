import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction, TxLite } from "@/lib/types";
import { COLUMNS } from "./core";

const PAGE = 1000; // PostgREST returnerer maks 1 000 rader per kall

/** Henter alle transaksjoner i et datointervall (pagineres automatisk). */
export async function fetchTxLite(
  supabase: SupabaseClient,
  range: { from?: string; to?: string } = {},
): Promise<TxLite[]> {
  const out: TxLite[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("transactions")
      .select(COLUMNS.txLite)
      .order("booked_date", { ascending: false })
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (range.from) q = q.gte("booked_date", range.from);
    if (range.to) q = q.lte("booked_date", range.to);
    const { data, error } = await q;
    if (error) throw new Error("Kunne ikke hente transaksjoner");
    const rows = (data ?? []) as unknown as TxLite[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function fetchTransactionsFull(supabase: SupabaseClient, ids: string[]): Promise<Transaction[]> {
  if (ids.length === 0) return [];
  const out: Transaction[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("transactions").select(COLUMNS.txFull).in("id", ids.slice(i, i + 200));
    if (error) throw new Error("Kunne ikke hente transaksjoner");
    out.push(...((data ?? []) as unknown as Transaction[]));
  }
  return out;
}
