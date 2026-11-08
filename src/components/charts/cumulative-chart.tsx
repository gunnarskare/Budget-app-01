"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, LegendKey } from "@/components/charts/chart-card";
import { useMoney } from "@/lib/currency-context";
import { formatCompact } from "@/lib/format";

export interface DayPoint {
  day: number;
  current: number | null;
  previous: number | null;
}

function TooltipBody({
  active,
  payload,
  label,
  currentName,
  previousName,
}: {
  active?: boolean;
  payload?: Array<{ payload: DayPoint }>;
  label?: number;
  currentName: string;
  previousName: string;
}) {
  const formatMoney = useMoney();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 font-medium text-ink-2">Dag {label}</p>
      {d.current !== null && (
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: "var(--c1)" }} />
          <span className="text-sm font-semibold tabular-nums">{formatMoney(d.current)}</span>
          <span className="text-ink-2 capitalize">{currentName}</span>
        </p>
      )}
      {d.previous !== null && (
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: "var(--c-other)" }} />
          <span className="text-sm font-semibold tabular-nums">{formatMoney(d.previous)}</span>
          <span className="text-ink-2 capitalize">{previousName}</span>
        </p>
      )}
    </div>
  );
}

/** Akkumulert forbruk gjennom måneden: denne måneden (fremhevet) mot forrige (grå) og evt. budsjett. */
export function CumulativeChart({
  data,
  currentName,
  previousName,
  budgetTotal,
  endDay,
}: {
  data: DayPoint[];
  currentName: string;
  previousName: string;
  budgetTotal: number | null;
  /** Siste dag med data i denne måneden (for sluttpunktet) */
  endDay: number | null;
}) {
  const formatMoney = useMoney();
  const end = endDay ? data.find((d) => d.day === endDay) : undefined;
  const lastCurrent = end?.current ?? null;
  return (
    <ChartCard
      title="Forbruk gjennom måneden"
      description={`Akkumulert, ${currentName} mot ${previousName}`}
      legend={
        <>
          <LegendKey color="var(--c1)" label={currentName.charAt(0).toUpperCase() + currentName.slice(1)} shape="line" />
          <LegendKey color="var(--c-other)" label={previousName.charAt(0).toUpperCase() + previousName.slice(1)} shape="line" />
          {budgetTotal ? <LegendKey color="var(--ink-3)" label="Budsjett" shape="line" /> : null}
        </>
      }
      table={{
        caption: "Akkumulert forbruk per dag",
        columns: ["Dag", currentName, previousName],
        rows: data.filter((d) => d.day % 3 === 1 || d.day === endDay).map((d) => [d.day, d.current === null ? "–" : formatMoney(d.current), d.previous === null ? "–" : formatMoney(d.previous)]),
      }}
    >
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={{ fill: "var(--chart-text)", fontSize: 12 }} tickMargin={8} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--chart-text)", fontSize: 12 }} tickFormatter={formatCompact} width={44} domain={[0, (max: number) => Math.max(max, budgetTotal ?? 0) * 1.05]} />
            <Tooltip
              content={<TooltipBody currentName={currentName} previousName={previousName} />}
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
            />
            {budgetTotal ? <ReferenceLine y={budgetTotal} stroke="var(--ink-3)" strokeWidth={1} strokeOpacity={0.6} label={{ value: "Budsjett", position: "insideTopRight", fill: "var(--chart-text)", fontSize: 11 }} /> : null}
            <Line type="monotone" dataKey="previous" stroke="var(--c-other)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }} isAnimationActive animationDuration={700} connectNulls={false} />
            <Area type="monotone" dataKey="current" stroke="var(--c1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="var(--c1)" fillOpacity={0.1} dot={(p: { cx?: number; cy?: number; index?: number }) =>
                endDay && p.index === endDay - 1 && lastCurrent !== null && p.cx !== undefined && p.cy !== undefined ? (
                  <circle key="end" cx={p.cx} cy={p.cy} r={5} fill="var(--c1)" stroke="var(--chart-surface)" strokeWidth={2} />
                ) : (
                  <g key={`d${p.index}`} />
                )
              } activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }} isAnimationActive animationDuration={700} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
