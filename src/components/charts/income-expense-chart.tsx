"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, LegendKey } from "@/components/charts/chart-card";
import { useMoney } from "@/lib/currency-context";
import { formatCompact } from "@/lib/format";

export interface MonthBar {
  month: string;
  label: string;
  income: number;
  expenses: number;
}

function TooltipBody({ active, payload }: { active?: boolean; payload?: Array<{ payload: MonthBar }> }) {
  const formatMoney = useMoney();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const net = d.income - d.expenses;
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 font-medium capitalize text-ink-2">{d.label}</p>
      <p className="flex items-center gap-2">
        <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: "var(--c1)" }} />
        <span className="text-sm font-semibold tabular-nums">{formatMoney(d.income)}</span>
        <span className="text-ink-2">inntekt</span>
      </p>
      <p className="flex items-center gap-2">
        <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: "var(--c2)" }} />
        <span className="text-sm font-semibold tabular-nums">{formatMoney(d.expenses)}</span>
        <span className="text-ink-2">utgifter</span>
      </p>
      <p className="mt-1.5 border-t border-line pt-1.5 text-ink-2">
        Resultat <span className="font-semibold tabular-nums text-ink">{formatMoney(net, { signed: true })}</span>
      </p>
    </div>
  );
}

/** Inntekt mot utgifter per måned: to søyler per måned (blå = inn, oransje = ut). */
export function IncomeExpenseChart({ data, title = "Inntekt og utgifter", description = "Siste måneder" }: { data: MonthBar[]; title?: string; description?: string }) {
  const formatMoney = useMoney();
  return (
    <ChartCard
      title={title}
      description={description}
      legend={
        <>
          <LegendKey color="var(--c1)" label="Inntekt" />
          <LegendKey color="var(--c2)" label="Utgifter" />
        </>
      }
      table={{
        caption: "Inntekt og utgifter per måned",
        columns: ["Måned", "Inntekt", "Utgifter", "Resultat"],
        rows: data.map((d) => [<span key="m" className="capitalize">{d.label}</span>, formatMoney(d.income), formatMoney(d.expenses), formatMoney(d.income - d.expenses, { signed: true })]),
      }}
    >
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, left: -8, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={{ fill: "var(--chart-text)", fontSize: 12 }} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--chart-text)", fontSize: 12 }} tickFormatter={formatCompact} width={44} />
            <Tooltip content={<TooltipBody />} cursor={{ fill: "var(--surface-2)", opacity: 0.7 }} />
            <Bar dataKey="income" name="Inntekt" fill="var(--c1)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive animationDuration={600} />
            <Bar dataKey="expenses" name="Utgifter" fill="var(--c2)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive animationDuration={600} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
