// Fra importerte rader + kategorivalg til ferdige transaksjonsutkast klare for databasen.
// Brukes av både CSV-import, manuell registrering og eksempeldata.

import { cleanDescription } from "@/lib/csv/clean";
import { assignOccurrences, fingerprint } from "@/lib/csv/fingerprint";
import type { Suggestion } from "@/lib/categorize/engine";
import { statusForSource } from "@/lib/categorize/engine";
import type { CategorySource, ReviewStatus, TransactionSource, TransferStatus } from "@/lib/types";

export interface RowInput {
  date: string;
  /** Originalbeskrivelse fra banken – lagres uendret. */
  description: string;
  amount: number;
  currency?: string;
  balance?: number | null;
  bankType?: string | null;
  raw?: Record<string, string> | null;
}

export interface RowChoice {
  categoryId: string | null;
  subcategoryId: string | null;
  transfer: TransferStatus;
  source: CategorySource;
  confidence: number;
  /** Brukeren har endret eller eksplisitt godkjent kategorien. */
  approved: boolean;
}

export function choiceFromSuggestion(s: Suggestion, approved = false): RowChoice {
  return {
    categoryId: s.categoryId,
    subcategoryId: s.subcategoryId,
    transfer: s.transfer,
    source: s.source,
    confidence: s.confidence,
    approved,
  };
}

export interface TransactionDraft {
  account_id: string;
  import_batch_id: string | null;
  source: TransactionSource;
  booked_date: string;
  original_description: string;
  description: string;
  merchant_key: string;
  amount: number;
  currency: string;
  balance_after: number | null;
  bank_type: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  category_source: CategorySource;
  confidence: number;
  review_status: ReviewStatus;
  transfer_status: TransferStatus;
  fingerprint: string;
  occurrence: number;
  raw: Record<string, string> | null;
}

export function buildDrafts(
  items: Array<{ row: RowInput; choice: RowChoice }>,
  opts: { accountId: string; batchId: string | null; source: TransactionSource },
): TransactionDraft[] {
  const withOcc = assignOccurrences(items, ({ row }) => fingerprint(opts.accountId, row.date, row.amount, row.description));
  return withOcc.map(({ item, fingerprint: fp, occurrence }) => {
    const { row, choice } = item;
    const clean = cleanDescription(row.description);
    const manual = choice.approved && choice.source === "manual";
    return {
      account_id: opts.accountId,
      import_batch_id: opts.batchId,
      source: opts.source,
      booked_date: row.date,
      original_description: row.description.slice(0, 500),
      description: (clean.display || row.description).slice(0, 500),
      merchant_key: clean.key,
      amount: row.amount,
      currency: row.currency ?? "NOK",
      balance_after: row.balance ?? null,
      bank_type: row.bankType ?? null,
      category_id: choice.categoryId,
      subcategory_id: choice.subcategoryId,
      category_source: choice.source,
      confidence: Math.max(0, Math.min(1, choice.confidence)),
      review_status: choice.approved || manual ? "user" : statusForSource(choice.source, choice.confidence),
      transfer_status: choice.transfer,
      fingerprint: fp,
      occurrence,
      raw: row.raw ?? null,
    };
  });
}
