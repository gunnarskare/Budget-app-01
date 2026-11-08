import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/category-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Meter } from "@/components/ui/progress";
import type { BudgetLine } from "@/lib/finance/budget";
import { formatMoney } from "@/lib/format";
import type { Lookups } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Budsjettstatus per hovedkategori: måler + «gjenstår»/«overskredet» i klartekst. */
export function BudgetIndicators({
  lines,
  lk,
  limit = 6,
  inheritedNote,
  currency = "NOK",
}: {
  lines: BudgetLine[];
  lk: Lookups;
  limit?: number;
  inheritedNote?: string | null;
  currency?: string;
}) {
  const sorted = [...lines].sort((a, b) => b.ratio - a.ratio).slice(0, limit);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Budsjett per kategori</CardTitle>
          <CardDescription>{inheritedNote ?? "Brukt mot planlagt denne måneden"}</CardDescription>
        </div>
        <Link href="/budsjett" className="text-[13px] font-medium text-accent hover:underline">
          Åpne budsjett
        </Link>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-2">
            Du har ikke satt noe budsjett ennå.{" "}
            <Link href="/budsjett" className="font-medium text-accent hover:underline">
              Lag budsjett
            </Link>
          </p>
        ) : (
          <ul className="space-y-4">
            {sorted.map((l) => {
              const cat = lk.categories.get(l.categoryId);
              if (!cat) return null;
              const over = l.status === "over";
              return (
                <li key={l.categoryId}>
                  <div className="mb-1.5 flex items-center gap-3">
                    <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{cat.name}</span>
                    <span className="text-xs tabular-nums text-ink-2">
                      {formatMoney(l.spent, { currency })} <span className="text-ink-3">av {formatMoney(l.planned, { currency })}</span>
                    </span>
                  </div>
                  <Meter value={l.ratio} tone={l.status === "over" ? "over" : l.status === "warn" ? "warn" : "ok"} label={`${cat.name}: ${formatMoney(l.spent, { currency })} av ${formatMoney(l.planned, { currency })}`} />
                  <p className={cn("mt-1 flex items-center gap-1 text-xs", over ? "text-neg" : l.status === "warn" ? "text-warn" : "text-ink-3")}>
                    {over ? <AlertTriangle className="size-3" aria-hidden="true" /> : <CheckCircle2 className="size-3" aria-hidden="true" />}
                    {over ? `Overskredet med ${formatMoney(-l.remaining, { currency })}` : `Gjenstår ${formatMoney(l.remaining, { currency })}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
