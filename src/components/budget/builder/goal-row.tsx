"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Meter } from "@/components/ui/progress";
import { CategoryIcon } from "@/components/category-chip";
import { formatAmountText } from "@/lib/budget/draft";
import { goalAdvice } from "@/lib/budget/plan";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BuilderGoal {
  id: string;
  name: string;
  icon: string;
  color: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  /** Månedlig bidrag slik det er lagret nå */
  monthlyContribution: number;
  completed: boolean;
}

const TONE = { good: "text-pos", warn: "text-warn", info: "text-ink-2" } as const;

/** Et sparemål med månedlig bidrag og en forklaring på hva bidraget betyr for måldatoen. */
export function GoalRow({
  goal,
  value,
  monthly,
  today,
  currency,
  onChange,
}: {
  goal: BuilderGoal;
  /** Tekst i feltet */
  value: string;
  /** Tolket månedlig beløp (hele kroner) */
  monthly: number;
  today: string;
  currency: string;
  onChange: (text: string) => void;
}) {
  const ratio = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;
  const advice = goal.completed ? null : goalAdvice({ target_amount: goal.targetAmount, current_amount: goal.currentAmount, target_date: goal.targetDate }, monthly, today, currency);
  // Foreslå bare et høyere beløp (når du ligger bak, eller ikke har satt noe) – aldri å spare mindre enn du har lagt inn
  const suggest = advice?.requiredMonthly && advice.requiredMonthly > monthly ? advice.requiredMonthly : null;

  return (
    <li className="py-4">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={goal.icon} color={goal.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{goal.name}</p>
          <p className="text-xs text-ink-2">
            {formatMoney(goal.currentAmount, { currency })} av {formatMoney(goal.targetAmount, { currency })}
          </p>
        </div>
        {goal.completed ? (
          <span className="rounded-full bg-pos-soft px-2.5 py-1 text-xs font-medium text-pos">Nådd</span>
        ) : (
          <div className="flex items-center gap-2">
            <Input aria-label={`${goal.name}: sparing per måned`} inputMode="decimal" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-28 text-right tabular-nums" />
            <span className="w-10 text-xs text-ink-3">/mnd</span>
          </div>
        )}
      </div>
      <div className="mt-3 pl-12">
        <Meter value={ratio} label={`${goal.name}: ${Math.round(ratio * 100)} % av målet`} height={6} />
        {advice && (
          <p className={cn("mt-2 text-xs", TONE[advice.tone])}>
            {advice.text}
            {suggest && (
              <>
                {" "}
                <Button variant="ghost" size="sm" className="ml-1 h-6 px-2 text-xs text-accent" onClick={() => onChange(formatAmountText(suggest))}>
                  Bruk {formatMoney(suggest, { currency })}
                </Button>
              </>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
