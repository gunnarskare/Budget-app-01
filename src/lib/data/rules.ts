import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Catalog, HistoryEntry } from "@/lib/categorize/engine";
import { Catalog as CatalogClass } from "@/lib/categorize/engine";
import type { CategorizationRule } from "@/lib/types";
import { COLUMNS } from "./core";
import type { Category, Subcategory } from "@/lib/types";

export const RULE_COLUMNS =
  "id, pattern, match_type, direction, category_id, subcategory_id, mark_transfer, source, priority, hit_count, created_at";

export async function fetchRules(supabase: SupabaseClient): Promise<CategorizationRule[]> {
  const { data, error } = await supabase.from("categorization_rules").select(RULE_COLUMNS).order("priority").order("created_at");
  if (error) throw new Error("Kunne ikke hente regler");
  return (data ?? []) as unknown as CategorizationRule[];
}

/** Tidligere godkjente valg for gitte merchant-nøkler (kun transaksjoner brukeren selv har godkjent). */
export async function fetchHistory(supabase: SupabaseClient, keys: string[]): Promise<Map<string, HistoryEntry[]>> {
  const out = new Map<string, HistoryEntry[]>();
  const unique = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 150) {
    const chunk = unique.slice(i, i + 150);
    const { data, error } = await supabase
      .from("transactions")
      .select("merchant_key, category_id, subcategory_id")
      .eq("review_status", "user")
      .not("category_id", "is", null)
      .in("merchant_key", chunk)
      .limit(5000);
    if (error) throw new Error("Kunne ikke hente historikk");
    for (const r of (data ?? []) as Array<{ merchant_key: string; category_id: string; subcategory_id: string | null }>) {
      const list = out.get(r.merchant_key) ?? [];
      const hit = list.find((h) => h.categoryId === r.category_id && h.subcategoryId === r.subcategory_id);
      if (hit) hit.count++;
      else list.push({ categoryId: r.category_id, subcategoryId: r.subcategory_id, count: 1 });
      out.set(r.merchant_key, list);
    }
  }
  return out;
}

export function makeCatalog(categories: Category[], subcategories: Subcategory[]): Catalog {
  return new CatalogClass(categories, subcategories);
}

export { COLUMNS };
