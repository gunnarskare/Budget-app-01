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
