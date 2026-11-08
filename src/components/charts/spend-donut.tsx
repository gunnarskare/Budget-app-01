"use client";

import Link from "next/link";
import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import { CategoryIcon } from "@/components/category-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { themed } from "@/lib/colors";
import { useMoney } from "@/lib/currency-context";
import { formatPercent } from "@/lib/format";

export interface DonutSlice {
  id: string;
  name: string;
  icon: string;
  color: string;
  amount: number;
  share: number;
  count: number;
  href?: string;
  /** «Andre» – samlet rest, nøytral grå */
  other?: boolean;
}

/**
 * Fordeling av utgifter: donut + rangert liste (listen er også tabellvisningen).
 * Maks 7 deler + «Andre». Hver del har 2 px mellomrom i overflatefargen.
 */
export function SpendDonut({
  slices,
  total,
  title = "Hvor pengene går",
  description,
}: {
  slices: DonutSlice[];
  total: number;
  title?: string;
  description?: string;
}) {
  const formatMoney = useMoney();
  const [active, setActive] = React.useState<number | null>(null);
  const data = slices.filter((s) => s.amount > 0);
  const activeSlice = active !== null ? data[active] : null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-2">Ingen utgifter å vise ennå.</p>
        ) : (
          <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,240px)_1fr]">
            <div className="relative mx-auto aspect-square w-full max-w-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer>
                  <Pie
                    data={data}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius="68%"
                    outerRadius="100%"
                    paddingAngle={0}
                    startAngle={90}
                    endAngle={-270}
                    stroke="var(--chart-surface)"
                    strokeWidth={2}
                    isAnimationActive
                    animationDuration={700}
                    onMouseEnter={(_, i) => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    activeShape={(props: React.ComponentProps<typeof Sector>) => <Sector {...props} outerRadius={Number(props.outerRadius) + 4} />}
                  >
                    {data.map((s) => (
                      <Cell key={s.id} fill={s.other ? "var(--c-other)" : themed(s.color)} />
                    ))}
                  </Pie>
                  <Tooltip content={() => null} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div className="max-w-[58%]">
                  <p className="truncate text-xs text-ink-2">{activeSlice ? activeSlice.name : "Totalt"}</p>
                  <p className="num-display text-base sm:text-lg">{formatMoney(activeSlice ? activeSlice.amount : total)}</p>
                  {activeSlice && <p className="text-xs text-ink-2">{formatPercent(activeSlice.share)}</p>}
                </div>
              </div>
            </div>

            <ul className="divide-y divide-line/70" aria-label="Utgifter per kategori, størst først">
              {data.map((s, i) => {
                const row = (
                  <span
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  >
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.other ? "var(--c-other)" : themed(s.color) }} />
                    {!s.other && <CategoryIcon icon={s.icon} color={s.color} size="sm" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">{formatMoney(s.amount)}</span>
                      <span className="block text-xs tabular-nums text-ink-3">{formatPercent(s.share)}</span>
                    </span>
                  </span>
                );
                return (
                  <li key={s.id}>
                    {s.href ? (
                      <Link href={s.href} className="block rounded-xl focus-visible:outline-offset-0">
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
