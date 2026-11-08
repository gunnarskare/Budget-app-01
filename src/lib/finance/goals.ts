// Sparemål: fremdrift, estimert måldato og om man ligger an til å nå målet.

import { addMonths, clampDay, diffDays, monthKeyOf, monthsBetween } from "@/lib/dates";
import type { SavingsGoal } from "@/lib/types";

export type GoalStatus = "done" | "on_track" | "behind" | "no_plan";

export interface GoalProgress {
  ratio: number;
  remaining: number;
  /** Måneder til målet nås med nåværende månedlig sparing */
  monthsToGo: number | null;
  estimatedDate: string | null;
  /** Månedlig beløp som kreves for å nå måldatoen */
  requiredMonthly: number | null;
  status: GoalStatus;
}

export function goalProgress(
  goal: Pick<SavingsGoal, "target_amount" | "current_amount" | "monthly_contribution" | "target_date">,
  today: string,
): GoalProgress {
  const remaining = Math.max(0, Math.round((goal.target_amount - goal.current_amount) * 100) / 100);
  const ratio = goal.target_amount > 0 ? Math.min(1, goal.current_amount / goal.target_amount) : 0;
  if (remaining === 0) {
    return { ratio: 1, remaining: 0, monthsToGo: 0, estimatedDate: today, requiredMonthly: 0, status: "done" };
  }

  const monthsToGo = goal.monthly_contribution > 0 ? Math.ceil(remaining / goal.monthly_contribution) : null;
  const estimatedDate =
    monthsToGo === null ? null : clampDay(addMonths(monthKeyOf(today), monthsToGo), Number(today.slice(8, 10)));

  let requiredMonthly: number | null = null;
  if (goal.target_date && goal.target_date > today) {
    const months = Math.max(1, monthsBetween(monthKeyOf(today), monthKeyOf(goal.target_date)).length - 1 || 1);
    requiredMonthly = Math.ceil(remaining / months);
  }

  let status: GoalStatus = "no_plan";
  if (monthsToGo !== null) {
    status = goal.target_date ? (estimatedDate! <= goal.target_date ? "on_track" : "behind") : "on_track";
  } else if (goal.target_date) {
    status = "behind";
  }
  return { ratio, remaining, monthsToGo, estimatedDate, requiredMonthly, status };
}

/** Milepæler (prosent) som er passert når beløpet øker fra `before` til `after`. */
export function crossedMilestone(target: number, before: number, after: number): 25 | 50 | 75 | 100 | null {
  if (target <= 0) return null;
  const marks = [100, 75, 50, 25] as const;
  for (const m of marks) {
    const threshold = (target * m) / 100;
    if (before < threshold && after >= threshold) return m;
  }
  return null;
}

export function daysUntil(date: string, today: string): number {
  return diffDays(date, today);
}
