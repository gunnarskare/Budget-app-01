// Hver transaksjon havner i nøyaktig én «bøtte». Dette er grunnlaget for alle tall i appen.
//
//  transfer – bekreftet intern overføring på brukskonto: telles ikke som inntekt/utgift
//  saving   – sparing/investering (underkategori med is_saving) eller bekreftet overføring INN på sparekonto
//  income   – kategori av typen «inntekt» (eller ukategorisert positivt beløp)
//  expense  – alt annet. Positivt beløp i en utgiftskategori er en refusjon og gir negativt forbruk.

import type { Lookups, TxLite } from "@/lib/types";

export type Bucket = "income" | "expense" | "saving" | "transfer";

export interface Classified {
  bucket: Bucket;
  /**
   * Beløp i «bøttens» retning:
   *  income  → positivt = inntekt
   *  expense → positivt = forbruk, negativt = refusjon
   *  saving  → positivt = spart, negativt = tatt ut
   *  transfer → alltid 0
   */
  value: number;
}

export function classify(
  tx: Pick<TxLite, "amount" | "category_id" | "subcategory_id" | "transfer_status" | "account_id">,
  lk: Lookups,
): Classified {
  if (tx.transfer_status === "confirmed") {
    const kind = lk.accounts.get(tx.account_id)?.kind;
    if (kind === "savings" || kind === "investment") return { bucket: "saving", value: tx.amount };
    return { bucket: "transfer", value: 0 };
  }

  const sub = tx.subcategory_id ? lk.subcategories.get(tx.subcategory_id) : undefined;
  if (sub?.is_saving) return { bucket: "saving", value: -tx.amount };

  const cat = tx.category_id ? lk.categories.get(tx.category_id) : undefined;
  if (cat?.kind === "income") return { bucket: "income", value: tx.amount };
  if (!cat) {
    return tx.amount > 0 ? { bucket: "income", value: tx.amount } : { bucket: "expense", value: -tx.amount };
  }
  return { bucket: "expense", value: -tx.amount };
}
