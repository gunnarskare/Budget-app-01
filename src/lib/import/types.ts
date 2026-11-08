// Typer delt mellom importveiviseren (nettleser) og importhandlingene (server).

import type { CategorySource, TransferStatus } from "@/lib/types";

export interface PreviewInputRow {
  line: number;
  date: string;
  description: string;
  amount: number;
  currency?: string;
  balance?: number | null;
  bankType?: string | null;
}

export type DuplicateKind = "none" | "exact" | "possible";

export interface PreviewRow {
  index: number;
  categoryId: string | null;
  subcategoryId: string | null;
  transfer: TransferStatus;
  source: CategorySource;
  confidence: number;
  reason: string;
  display: string;
  merchantKey: string;
  isSubscription: boolean;
  isRefund: boolean;
  duplicate: DuplicateKind;
  status: "auto" | "review";
}

export interface PreviewResult {
  rows: PreviewRow[];
  /** AI ble brukt på usikre rader */
  aiUsed: boolean;
  /** AI er konfigurert og slått på */
  aiAvailable: boolean;
  aiNote: string | null;
}

export interface CommitRow extends PreviewInputRow {
  raw: Record<string, string>;
  categoryId: string | null;
  subcategoryId: string | null;
  transfer: TransferStatus;
  source: CategorySource;
  confidence: number;
  /** Brukeren har endret eller godkjent kategorien */
  approved: boolean;
  /** Skal raden importeres? (duplikater er som regel av) */
  include: boolean;
  duplicate: DuplicateKind;
}

export interface CommitResult {
  batchId: string;
  imported: number;
  duplicates: number;
  skipped: number;
  needsReview: number;
}

export const MAX_IMPORT_ROWS = 5000;

/**
 * Største kropp en Server Action-forespørsel kan ha. Vercel avviser forespørsler over 4,5 MB, og
 * Server Actions legger noe overhead oppå JSON-størrelsen – derfor et godt stykke under.
 */
export const MAX_ACTION_BYTES = 3_600_000;

export const TOO_LARGE_MESSAGE =
  "Filen inneholder for mye data til å importeres i én operasjon. Del den opp i kortere perioder (for eksempel ett år om gangen) og importer dem hver for seg.";

/** Er nyttelasten for stor til å sendes til serveren? (kjøres i nettleseren før kallet) */
export function payloadTooLarge(payload: unknown): boolean {
  return new Blob([JSON.stringify(payload)]).size > MAX_ACTION_BYTES;
}
