"use client";

import { BarChart3, Table2 } from "lucide-react";
import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface TableData {
  caption: string;
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
}

/** Kort rundt et diagram, med mulighet for å bytte til tabellvisning (tilgjengelig alternativ). */
export function ChartCard({
  title,
  description,
  legend,
  table,
  children,
  className,
}: {
  title: string;
  description?: string;
  legend?: React.ReactNode;
  table: TableData;
  children: React.ReactNode;
  className?: string;
}) {
  const [view, setView] = React.useState<"chart" | "table">("chart");
  return (
    <Card className={className}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <button
          type="button"
          onClick={() => setView(view === "chart" ? "table" : "chart")}
          aria-pressed={view === "table"}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {view === "chart" ? <Table2 className="size-3.5" aria-hidden="true" /> : <BarChart3 className="size-3.5" aria-hidden="true" />}
          {view === "chart" ? "Tabell" : "Diagram"}
        </button>
      </CardHeader>
      <CardContent>
        {legend && view === "chart" && <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">{legend}</div>}
        {view === "chart" ? (
          children
        ) : (
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{table.caption}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  {table.columns.map((c, i) => (
                    <th key={c} scope="col" className={cn("py-2 pr-3 font-medium", i > 0 && "text-right")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, ri) => (
                  <tr key={ri} className="border-b border-line/60 last:border-0">
                    {r.map((cell, ci) => (
                      <td key={ci} className={cn("py-2 pr-3 tabular-nums", ci > 0 && "text-right")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Legendenøkkel: kort strek/firkant i seriens farge + tekst i tekstfarge (aldri seriefargen). */
export function LegendKey({ color, label, shape = "box" }: { color: string; label: string; shape?: "box" | "line" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={shape === "line" ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-[3px]"} style={{ background: color }} />
      {label}
    </span>
  );
}
