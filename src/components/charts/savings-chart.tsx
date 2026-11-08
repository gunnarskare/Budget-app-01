"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { useMoney } from "@/lib/currency-context";
import { formatCompact } from "@/lib/format";

export interface SavingsPoint {
  label: string;
  month: string;
  saved: number;
  total: number;
}

function TooltipBody({ active, payload }: { active?: boolean; payload?: Array<{ payload: SavingsPoint }> }) {
  const formatMoney = useMoney();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 font-medium capitalize text-ink-2">{d.label}</p>
      <p className="flex items-center gap-2">
        <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: "var(--c3)" }} />
        <span className="text-sm font-semibold tabular-nums">{formatMoney(d.total)}</span>
        <span className="text-ink-2">spart totalt</span>
      </p>
      <p className="mt-1 text-ink-2">
        Denne måneden <span className="font-semibold tabular-nums text-ink">{formatMoney(d.saved, { signed: true })}</span>
      </p>
    </div>
  );
}

/** Utvikling i sparing: akkumulert spart beløp per måned. */
export function SavingsChart({ data }: { data: SavingsPoint[] }) {
  const formatMoney = useMoney();
  return (
    <ChartCard
      title="Utvikling i sparing"
      description="Akkumulert spart beløp"
      table={{ caption: "Spart per måned", columns: ["Måned", "Spart", "Totalt"], rows: data.map((d) => [<span key="m" className="capitalize">{d.label}</span>, formatMoney(d.saved, { signed: true }), formatMoney(d.total)]) }}
    >
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={{ fill: "var(--chart-text)", fontSize: 12 }} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--chart-text)", fontSize: 12 }} tickFormatter={formatCompact} width={44} />
            <Tooltip content={<TooltipBody />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="total" stroke="var(--c3)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="var(--c3)" fillOpacity={0.1} dot={false} activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }} isAnimationActive animationDuration={700} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
