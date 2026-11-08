"use client";

import { AlertTriangle, Check, CheckCircle2, Copy, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { applyBudgetSuggestions, copyBudget, getBudgetSuggestions, setBudgetAmount, setPlannedIncome } from "@/app/actions/budgets";
import { CategoryIcon } from "@/components/category-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Meter } from "@/components/ui/progress";
import { statusOf } from "@/lib/finance/budget";
import type { SuggestionResult } from "@/lib/finance/budget";
import { formatMoney } from "@/lib/format";
import type { PeriodType } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface BudgetRow {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  planned: number | null;
  spent: number;
}

const parseAmount = (s: string): number | null => {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export function BudgetEditor({
  periodType,
  periodStart,
  rows,
  currency,
  plannedIncome,
  copyFrom,
  copyFromLabel,
  periodLabel,
}: {
  periodType: PeriodType;
  periodStart: string;
  rows: BudgetRow[];
  currency: string;
  plannedIncome: number | null;
  /** Periode å kopiere fra (eget eller arvet budsjett) */
  copyFrom: string | null;
  copyFromLabel: string | null;
  periodLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Kun brukerens ikke-lagrede endringer holdes lokalt; resten vises direkte fra serverdata
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [incomeEdit, setIncomeEdit] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const plannedText = (r: BudgetRow) => (r.planned ? String(r.planned) : "");
  const valueOf = (r: BudgetRow) => edits[r.categoryId] ?? plannedText(r);
  const income = incomeEdit ?? (plannedIncome ? String(plannedIncome) : "");

  const clearEdit = (id: string) =>
    setEdits((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });

  function save(row: BudgetRow) {
    const parsed = parseAmount(valueOf(row));
    if (parsed === null) {
      toast.error("Skriv et gyldig beløp");
      return;
    }
    if (parsed === (row.planned ?? 0)) {
      clearEdit(row.categoryId);
      return;
    }
    start(async () => {
      const res = await setBudgetAmount({ periodType, periodStart, categoryId: row.categoryId, amount: parsed });
      if (!res.ok) return void toast.error(res.error);
      clearEdit(row.categoryId);
      setSaved(row.categoryId);
      setTimeout(() => setSaved((s) => (s === row.categoryId ? null : s)), 1600);
    });
  }

  function saveIncome() {
    const parsed = parseAmount(income);
    if (parsed === null) return void toast.error("Skriv et gyldig beløp");
    if (parsed === (plannedIncome ?? 0)) return setIncomeEdit(null);
    start(async () => {
      const res = await setPlannedIncome({ periodType, periodStart, plannedIncome: parsed === 0 ? null : parsed });
      if (!res.ok) return void toast.error(res.error);
      setIncomeEdit(null);
    });
  }

  function copy() {
    if (!copyFrom) return;
    start(async () => {
      const res = await copyBudget({ periodType, fromStart: copyFrom, toStart: periodStart });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Kopierte ${res.lines} budsjettlinjer fra ${copyFromLabel}`);
      router.refresh();
    });
  }

  const planned = rows.filter((r) => (r.planned ?? 0) > 0);
  const others = rows.filter((r) => !(r.planned ?? 0) && r.spent > 0);
  const empty = rows.filter((r) => !(r.planned ?? 0) && r.spent <= 0);
  const ordered = [...planned.sort((a, b) => b.spent / (b.planned ?? 1) - a.spent / (a.planned ?? 1)), ...others.sort((a, b) => b.spent - a.spent), ...empty];

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        <Button onClick={() => setSuggestOpen(true)}>
          <Sparkles /> Foreslå budsjett
        </Button>
        {copyFrom && (
          <Button variant="secondary" onClick={copy} loading={pending}>
            <Copy /> Kopier fra {copyFromLabel}
          </Button>
        )}
      </div>

      <Card className="mb-5">
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-sm font-medium">Forventet inntekt i {periodLabel}</p>
            <p className="text-xs text-ink-2">Brukes til å vise hvor mye som er uplanlagt eller kan gå til sparing.</p>
          </div>
          <div className="flex items-center gap-2">
            <Input aria-label="Planlagt inntekt" inputMode="numeric" className="w-36 text-right" placeholder="0" value={income} onChange={(e) => setIncomeEdit(e.target.value)} onBlur={saveIncome} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
            <span className="text-sm text-ink-2">{currency === "NOK" ? "kr" : currency}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kategorier</CardTitle>
          <span className="text-xs text-ink-3">Skriv inn beløp – lagres automatisk</span>
        </CardHeader>
        <CardContent className="pt-2">
          <ul className="divide-y divide-line/70">
            {ordered.map((r) => {
              const plannedNum = parseAmount(valueOf(r)) ?? r.planned ?? 0;
              const status = plannedNum > 0 ? statusOf(plannedNum, r.spent) : r.spent > 0 ? "over" : "none";
              const remaining = plannedNum - r.spent;
              return (
                <li key={r.categoryId} className="py-4">
                  <div className="flex items-center gap-3">
                    <CategoryIcon icon={r.icon} color={r.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-xs text-ink-2">
                        Brukt <span className="font-medium tabular-nums text-ink">{formatMoney(r.spent, { currency })}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        aria-label={`Budsjett for ${r.name}`}
                        inputMode="numeric"
                        className="h-9 w-28 text-right"
                        placeholder="Ikke satt"
                        value={valueOf(r)}
                        onChange={(e) => setEdits((v) => ({ ...v, [r.categoryId]: e.target.value }))}
                        onBlur={() => save(r)}
                        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                      />
                      <span className="grid size-5 place-items-center text-pos" aria-live="polite">
                        {saved === r.categoryId && <Check className="size-4" aria-label="Lagret" />}
                      </span>
                    </div>
                  </div>
                  {plannedNum > 0 && (
                    <div className="mt-3 pl-12">
                      <Meter value={r.spent / plannedNum} tone={status === "over" ? "over" : status === "warn" ? "warn" : "ok"} label={`${r.name}: ${formatMoney(r.spent, { currency })} av ${formatMoney(plannedNum, { currency })}`} />
                      <p className={cn("mt-1.5 flex items-center gap-1 text-xs", status === "over" ? "text-neg" : status === "warn" ? "text-warn" : "text-ink-2")}>
                        {status === "over" ? <AlertTriangle className="size-3.5" aria-hidden="true" /> : <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                        {status === "over" ? `Overskredet med ${formatMoney(-remaining, { currency })}` : `${formatMoney(remaining, { currency })} gjenstår`}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <SuggestDialog open={suggestOpen} onOpenChange={setSuggestOpen} periodType={periodType} periodStart={periodStart} rows={rows} currency={currency} onApplied={() => router.refresh()} />
    </>
  );
}

function SuggestDialog({
  open,
  onOpenChange,
  periodType,
  periodStart,
  rows,
  currency,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  periodType: PeriodType;
  periodStart: string;
  rows: BudgetRow[];
  currency: string;
  onApplied: () => void;
}) {
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const byId = new Map(rows.map((r) => [r.categoryId, r]));
  const loading = open && !result && !failed;

  useEffect(() => {
    if (!open || result || failed) return;
    let alive = true;
    getBudgetSuggestions().then((res) => {
      if (!alive) return;
      if (!res.ok) {
        setFailed(true);
        toast.error(res.error);
        return;
      }
      setResult(res.result);
    });
    return () => {
      alive = false;
    };
  }, [open, result, failed]);

  function handleOpenChange(o: boolean) {
    if (!o) {
      // Ferske forslag neste gang dialogen åpnes
      setResult(null);
      setFailed(false);
    }
    onOpenChange(o);
  }

  // Ukebudsjett: omregn månedsbeløp til uke
  const factor = periodType === "week" ? 12 / 52 : 1;
  const scaled = (result?.suggestions ?? []).map((s) => ({ ...s, amount: Math.max(50, Math.round((s.suggested * factor) / 10) * 10) }));

  function apply() {
    start(async () => {
      const res = await applyBudgetSuggestions({
        periodType,
        periodStart,
        items: scaled.map((s) => ({ categoryId: s.categoryId, amount: s.amount })),
        plannedIncome: result?.suggestedIncome ? Math.round(result.suggestedIncome * factor) : undefined,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Budsjett laget (${res.lines} kategorier)`);
      handleOpenChange(false);
      onApplied();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent title="Foreslått budsjett" description="Basert på dine faktiske utgifter de siste månedene.">
        {loading ? (
          <p className="py-8 text-center text-sm text-ink-2">Regner ut forslag …</p>
        ) : !result || scaled.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-2">Vi trenger minst noen dager med transaksjoner for å kunne foreslå et budsjett. Importer en bankfil først.</p>
        ) : (
          <>
            <p className="rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary-soft-ink">
              {result.usedPartialMonth ? "Bygger på bare inneværende måned – et foreløpig anslag." : `Bygger på ${result.months.length} ${result.months.length === 1 ? "måned" : "måneder"} med data.`}
              {result.months.length < 3 && !result.usedPartialMonth ? " Med flere måneder blir forslaget sikrere." : ""}
              {periodType === "week" ? " Månedsbeløpene er regnet om til uke." : ""}
            </p>
            <ul className="mt-4 divide-y divide-line">
              {scaled.map((s) => {
                const r = byId.get(s.categoryId);
                if (!r) return null;
                return (
                  <li key={s.categoryId} className="flex items-center gap-3 py-2.5">
                    <CategoryIcon icon={r.icon} color={r.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatMoney(s.amount, { currency })}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-ink-3">Dette erstatter beløpene i denne perioden. Du kan justere hver kategori etterpå.</p>
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={apply} loading={pending} disabled={loading || scaled.length === 0}>
            Bruk forslaget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
