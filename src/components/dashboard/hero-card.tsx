"use client";

import { CalendarClock, Info } from "lucide-react";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { useMoney } from "@/lib/currency-context";
import { formatDateShort, monthName } from "@/lib/format";

/** Månedens hovedtall: tilgjengelig beløp og forventet saldo ved månedsslutt. */
export function HeroCard({
  monthKey,
  isCurrent,
  available,
  projected,
  confidence,
  elapsedDays,
  daysInMonth,
  expectedIncome,
  expectedIncomeDate,
  basisMonths,
}: {
  monthKey: string;
  isCurrent: boolean;
  available: number;
  projected: number;
  confidence: "low" | "medium" | "high";
  elapsedDays: number;
  daysInMonth: number;
  expectedIncome: number;
  expectedIncomeDate: string | null;
  basisMonths: number;
}) {
  const formatMoney = useMoney();
  const pct = Math.round((elapsedDays / daysInMonth) * 100);
  return (
    <section
      aria-label="Økonomisk status"
      className="relative overflow-hidden rounded-card bg-[linear-gradient(140deg,#6a4de0_0%,#5b3fd1_45%,#3f2a9f_100%)] p-6 text-white shadow-[0_20px_40px_-20px_rgb(91_63_209/0.7)] sm:p-8"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/10 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-[#ff9d6c]/20 blur-3xl" />

      <div className="relative">
        <p className="text-sm font-medium text-white/80">{isCurrent ? `Tilgjengelig i ${monthName(monthKey)}` : `Resultat for ${monthName(monthKey)}`}</p>
        <p className="num-display mt-2 text-[2.9rem] sm:text-6xl">
          <AnimatedMoney value={available} />
        </p>

        {isCurrent ? (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm ring-1 ring-white/20">
                <CalendarClock className="size-4" aria-hidden="true" />
                Forventet saldo ved månedsslutt: <strong className="font-semibold tabular-nums"><AnimatedMoney value={projected} /></strong>
              </span>
              {confidence === "low" && (
                <span className="inline-flex items-center gap-1.5 text-xs text-white/75">
                  <Info className="size-3.5" aria-hidden="true" /> Foreløpig anslag
                </span>
              )}
            </div>
            {expectedIncome > 0 && (
              <p className="mt-3 text-sm text-white/75">
                Regner med kjent inntekt på {formatMoney(expectedIncome)}
                {expectedIncomeDate ? ` rundt ${formatDateShort(expectedIncomeDate)}` : ""}
              </p>
            )}
            <div className="mt-6">
              <div className="mb-1.5 flex justify-between text-xs text-white/70">
                <span>
                  Dag {elapsedDays} av {daysInMonth}
                </span>
                {basisMonths > 0 && <span>Basert på dine {basisMonths} siste måneder</span>}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label="Hvor langt ut i måneden vi er" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full origin-left animate-grow rounded-full bg-white" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-white/75">Inntekt minus utgifter og sparing for hele måneden.</p>
        )}
      </div>
    </section>
  );
}
