"use client";

import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { getCategoryTransactions } from "@/app/actions/transactions";
import { CategoryIcon } from "@/components/category-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BarItem {
  id: string | null;
  name: string;
  icon: string;
  color: string;
  amount: number;
  share: number;
  prev: number | null;
}

interface DrillRow {
  id: string;
  booked_date: string;
  description: string;
  amount: number;
}

/**
 * Utgifter per kategori som rangerte, horisontale stolper (én farge – lengden bærer verdien).
 * Trykk på en kategori for å se transaksjonene bak tallet.
 */
export function CategoryBars({ items, from, to, currency, title = "Utgifter per kategori", description, compareLabel }: { items: BarItem[]; from: string; to: string; currency: string; title?: string; description?: string; compareLabel?: string }) {
  const [open, setOpen] = useState<BarItem | null>(null);
  const [rows, setRows] = useState<DrillRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const max = Math.max(1, ...items.map((i) => i.amount));

  function show(item: BarItem) {
    setOpen(item);
    setRows(null);
    setError(null);
    start(async () => {
      const res = await getCategoryTransactions({ categoryId: item.id, from, to });
      if (!res.ok) return setError(res.error);
      setRows(res.rows);
      setTruncated(res.truncated);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-2">Ingen utgifter i denne perioden.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((it) => {
              const change = it.prev && it.prev > 0 ? (it.amount - it.prev) / it.prev : null;
              return (
                <li key={it.id ?? "none"}>
                  <button type="button" onClick={() => show(it)} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-2" aria-label={`${it.name}: ${formatMoney(it.amount, { currency })}. Vis transaksjoner`}>
                    <CategoryIcon icon={it.icon} color={it.color} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium">{it.name}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(it.amount, { currency })}</span>
                      </span>
                      <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--c1)_14%,var(--surface))]">
                        <span className="block h-full origin-left animate-grow rounded-full bg-[var(--c1)]" style={{ width: `${(it.amount / max) * 100}%` }} />
                      </span>
                      <span className="mt-1 flex items-center justify-between text-xs text-ink-3">
                        <span>{formatPercent(it.share)} av totalen</span>
                        {change !== null && (
                          <span className={cn("inline-flex items-center gap-0.5", change > 0.05 ? "text-neg" : change < -0.05 ? "text-pos" : "")}>
                            {change > 0.05 ? <ArrowUpRight className="size-3" aria-hidden="true" /> : change < -0.05 ? <ArrowDownRight className="size-3" aria-hidden="true" /> : null}
                            {Math.abs(Math.round(change * 100))} % {change >= 0 ? "mer" : "mindre"} {compareLabel}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent title={open?.name ?? ""} description={open ? `${formatDate(from)} – ${formatDate(to)}` : undefined}>
          {pending && <p className="py-8 text-center text-sm text-ink-2">Henter transaksjoner …</p>}
          {error && <p className="rounded-ctl bg-neg-soft px-3.5 py-2.5 text-sm text-neg">{error}</p>}
          {rows && rows.length === 0 && <p className="py-8 text-center text-sm text-ink-2">Ingen transaksjoner.</p>}
          {rows && rows.length > 0 && (
            <>
              <ul className="divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-16 shrink-0 text-xs text-ink-3">{formatDate(r.booked_date)}</span>
                    <span className="min-w-0 flex-1 truncate">{r.description}</span>
                    <span className={cn("shrink-0 font-semibold tabular-nums", r.amount < 0 ? "text-neg" : "text-pos")}>{formatMoney(r.amount, { currency, decimals: 2, signed: true })}</span>
                  </li>
                ))}
              </ul>
              {truncated && <p className="mt-2 text-xs text-ink-3">Viser de 200 nyeste. Åpne transaksjonslisten for alle.</p>}
              {open && (
                <Button asChild variant="soft" className="mt-4 w-full">
                  <Link href={`/transaksjoner?kategori=${open.id ?? "ukategorisert"}&fra=${from}&til=${to}`}>Åpne i transaksjonslisten</Link>
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
