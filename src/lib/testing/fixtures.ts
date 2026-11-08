// Felles testoppsett: en komplett «verden» bygget av eksempeldata uten database.
// Går gjennom nøyaktig samme kategorisering og overføringsparing som ekte import.

import { Catalog, categorize, statusFor, type EngineContext } from "@/lib/categorize/engine";
import { findTransferPairs } from "@/lib/categorize/transfers";
import { DEFAULT_TAXONOMY, subKey } from "@/lib/categories/defaults";
import { cleanDescription } from "@/lib/csv/clean";
import { generateDemoRows } from "@/lib/demo";
import { buildLookups, type Account, type Category, type Lookups, type Subcategory, type TxLite } from "@/lib/types";

export function makeCategories(): { categories: Category[]; subcategories: Subcategory[] } {
  const categories: Category[] = [];
  const subcategories: Subcategory[] = [];
  DEFAULT_TAXONOMY.forEach((c, ci) => {
    categories.push({ id: `cat-${c.key}`, system_key: c.key, name: c.name, icon: c.icon, color: c.color, kind: c.kind, sort_order: ci, archived_at: null });
    c.subs.forEach((s, si) =>
      subcategories.push({ id: `sub-${subKey(c.key, s.key)}`, category_id: `cat-${c.key}`, system_key: subKey(c.key, s.key), name: s.name, is_saving: !!s.saving, sort_order: si }),
    );
  });
  return { categories, subcategories };
}

export const ACCOUNTS: Account[] = [
  { id: "acc-checking", name: "Brukskonto", bank: "DNB", account_number_last4: null, kind: "checking", currency: "NOK", opening_balance: 0, is_demo: true, archived_at: null },
  { id: "acc-savings", name: "Sparekonto", bank: "DNB", account_number_last4: null, kind: "savings", currency: "NOK", opening_balance: 0, is_demo: true, archived_at: null },
];

export interface World {
  txs: Array<TxLite & { original: string }>;
  lk: Lookups;
  catalog: Catalog;
  ctx: EngineContext;
  today: string;
}

export function buildWorld(today = "2026-11-08", seed = 1337): World {
  const { categories, subcategories } = makeCategories();
  const catalog = new Catalog(categories, subcategories);
  const lk = buildLookups(categories, subcategories, ACCOUNTS);
  const ctx: EngineContext = { catalog, rules: [], history: new Map() };

  const txs: World["txs"] = generateDemoRows(today, seed).map((r, i) => {
    const s = categorize({ description: r.description, amount: r.amount }, ctx);
    const clean = cleanDescription(r.description);
    return {
      id: `t${i}`,
      account_id: r.account === "checking" ? "acc-checking" : "acc-savings",
      booked_date: r.date,
      amount: r.amount,
      description: clean.display,
      merchant_key: clean.key,
      category_id: s.categoryId,
      subcategory_id: s.subcategoryId,
      transfer_status: s.transfer,
      review_status: statusFor(s.confidence),
      original: r.description,
    };
  });

  const cands = txs.map((t) => ({ id: t.id, accountId: t.account_id, date: t.booked_date, amount: t.amount, description: t.original }));
  for (const p of findTransferPairs(cands, cands)) {
    if (!p.strong) continue;
    for (const t of txs) if (t.id === p.outId || t.id === p.inId) t.transfer_status = "confirmed";
  }
  return { txs, lk, catalog, ctx, today };
}
