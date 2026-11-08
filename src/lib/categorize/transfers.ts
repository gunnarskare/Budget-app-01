// Finner mulige interne overføringer: like store, motsatte beløp på to ulike egne kontoer
// med noen få dagers mellomrom. Foreslår kun – slår aldri sammen eller skjuler noe automatisk.

import { diffDays } from "@/lib/dates";

export interface TransferCandidate {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  description: string;
}

export interface TransferPair {
  outId: string;
  inId: string;
  /** Begge beskrivelsene nevner overføring → trygg nok til å bekrefte automatisk. */
  strong: boolean;
}

const TRANSFER_WORDS = /(overf[øo]ring|overf\.|egen konto|egne kontoer|mellom konto|sparekonto|fra konto|til konto|brukskonto|intern)/i;
const MAX_DAYS = 2;

/**
 * Parer `fresh` (nylig importerte) mot `pool` (alle andre kandidater, inkl. eksisterende).
 * Kun én-til-én-par; tvetydige treff (flere mulige motparter) hoppes over.
 */
export function findTransferPairs(fresh: TransferCandidate[], pool: TransferCandidate[]): TransferPair[] {
  const pairs: TransferPair[] = [];
  const used = new Set<string>();

  const byAmount = new Map<string, TransferCandidate[]>();
  for (const c of pool) {
    const key = Math.abs(c.amount).toFixed(2);
    (byAmount.get(key) ?? byAmount.set(key, []).get(key)!).push(c);
  }

  for (const tx of fresh) {
    if (used.has(tx.id)) continue;
    const candidates = (byAmount.get(Math.abs(tx.amount).toFixed(2)) ?? []).filter(
      (c) =>
        c.id !== tx.id &&
        !used.has(c.id) &&
        c.accountId !== tx.accountId &&
        Math.sign(c.amount) === -Math.sign(tx.amount) &&
        Math.abs(diffDays(c.date, tx.date)) <= MAX_DAYS,
    );
    if (candidates.length !== 1) continue; // ingen eller tvetydig

    const other = candidates[0];
    // Motparten må også ha nøyaktig én kandidat blant de nye (ellers er det tvetydig begge veger)
    const reverse = fresh.filter(
      (f) =>
        f.id !== other.id &&
        f.accountId !== other.accountId &&
        Math.abs(f.amount) === Math.abs(other.amount) &&
        Math.sign(f.amount) === -Math.sign(other.amount) &&
        Math.abs(diffDays(f.date, other.date)) <= MAX_DAYS,
    );
    if (reverse.length > 1) continue;

    used.add(tx.id);
    used.add(other.id);
    const out = tx.amount < 0 ? tx : other;
    const inn = tx.amount < 0 ? other : tx;
    pairs.push({
      outId: out.id,
      inId: inn.id,
      strong: TRANSFER_WORDS.test(out.description) || TRANSFER_WORDS.test(inn.description),
    });
  }
  return pairs;
}
