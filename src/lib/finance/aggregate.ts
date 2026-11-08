// Aggregering av transaksjoner til tall for dashboard, budsjett og rapporter.

import { daysInMonth, monthEnd, monthKeyOf, monthStart } from "@/lib/dates";
import type { Lookups, TxLite } from "@/lib/types";
import { classify } from "./classify";

export interface Totals {
  income: number;
  expenses: number;
  savings: number;
  /** Tilgjengelig = inntekt − utgifter − sparing */
  available: number;
  count: number;
}

export const ZERO_TOTALS: Totals = { income: 0, expenses: 0, savings: 0, available: 0, count: 0 };

export function inRange<T extends { booked_date: string }>(txs: T[], from: string, to: string): T[] {
  return txs.filter((t) => t.booked_date >= from && t.booked_date <= to);
}

export function inMonth<T extends { booked_date: string }>(txs: T[], monthKey: string): T[] {
  return inRange(txs, monthStart(monthKey), monthEnd(monthKey));
}

export function totals(txs: TxLite[], lk: Lookups): Totals {
  let income = 0;
  let expenses = 0;
  let savings = 0;
  let count = 0;
  for (const tx of txs) {
    const c = classify(tx, lk);
    if (c.bucket === "transfer") continue;
    count++;
    if (c.bucket === "income") income += c.value;
    else if (c.bucket === "expense") expenses += c.value;
    else savings += c.value;
  }
  income = round2(income);
  expenses = round2(expenses);
  savings = round2(savings);
  return { income, expenses, savings, available: round2(income - expenses - savings), count };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CategorySpend {
  /** null = ukategorisert */
  categoryId: string | null;
  amount: number;
  count: number;
  /** Andel av total positiv utgift (0–1) */
  share: number;
}

/** Forbruk per hovedkategori (kun utgifter; refusjoner trekkes fra). Sortert synkende. */
export function spendByCategory(txs: TxLite[], lk: Lookups): CategorySpend[] {
  const map = new Map<string | null, { amount: number; count: number }>();
  for (const tx of txs) {
    const c = classify(tx, lk);
    if (c.bucket !== "expense") continue;
    const e = map.get(tx.category_id) ?? { amount: 0, count: 0 };
    e.amount += c.value;
    e.count += 1;
    map.set(tx.category_id, e);
  }
  const rows = [...map.entries()].map(([categoryId, v]) => ({ categoryId, amount: round2(v.amount), count: v.count }));
  const total = rows.reduce((n, r) => n + Math.max(0, r.amount), 0);
  return rows
    .map((r) => ({ ...r, share: total > 0 ? Math.max(0, r.amount) / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Forbruk per underkategori innen én hovedkategori. */
export function spendBySubcategory(txs: TxLite[], lk: Lookups, categoryId: string): Array<{ subcategoryId: string | null; amount: number; count: number }> {
  const map = new Map<string | null, { amount: number; count: number }>();
  for (const tx of txs) {
    if (tx.category_id !== categoryId) continue;
    const c = classify(tx, lk);
    if (c.bucket !== "expense") continue;
    const e = map.get(tx.subcategory_id) ?? { amount: 0, count: 0 };
    e.amount += c.value;
    e.count += 1;
    map.set(tx.subcategory_id, e);
  }
  return [...map.entries()]
    .map(([subcategoryId, v]) => ({ subcategoryId, amount: round2(v.amount), count: v.count }))
    .sort((a, b) => b.amount - a.amount);
}

export interface MonthTotals extends Totals {
  month: string;
}

export function monthlyTotals(txs: TxLite[], lk: Lookups, months: string[]): MonthTotals[] {
  const byMonth = new Map<string, TxLite[]>();
  for (const tx of txs) {
    const k = monthKeyOf(tx.booked_date);
    (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(tx);
  }
  return months.map((month) => ({ month, ...totals(byMonth.get(month) ?? [], lk) }));
}

/** Månedlig forbruk per kategori: Map<kategori-id, Map<måned, beløp>> */
export function monthlySpendByCategory(txs: TxLite[], lk: Lookups): Map<string | null, Map<string, number>> {
  const out = new Map<string | null, Map<string, number>>();
  for (const tx of txs) {
    const c = classify(tx, lk);
    if (c.bucket !== "expense") continue;
    const m = monthKeyOf(tx.booked_date);
    const inner = out.get(tx.category_id) ?? new Map<string, number>();
    inner.set(m, (inner.get(m) ?? 0) + c.value);
    out.set(tx.category_id, inner);
  }
  return out;
}

/**
 * Akkumulert forbruk per dag i måneden (indeks 0 = dag 1).
 * Dager etter `throughDay` gir null (fremtid), slik at diagrammet kan stoppe linjen.
 */
export function dailyCumulativeExpenses(txs: TxLite[], lk: Lookups, monthKey: string, throughDay?: number): Array<number | null> {
  const days = daysInMonth(monthKey);
  const perDay = new Array<number>(days).fill(0);
  for (const tx of inMonth(txs, monthKey)) {
    const c = classify(tx, lk);
    if (c.bucket !== "expense") continue;
    perDay[Number(tx.booked_date.slice(8, 10)) - 1] += c.value;
  }
  const last = throughDay ?? days;
  let acc = 0;
  return perDay.map((v, i) => {
    if (i + 1 > last) return null;
    acc += v;
    return round2(acc);
  });
}

/** Antall kalendermåneder (blant `months`) med minst `minTx` transaksjoner. */
export function monthsWithData(txs: TxLite[], months: string[], minTx = 5): string[] {
  const counts = new Map<string, number>();
  for (const tx of txs) {
    const k = monthKeyOf(tx.booked_date);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return months.filter((m) => (counts.get(m) ?? 0) >= minTx);
}
