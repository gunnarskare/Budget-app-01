// Prognose for månedsslutt: «Hvor mye har jeg igjen?»
//
//   forventet = (inntekt − utgifter − sparing hittil)
//             + forventet gjenstående inntekt     (gjentakende, ikke mottatt ennå – f.eks. lønn)
//             − forventede faste utgifter         (gjentakende, ikke trukket ennå)
//             − forventet variabelt forbruk       (hva du vanligvis bruker i månedens gjenstående dager)
//
// Variabelt forbruk bygger på dine egne siste hele måneder: gjennomsnittet av utgiftene som falt
// på dagene som gjenstår, justert (dempet) for om du ligger over/under vanlig tempo så langt.
// Det gjør at store poster tidlig i måneden (husleie) ikke ekstrapoleres utover måneden.
// Uten historikk brukes lineært tempo, og prognosen merkes som foreløpig.

import { addMonths, dayOfMonth, daysInMonth, lastMonths, monthEnd, monthKeyOf, monthStart } from "@/lib/dates";
import type { Lookups, RecurringTransaction, TxLite } from "@/lib/types";
import { inMonth, monthsWithData, round2, totals } from "./aggregate";
import { classify } from "./classify";

export interface Forecast {
  monthKey: string;
  isCurrent: boolean;
  elapsedDays: number;
  daysInMonth: number;
  incomeSoFar: number;
  expensesSoFar: number;
  savingsSoFar: number;
  expectedIncomeRemaining: number;
  expectedFixedRemaining: number;
  /** Gjennomsnittlig variabelt forbruk per gjenstående dag (kun til visning) */
  variableDaily: number;
  variableRemaining: number;
  projectedIncome: number;
  projectedExpenses: number;
  projectedSavings: number;
  /** Forventet beløp igjen ved månedsslutt (månedsnetto) */
  projectedAvailable: number;
  /**
   * Tilgjengelig nå: inntekt hittil + kjent forventet inntekt (f.eks. lønn som ikke er kommet)
   * − utgifter − sparing hittil. Unngår at tallet er dypt negativt før lønningsdag.
   */
  availableNow: number;
  /** Antall hele måneder prognosen bygger på */
  basisMonths: number;
  confidence: "low" | "medium" | "high";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function forecastMonth(input: {
  txs: TxLite[];
  lk: Lookups;
  monthKey: string;
  today: string;
  recurring: RecurringTransaction[];
}): Forecast {
  const { txs, lk, monthKey, today, recurring } = input;
  const dim = daysInMonth(monthKey);
  const currentKey = monthKeyOf(today);
  const isCurrent = monthKey === currentKey;
  const isPast = monthKey < currentKey;
  const elapsed = isPast ? dim : isCurrent ? dayOfMonth(today) : 0;

  const monthTxs = inMonth(txs, monthKey);
  const t = totals(monthTxs, lk);

  const base: Forecast = {
    monthKey,
    isCurrent,
    elapsedDays: elapsed,
    daysInMonth: dim,
    incomeSoFar: t.income,
    expensesSoFar: t.expenses,
    savingsSoFar: t.savings,
    expectedIncomeRemaining: 0,
    expectedFixedRemaining: 0,
    variableDaily: 0,
    variableRemaining: 0,
    projectedIncome: t.income,
    projectedExpenses: t.expenses,
    projectedSavings: t.savings,
    projectedAvailable: t.available,
    availableNow: t.available,
    basisMonths: 0,
    confidence: "high",
  };
  if (!isCurrent) return base;

  const active = recurring.filter((r) => r.status === "active");
  const seenThisMonth = (r: RecurringTransaction) =>
    monthTxs.some((tx) => tx.merchant_key === r.merchant_key && Math.sign(tx.amount) === Math.sign(r.typical_amount));

  const start = monthStart(monthKey);
  const end = monthEnd(monthKey);
  const dueThisMonth = (r: RecurringTransaction) =>
    !!r.next_expected && r.next_expected >= start && r.next_expected <= end && !seenThisMonth(r);

  let expectedIncome = 0;
  let expectedFixed = 0;
  for (const r of active) {
    if (!dueThisMonth(r)) continue;
    if (r.typical_amount > 0) expectedIncome += r.typical_amount;
    else expectedFixed += Math.abs(r.typical_amount);
  }

  // Variabelt forbruk = utgifter som ikke tilhører en gjentakende (fast) post
  const fixedKeys = new Set(active.filter((r) => r.typical_amount < 0).map((r) => r.merchant_key));
  const variableSplit = (key: string, day: number) => {
    let soFar = 0;
    let rest = 0;
    for (const tx of inMonth(txs, key)) {
      const c = classify(tx, lk);
      if (c.bucket !== "expense" || fixedKeys.has(tx.merchant_key)) continue;
      if (Number(tx.booked_date.slice(8, 10)) <= day) soFar += c.value;
      else rest += c.value;
    }
    return { soFar, rest };
  };

  const remainingDays = Math.max(0, dim - elapsed);
  const cur = variableSplit(monthKey, elapsed);
  const histKeys = monthsWithData(txs, lastMonths(addMonths(monthKey, -1), 3), 5);

  let variableRemaining: number;
  if (histKeys.length > 0) {
    const hist = histKeys.map((k) => variableSplit(k, elapsed));
    const avgRest = hist.reduce((n, h) => n + h.rest, 0) / hist.length;
    const avgSoFar = hist.reduce((n, h) => n + h.soFar, 0) / hist.length;
    // Tempo hittil sammenlignet med vanlig – dempet slik at ett kjøp ikke velter hele prognosen
    const factor = avgSoFar > 0 ? clamp(cur.soFar / avgSoFar, 0.7, 1.4) : 1;
    variableRemaining = Math.max(0, avgRest * (1 + (factor - 1) * 0.5));
  } else {
    variableRemaining = elapsed > 0 ? Math.max(0, (cur.soFar / elapsed) * remainingDays) : 0;
  }

  const projectedExpenses = t.expenses + expectedFixed + variableRemaining;
  const projectedIncome = t.income + expectedIncome;

  const confidence: Forecast["confidence"] =
    (histKeys.length >= 3 && elapsed >= 7) || (elapsed >= 20 && t.count >= 30)
      ? "high"
      : histKeys.length >= 1 || (elapsed >= 10 && t.count >= 15)
        ? "medium"
        : "low";

  return {
    ...base,
    expectedIncomeRemaining: round2(expectedIncome),
    expectedFixedRemaining: round2(expectedFixed),
    variableDaily: remainingDays > 0 ? round2(variableRemaining / remainingDays) : 0,
    variableRemaining: round2(variableRemaining),
    projectedIncome: round2(projectedIncome),
    projectedExpenses: round2(projectedExpenses),
    projectedSavings: t.savings,
    projectedAvailable: round2(projectedIncome - projectedExpenses - t.savings),
    availableNow: round2(t.income + expectedIncome - t.expenses - t.savings),
    basisMonths: histKeys.length,
    confidence,
  };
}
