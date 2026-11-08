"use client";

import { EyeOff, Repeat } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setRecurringStatus } from "@/app/actions/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateShort, formatMoney } from "@/lib/format";
import type { Frequency } from "@/lib/types";

export interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  frequency: Frequency;
  monthly: number;
  nextExpected: string | null;
  isSubscription: boolean;
  ignored: boolean;
  categoryName: string | null;
}

const FREQ: Record<Frequency, string> = { weekly: "ukentlig", monthly: "månedlig", quarterly: "kvartalsvis", yearly: "årlig" };

export function RecurringCard({ items, currency, onlySubscriptions, title, description }: { items: RecurringItem[]; currency: string; onlySubscriptions?: boolean; title: string; description: string }) {
  const [pending, start] = useTransition();
  const [showIgnored, setShowIgnored] = useState(false);
  const list = items.filter((i) => (onlySubscriptions ? i.isSubscription : true) && (showIgnored || !i.ignored));
  const active = list.filter((i) => !i.ignored && i.amount < 0);
  const monthly = active.reduce((n, i) => n + i.monthly, 0);
  const hasIgnored = items.some((i) => i.ignored && (onlySubscriptions ? i.isSubscription : true));

  function toggle(i: RecurringItem) {
    start(async () => {
      const res = await setRecurringStatus(i.id, i.ignored ? "active" : "ignored");
      if (!res.ok) toast.error(res.error);
      else toast.success(i.ignored ? "Tas med i beregningene igjen" : "Skjult og holdes utenfor prognoser");
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary-soft-ink">
            <Repeat className="size-[18px]" />
          </span>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        {active.length > 0 && (
          <div className="text-right">
            <p className="num-display text-xl">{formatMoney(monthly, { currency })}</p>
            <p className="text-xs text-ink-3">per måned</p>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-3">
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-2">Ingen funnet ennå. Vi oppdager gjentakende betalinger når du har flere måneder med transaksjoner.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {list.map((i) => (
              <li key={i.id} className={`flex items-center gap-3 py-3 ${i.ignored ? "opacity-50" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-ink-3">
                    {FREQ[i.frequency]}
                    {i.categoryName ? ` · ${i.categoryName}` : ""}
                    {i.nextExpected && !i.ignored ? ` · neste ca. ${formatDateShort(i.nextExpected)}` : ""}
                  </p>
                </div>
                {i.isSubscription && !onlySubscriptions && <Badge tone="primary">Abonnement</Badge>}
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${i.amount > 0 ? "text-pos" : ""}`}>{formatMoney(i.amount, { currency })}</span>
                <Button variant="ghost" size="icon-sm" aria-label={i.ignored ? `Ta med ${i.name} igjen` : `Skjul ${i.name}`} title={i.ignored ? "Ta med igjen" : "Skjul"} onClick={() => toggle(i)} disabled={pending}>
                  <EyeOff />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {hasIgnored && (
          <button type="button" onClick={() => setShowIgnored((s) => !s)} className="mt-3 text-xs font-medium text-accent hover:underline">
            {showIgnored ? "Skjul ignorerte" : "Vis ignorerte"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
