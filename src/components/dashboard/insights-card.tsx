"use client";

import { AlertTriangle, CheckCircle2, Info, Lightbulb, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { dismissInsight } from "@/app/actions/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinancialInsight, InsightSeverity } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON: Record<InsightSeverity, { Icon: typeof Info; cls: string; label: string }> = {
  good: { Icon: CheckCircle2, cls: "bg-pos-soft text-pos", label: "Bra" },
  info: { Icon: Info, cls: "bg-primary-soft text-primary-soft-ink", label: "Info" },
  warn: { Icon: AlertTriangle, cls: "bg-warn-soft text-warn", label: "Obs" },
  bad: { Icon: XCircle, cls: "bg-neg-soft text-neg", label: "Viktig" },
};

/** Korte, vennlige observasjoner. Ikon + tekst bærer alvorlighet (aldri farge alene). */
export function InsightsCard({
  insights,
  limit,
  title = "Smarte innsikter",
  description,
  moreHref,
}: {
  insights: FinancialInsight[];
  limit?: number;
  title?: string;
  description?: string;
  moreHref?: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const visible = insights.filter((i) => !hidden.has(i.id));
  const shown = limit ? visible.slice(0, limit) : visible;

  function dismiss(id: string) {
    setHidden((h) => new Set(h).add(id));
    start(async () => {
      const res = await dismissInsight(id);
      if (!res.ok) {
        toast.error(res.error);
        setHidden((h) => {
          const n = new Set(h);
          n.delete(id);
          return n;
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary-soft-ink">
            <Lightbulb className="size-[18px]" />
          </span>
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
        {moreHref && visible.length > (limit ?? 0) && (
          <Link href={moreHref} className="text-[13px] font-medium text-accent hover:underline">
            Se alle ({visible.length})
          </Link>
        )}
      </CardHeader>
      <CardContent className="pt-3">
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-2">Ingen innsikter akkurat nå. Importer flere måneder med transaksjoner, så blir tipsene mer treffsikre.</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((i, idx) => {
              const { Icon, cls, label } = ICON[i.severity];
              return (
                <li key={i.id} className="group flex items-start gap-3 rounded-2xl border border-line/70 bg-surface-2/50 p-3.5 animate-fade-up" style={{ animationDelay: `${idx * 60}ms` }}>
                  <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl", cls)}>
                    <Icon className="size-[17px]" aria-hidden="true" />
                    <span className="sr-only">{label}:</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold leading-snug">{i.title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{i.body}</p>
                    {i.confidence === "low" && <p className="mt-1 text-xs text-ink-3">Foreløpig – basert på lite data.</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(i.id)}
                    aria-label={`Skjul innsikt: ${i.title}`}
                    className="-mr-1 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 opacity-60 transition hover:bg-surface hover:text-ink hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
