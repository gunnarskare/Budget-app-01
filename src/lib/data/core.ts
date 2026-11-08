import "server-only";
import { cache } from "react";
import { buildLookups, type Account, type Category, type Subcategory } from "@/lib/types";
import { requireUser } from "./context";

export const COLUMNS = {
  category: "id, system_key, name, icon, color, kind, sort_order, archived_at",
  subcategory: "id, category_id, system_key, name, is_saving, sort_order",
  account: "id, name, bank, account_number_last4, kind, currency, opening_balance, is_demo, archived_at",
  txLite: "id, account_id, booked_date, amount, description, merchant_key, category_id, subcategory_id, transfer_status, review_status",
  txFull:
    "id, account_id, import_batch_id, source, booked_date, original_description, description, merchant_key, amount, currency, balance_after, bank_type, category_id, subcategory_id, category_source, confidence, review_status, transfer_status, transfer_pair_id, note, created_at",
} as const;

/** Kategorier, underkategorier og kontoer – brukes på nesten alle sider. Hentes én gang per forespørsel. */
export const getCore = cache(async () => {
  const { supabase } = await requireUser();
  const [cats, subs, accts] = await Promise.all([
    supabase.from("categories").select(COLUMNS.category).order("sort_order").order("name"),
    supabase.from("subcategories").select(COLUMNS.subcategory).order("sort_order").order("name"),
    supabase.from("accounts").select(COLUMNS.account).order("created_at"),
  ]);
  const err = cats.error ?? subs.error ?? accts.error;
  if (err) throw new Error("Kunne ikke hente kategorier og kontoer");
  const categories = (cats.data ?? []) as unknown as Category[];
  const subcategories = (subs.data ?? []) as unknown as Subcategory[];
  const accounts = (accts.data ?? []) as unknown as Account[];
  return { categories, subcategories, accounts, lk: buildLookups(categories, subcategories, accounts) };
});
