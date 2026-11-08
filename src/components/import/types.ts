import type { CommitRow, PreviewInputRow, PreviewRow } from "@/lib/import/types";

/** Rad i importveiviseren: innlest rad + kategoriforslag + brukerens valg. */
export interface ReviewRow extends PreviewInputRow {
  index: number;
  raw: Record<string, string>;
  display: string;
  merchantKey: string;
  reason: string;
  isSubscription: boolean;
  isRefund: boolean;
  duplicate: PreviewRow["duplicate"];
  categoryId: CommitRow["categoryId"];
  subcategoryId: CommitRow["subcategoryId"];
  transfer: CommitRow["transfer"];
  source: CommitRow["source"];
  confidence: number;
  approved: boolean;
  include: boolean;
  /** Brukeren har selv valgt kategori for akkurat denne raden */
  edited: boolean;
}

export const needsAttention = (r: ReviewRow) => r.include && !r.approved && (r.source === "default" || r.confidence < 0.8 || r.transfer === "suggested");
