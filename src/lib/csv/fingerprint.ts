// Duplikatkontroll. Kun brukt på serveren (Node crypto).

import { createHash } from "node:crypto";
import { normalizeText } from "./clean";

/** Fingeravtrykk: konto + dato + beløp + normalisert originalbeskrivelse. */
export function fingerprint(accountId: string, date: string, amount: number, originalDescription: string): string {
  const payload = [accountId, date, amount.toFixed(2), normalizeText(originalDescription)].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 40);
}

/** Svakt fingeravtrykk (dato + beløp + konto) for å finne «mulige duplikater». */
export function softKey(accountId: string, date: string, amount: number): string {
  return `${accountId}|${date}|${amount.toFixed(2)}`;
}

/**
 * To identiske kjøp samme dag er lovlige. Hver rad får derfor et forekomstnummer (1, 2, …)
 * innen samme fingeravtrykk, i filens rekkefølge.
 */
export function assignOccurrences<T>(items: T[], fp: (item: T) => string): Array<{ item: T; fingerprint: string; occurrence: number }> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const f = fp(item);
    const n = (seen.get(f) ?? 0) + 1;
    seen.set(f, n);
    return { item, fingerprint: f, occurrence: n };
  });
}
