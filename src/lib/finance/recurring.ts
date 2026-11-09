// Oppdager gjentakende betalinger (abonnementer, faste regninger, lønn) fra transaksjonshistorikken.

import { findMerchant } from "@/lib/categorize/merchants";
import { addDays, addMonths, clampDay, diffDays, monthKeyOf } from "@/lib/dates";
import type { Frequency, Lookups, TxLite } from "@/lib/types";

export interface DetectedRecurring {
  merchantKey: string;
  displayName: string;
  categoryId: string | null;
  subcategoryId: string | null;
  /** Med fortegn: negativt = utgift */
  typicalAmount: number;
  frequency: Frequency;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  nextExpected: string;
  isSubscription: boolean;
  status: "active" | "ended";
}

const INTERVALS: Array<{ frequency: Frequency; min: number; max: number; days: number; minOcc: number }> = [
  { frequency: "weekly", min: 6, max: 8, days: 7, minOcc: 4 },
  { frequency: "monthly", min: 26, max: 35, days: 30, minOcc: 3 },
  { frequency: "quarterly", min: 85, max: 97, days: 91, minOcc: 3 },
  { frequency: "yearly", min: 350, max: 380, days: 365, minOcc: 2 },
];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function nextDate(last: string, frequency: Frequency): string {
  if (frequency === "weekly") return addDays(last, 7);
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const key = addMonths(monthKeyOf(last), months);
  return clampDay(key, Number(last.slice(8, 10)));
}

export function detectRecurring(txs: TxLite[], lk: Lookups, today: string): DetectedRecurring[] {
  // Gruppér på nøkkel + retning (lønn inn og husleie ut kan ha samme nøkkel i teorien)
  const groups = new Map<string, TxLite[]>();
  for (const tx of txs) {
    if (tx.transfer_status === "confirmed" || !tx.merchant_key) continue;
    const key = `${tx.merchant_key}|${tx.amount > 0 ? "in" : "out"}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(tx);
  }

  const out: DetectedRecurring[] = [];
  for (const [gkey, items] of groups) {
    const merchantKey = gkey.slice(0, gkey.lastIndexOf("|"));
    // Flere kjøp samme dag teller som ett
    const byDate = new Map<string, TxLite>();
    for (const t of items) byDate.set(t.booked_date, t);
    const dated = [...byDate.values()].sort((a, b) => a.booked_date.localeCompare(b.booked_date));
    if (dated.length < 2) continue;

    const gaps = dated.slice(1).map((t, i) => diffDays(t.booked_date, dated[i].booked_date));
    const medGap = median(gaps);
    const interval = INTERVALS.find((i) => medGap >= i.min && medGap <= i.max);
    if (!interval || dated.length < interval.minOcc) continue;

    const okGaps = gaps.filter((g) => g >= interval.min - 3 && g <= interval.max + 3).length / gaps.length;
    if (okGaps < 0.7) continue;

    // Faste betalinger har (nesten) samme beløp hver gang. Varierende regninger (strøm) og
    // vanlige butikkbesøk regnes ikke som gjentakende – de håndteres som variabelt forbruk.
    const amounts = dated.map((t) => Math.abs(t.amount));
    const medAmt = median(amounts);
    const stable = amounts.filter((a) => Math.abs(a - medAmt) <= medAmt * 0.12).length / amounts.length;
    if (stable < 0.7) continue;

    // Utrygge kategoriseringer (venter på godkjenning, f.eks. Vipps til privatpersoner) er ikke grunnlag nok
    const untrusted = dated.filter((t) => t.review_status === "review").length / dated.length;
    if (untrusted > 0.5) continue;

    const last = dated[dated.length - 1];
    const typical = (last.amount > 0 ? 1 : -1) * Math.round(medAmt * 100) / 100;
    const category = last.category_id ? lk.categories.get(last.category_id) : undefined;
    const merchantDef = findMerchant(merchantKey, last.amount > 0 ? "in" : "out");
    const isSubscription =
      typical < 0 && (category?.system_key === "abonnementer" || !!merchantDef?.def.subscription);

    const next = nextDate(last.booked_date, interval.frequency);
    const stale = diffDays(today, last.booked_date) > interval.days * 1.6;

    out.push({
      merchantKey,
      displayName: last.description,
      categoryId: last.category_id,
      subcategoryId: last.subcategory_id,
      typicalAmount: typical,
      frequency: interval.frequency,
      occurrences: dated.length,
      firstSeen: dated[0].booked_date,
      lastSeen: last.booked_date,
      nextExpected: next,
      isSubscription,
      status: stale ? "ended" : "active",
    });
  }
  return out.sort((a, b) => Math.abs(b.typicalAmount) - Math.abs(a.typicalAmount));
}

// Omregning til månedsbeløp bor i ./frequency (delt med budsjettplanen) – re-eksportert for eksisterende import.
export { monthlyEquivalent } from "./frequency";
