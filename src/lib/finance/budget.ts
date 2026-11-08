// Budsjett: periodegrenser, fremdrift per kategori, forslag basert på historikk.

import { roundNice } from "@/lib/format";
import {
  addMonths,
  daysInMonth,
  diffDays,
  lastMonths,
  monthEnd,
  monthKeyOf,
  monthStart,
  weekEnd,
} from "@/lib/dates";
import type { Budget, BudgetCategory, Lookups, PeriodType, TxLite } from "@/lib/types";
import { monthlySpendByCategory, monthsWithData, round2, spendByCategory } from "./aggregate";
import { inRange } from "./aggregate";
import { totals } from "./aggregate";

export function periodRange(type: PeriodType, start: string): { from: string; to: string } {
  return type === "month" ? { from: start, to: monthEnd(monthKeyOf(start)) } : { from: start, to: weekEnd(start) };
}

export type BudgetStatus = "none" | "ok" | "warn" | "over";

export function statusOf(planned: number, spent: number): BudgetStatus {
  if (planned <= 0) return spent > 0 ? "over" : "none";
  const ratio = spent / planned;
  if (ratio > 1) return "over";
  if (ratio >= 0.85) return "warn";
  return "ok";
}

export interface BudgetLine {
  categoryId: string;
  planned: number;
  spent: number;
  /** planned − spent (negativ = overskredet) */
  remaining: number;
  ratio: number;
  status: BudgetStatus;
}

export interface BudgetView {
  /** Budsjettet som faktisk brukes (kan være arvet fra en tidligere periode). */
  budget: Budget | null;
  /** Sett når perioden mangler eget budsjett og et tidligere brukes. */
  inheritedFrom: string | null;
  plan: Map<string, number>;
  lines: BudgetLine[];
  /** Forbruk i kategorier uten budsjettlinje */
  unbudgeted: Array<{ categoryId: string | null; spent: number }>;
  totalPlanned: number;
  totalSpent: number;
  totalRemaining: number;
  plannedIncome: number | null;
}

/** Finner budsjettet for perioden – eget hvis det finnes, ellers nærmeste tidligere av samme type. */
export function resolveBudget(
  budgets: Budget[],
  budgetLines: BudgetCategory[],
  type: PeriodType,
  periodStart: string,
): { budget: Budget | null; inheritedFrom: string | null; plan: Map<string, number> } {
  const sameType = budgets.filter((b) => b.period_type === type).sort((a, b) => b.period_start.localeCompare(a.period_start));
  const exact = sameType.find((b) => b.period_start === periodStart);
  const chosen = exact ?? sameType.find((b) => b.period_start < periodStart) ?? null;
  const plan = new Map<string, number>();
  if (chosen) for (const l of budgetLines) if (l.budget_id === chosen.id) plan.set(l.category_id, l.amount);
  return { budget: chosen, inheritedFrom: chosen && !exact ? chosen.period_start : null, plan };
}

export function buildBudgetView(
  budgets: Budget[],
  budgetLines: BudgetCategory[],
  type: PeriodType,
  periodStart: string,
  txs: TxLite[],
  lk: Lookups,
): BudgetView {
  const { budget, inheritedFrom, plan } = resolveBudget(budgets, budgetLines, type, periodStart);
  const { from, to } = periodRange(type, periodStart);
  const spend = spendByCategory(inRange(txs, from, to), lk);
  const spentById = new Map(spend.map((s) => [s.categoryId, s.amount]));

  const lines: BudgetLine[] = [...plan.entries()].map(([categoryId, planned]) => {
    const spent = Math.max(0, round2(spentById.get(categoryId) ?? 0));
    return {
      categoryId,
      planned,
      spent,
      remaining: round2(planned - spent),
      ratio: planned > 0 ? spent / planned : spent > 0 ? Infinity : 0,
      status: statusOf(planned, spent),
    };
  });

  const unbudgeted = spend
    .filter((s) => s.categoryId === null || !plan.has(s.categoryId))
    .filter((s) => s.amount > 0)
    .map((s) => ({ categoryId: s.categoryId, spent: s.amount }));

  const totalPlanned = round2(lines.reduce((n, l) => n + l.planned, 0));
  const totalSpent = round2(lines.reduce((n, l) => n + l.spent, 0));
  return {
    budget,
    inheritedFrom,
    plan,
    lines,
    unbudgeted,
    totalPlanned,
    totalSpent,
    totalRemaining: round2(totalPlanned - totalSpent),
    plannedIncome: budget?.planned_income ?? null,
  };
}

/**
 * Hvor mye forbruk som forventes ved periodeslutt hvis tempoet fortsetter lineært.
 * Returnerer null for tidlig i perioden (< 25 % gjennomført) – da er tempoet for usikkert.
 */
export function paceProjection(spent: number, from: string, to: string, today: string): { projected: number; elapsedRatio: number } | null {
  const total = diffDays(to, from) + 1;
  const elapsed = Math.min(total, Math.max(0, diffDays(today, from) + 1));
  const elapsedRatio = elapsed / total;
  if (elapsedRatio < 0.25 || elapsedRatio >= 1) return null;
  return { projected: round2(spent / elapsedRatio), elapsedRatio };
}

export interface BudgetSuggestion {
  categoryId: string;
  suggested: number;
  /** Gjennomsnittlig månedlig forbruk i grunnlaget */
  average: number;
  /** Antall måneder forslaget bygger på */
  months: number;
  confidence: "low" | "medium" | "high";
}

export interface SuggestionResult {
  suggestions: BudgetSuggestion[];
  suggestedIncome: number | null;
  months: string[];
  /** true når vi måtte bruke inneværende (ufullstendige) måned */
  usedPartialMonth: boolean;
}

/**
 * Foreslår realistiske budsjetter ut fra de siste 3–6 hele månedene.
 * Faller tilbake til å skalere inneværende måned dersom det ikke finnes hele måneder.
 */
export function suggestBudget(txs: TxLite[], lk: Lookups, today: string, maxMonths = 6): SuggestionResult {
  const currentMonth = monthKeyOf(today);
  const candidates = lastMonths(addMonths(currentMonth, -1), maxMonths);
  let months = monthsWithData(txs, candidates, 5);
  let usedPartialMonth = false;

  let scale = 1;
  if (months.length === 0) {
    const day = Number(today.slice(8, 10));
    if (monthsWithData(txs, [currentMonth], 5).length === 1 && day >= 7) {
      months = [currentMonth];
      usedPartialMonth = true;
      scale = daysInMonth(currentMonth) / day;
    }
  }
  if (months.length === 0) return { suggestions: [], suggestedIncome: null, months: [], usedPartialMonth: false };

  const perCat = monthlySpendByCategory(txs, lk);
  const suggestions: BudgetSuggestion[] = [];
  for (const [categoryId, byMonth] of perCat) {
    if (!categoryId) continue;
    const cat = lk.categories.get(categoryId);
    if (!cat || cat.kind !== "expense") continue;
    let values = months.map((m) => Math.max(0, (byMonth.get(m) ?? 0) * scale));
    // Med nok data: dropp den dyreste måneden (engangskjøp) før snittet
    if (values.length >= 4) {
      const max = Math.max(...values);
      values = values.filter((v, i) => !(v === max && values.indexOf(v) === i));
    }
    const avg = values.reduce((n, v) => n + v, 0) / (values.length || 1);
    if (avg < 50) continue;
    suggestions.push({
      categoryId,
      suggested: roundNice(avg * 1.03),
      average: round2(avg),
      months: months.length,
      confidence: usedPartialMonth || months.length < 3 ? "low" : months.length < 5 ? "medium" : "high",
    });
  }
  suggestions.sort((a, b) => b.suggested - a.suggested);

  const incomes = months.map((m) => totals(inRange(txs, monthStart(m), monthEnd(m)), lk).income * scale);
  const avgIncome = incomes.reduce((n, v) => n + v, 0) / incomes.length;
  return {
    suggestions,
    suggestedIncome: avgIncome > 0 ? roundNice(avgIncome) : null,
    months,
    usedPartialMonth,
  };
}
