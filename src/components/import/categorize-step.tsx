"use client";

import { AlertTriangle, CheckCheck, Info, Repeat, Sparkles, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CategorySelect, type CategoryValue } from "@/components/category-select";
import { ConfidencePill } from "@/components/transactions/confidence-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate, formatMoney, plural } from "@/lib/format";
import type { Category, Subcategory } from "@/lib/types";
import { cn, toggled } from "@/lib/utils";
import { needsAttention, type ReviewRow } from "./types";

const PAGE_SIZE = 40;
type Filter = "attention" | "duplicates" | "all";

export function CategorizeStep({
  rows,
  setRows,
  categories,
  subcategories,
  ai,
  learn,
  onLearnChange,
  onBack,
  onCommit,
  committing,
  error,
  currency,
}: {
  rows: ReviewRow[];
  setRows: (updater: (rows: ReviewRow[]) => ReviewRow[]) => void;
  categories: Category[];
  subcategories: Subcategory[];
  ai: { used: boolean; available: boolean; note: string | null };
  learn: boolean;
  onLearnChange: (v: boolean) => void;
  onBack: () => void;
  onCommit: () => void;
  committing: boolean;
  error: string | null;
  currency: string;
}) {
  const attention = useMemo(() => rows.filter(needsAttention), [rows]);
  const dups = useMemo(() => rows.filter((r) => r.duplicate !== "none"), [rows]);
  const [filter, setFilter] = useState<Filter>(attention.length > 0 ? "attention" : "all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState<CategoryValue>({ categoryId: null, subcategoryId: null });
  const [note, setNote] = useState<string | null>(null);

  const visible = filter === "attention" ? attention : filter === "duplicates" ? dups : rows;
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const included = rows.filter((r) => r.include);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  function apply(indices: number[], value: CategoryValue | "transfer") {
    const keys = new Set(rows.filter((r) => indices.includes(r.index)).map((r) => r.merchantKey));
    setRows((prev) =>
      prev.map((r) => {
        const direct = indices.includes(r.index);
        // Like transaksjoner (samme butikk) som brukeren ikke selv har rørt, følger med
        const sibling = !direct && !r.edited && value !== "transfer" && keys.has(r.merchantKey) && r.merchantKey.length > 2;
        if (!direct && !sibling) return r;
        return value === "transfer"
          ? { ...r, categoryId: null, subcategoryId: null, transfer: "confirmed", source: "manual", confidence: 1, approved: true, edited: direct || r.edited }
          : { ...r, categoryId: value.categoryId, subcategoryId: value.subcategoryId, transfer: "none", source: "manual", confidence: 1, approved: true, edited: direct || r.edited };
      }),
    );
    const estimate = rows.filter((r) => !indices.includes(r.index) && !r.edited && value !== "transfer" && keys.has(r.merchantKey)).length;
    setNote(estimate > 0 ? `Oppdaterte også ${plural(estimate, "lik transaksjon", "like transaksjoner")} fra samme butikk.` : null);
  }

  function approveAll() {
    setRows((prev) => prev.map((r) => (r.include && r.source !== "default" && r.transfer !== "suggested" ? { ...r, approved: true } : r)));
    setNote("Alle forslag er godkjent. Transaksjoner uten treff venter fortsatt på kategori.");
    setFilter("all");
  }

  function toggleInclude(index: number) {
    setRows((prev) => prev.map((r) => (r.index === index ? { ...r, include: !r.include } : r)));
  }

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.index));
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      for (const r of pageRows) {
        if (allOnPage) n.delete(r.index);
        else n.add(r.index);
      }
      return n;
    });

  const tabs: Array<{ id: Filter; label: string; count: number }> = [
    { id: "attention", label: "Trenger oppmerksomhet", count: attention.length },
    { id: "duplicates", label: "Duplikater", count: dups.length },
    { id: "all", label: "Alle", count: rows.length },
  ];

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-start gap-4 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">Sjekk kategoriene</h2>
          <p className="mt-1 text-sm text-ink-2">
            Vi har foreslått kategori for hver transaksjon. Endre det som ikke stemmer – appen husker valgene dine til neste gang.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {ai.used && (
              <Badge tone="primary">
                <Sparkles className="size-3" aria-hidden="true" /> AI hjalp til med usikre transaksjoner
              </Badge>
            )}
            {!ai.available && (
              <Badge>
                <Info className="size-3" aria-hidden="true" /> AI er ikke aktiv – usikre sendes til godkjenning
              </Badge>
            )}
            {ai.note && (
              <Badge tone="warn">
                <AlertTriangle className="size-3" aria-hidden="true" /> {ai.note}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="soft" onClick={approveAll}>
          <CheckCheck /> Godkjenn alle forslag
        </Button>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-ctl bg-surface-2 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={filter === t.id}
              onClick={() => {
                setFilter(t.id);
                setPage(0);
              }}
              className={cn("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 text-[13px] font-medium text-ink-2", filter === t.id && "bg-surface text-ink shadow-sm")}
            >
              {t.label}
              <span className={cn("rounded-full px-1.5 text-[11px]", filter === t.id ? "bg-primary-soft text-primary-soft-ink" : "bg-line text-ink-2")}>{t.count}</span>
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <Checkbox checked={learn} onCheckedChange={(v) => onLearnChange(v === true)} aria-label="Husk valgene mine" />
          Husk valgene mine til neste gang
        </label>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft p-3 text-primary-soft-ink shadow-card animate-fade-up">
          <span className="text-sm font-semibold">{selected.size} valgt</span>
          <div className="min-w-48 flex-1 sm:max-w-xs">
            <CategorySelect categories={categories} subcategories={subcategories} value={bulk} onChange={setBulk} emptyLabel="Velg kategori …" aria-label="Kategori for valgte" />
          </div>
          <Button
            disabled={!bulk.categoryId}
            onClick={() => {
              apply([...selected], bulk);
              setSelected(new Set());
            }}
          >
            Bruk på valgte
          </Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Avbryt
          </Button>
        </div>
      )}
      {note && (
        <p role="status" className="rounded-ctl bg-pos-soft px-4 py-2.5 text-sm text-pos">
          {note}
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[32px_92px_minmax(0,1fr)_112px_minmax(190px,250px)_116px] items-center gap-3 border-b border-line bg-surface-2/60 px-4 py-2.5 text-xs font-medium text-ink-3 md:grid">
          <Checkbox checked={allOnPage ? true : selected.size > 0 && pageRows.some((r) => selected.has(r.index)) ? "indeterminate" : false} onCheckedChange={toggleAll} aria-label="Velg alle på siden" />
          <span>Dato</span>
          <span>Beskrivelse</span>
          <span className="text-right">Beløp</span>
          <span>Kategori</span>
          <span>Sikkerhet</span>
        </div>
        {pageRows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-ink-2">
            {filter === "attention" ? "Alt ser bra ut – ingenting trenger oppmerksomhet. 🎉" : filter === "duplicates" ? "Ingen duplikater funnet." : "Ingen transaksjoner."}
          </p>
        ) : (
          <ul>
            {pageRows.map((r) => {
              const cat = r.categoryId ? catById.get(r.categoryId) : undefined;
              const dup = r.duplicate !== "none";
              return (
                <li key={r.index} className={cn("grid gap-x-3 gap-y-2 border-b border-line/60 px-4 py-3 last:border-0 md:grid-cols-[32px_92px_minmax(0,1fr)_112px_minmax(190px,250px)_116px] md:items-center", !r.include && "opacity-55")}>
                  <div className="hidden md:block">
                    <Checkbox checked={selected.has(r.index)} onCheckedChange={() => setSelected((s) => toggled(s, r.index))} aria-label={`Velg ${r.display}`} />
                  </div>
                  <span className="hidden text-sm text-ink-2 md:block">{formatDate(r.date)}</span>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3 md:block">
                      <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-medium" title={r.description}>
                          {r.display}
                        </p>
                        <p className="truncate text-xs text-ink-3 md:hidden">{formatDate(r.date)}</p>
                      </div>
                      <span className={cn("shrink-0 text-sm font-semibold tabular-nums md:hidden", r.amount < 0 ? "text-neg" : "text-pos")}>{formatMoney(r.amount, { currency, decimals: 2, signed: true })}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {r.transfer !== "none" && <Badge tone={r.transfer === "confirmed" ? "primary" : "warn"}>↔ {r.transfer === "confirmed" ? "Intern overføring" : "Mulig overføring"}</Badge>}
                      {r.isSubscription && (
                        <Badge tone="neutral">
                          <Repeat className="size-3" aria-hidden="true" /> Abonnement
                        </Badge>
                      )}
                      {r.isRefund && <Badge tone="pos">Tilbakebetaling</Badge>}
                      {r.duplicate === "exact" && <Badge tone="neutral">Allerede importert</Badge>}
                      {r.duplicate === "possible" && <Badge tone="warn">Mulig duplikat</Badge>}
                      <span className="truncate text-xs text-ink-3" title={r.reason}>{r.reason}</span>
                    </div>
                  </div>
                  <span className={cn("hidden text-right text-sm font-semibold tabular-nums md:block", r.amount < 0 ? "text-neg" : "text-pos")}>
                    {formatMoney(r.amount, { currency, decimals: 2, signed: true })}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="md:hidden">
                      <Checkbox checked={selected.has(r.index)} onCheckedChange={() => setSelected((s) => toggled(s, r.index))} aria-label={`Velg ${r.display}`} />
                    </div>
                    <CategorySelect
                      categories={categories}
                      subcategories={subcategories}
                      value={{ categoryId: r.categoryId, subcategoryId: r.subcategoryId }}
                      isTransfer={r.transfer === "confirmed"}
                      allowTransfer
                      onTransfer={() => apply([r.index], "transfer")}
                      onChange={(v) => apply([r.index], v)}
                      aria-label={`Kategori for ${r.display}`}
                      className={cn("h-9 flex-1 text-[13px]", cat && "font-medium")}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <ConfidencePill confidence={r.confidence} source={r.source} approved={r.approved} reason={r.reason} compact />
                    {dup && (
                      <button type="button" onClick={() => toggleInclude(r.index)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-accent hover:bg-primary-soft">
                        {r.include ? "Hopp over" : <><Undo2 className="size-3" aria-hidden="true" /> Importer</>}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <Button variant="ghost" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              Forrige
            </Button>
            <span className="text-ink-2">
              Side {safePage + 1} av {pageCount}
            </span>
            <Button variant="ghost" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
              Neste
            </Button>
          </div>
        )}
      </Card>

      {error && (
        <p role="alert" className="rounded-ctl bg-neg-soft px-4 py-3 text-sm text-neg">
          {error}
        </p>
      )}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur md:bottom-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{plural(included.length, "transaksjon", "transaksjoner")} importeres</p>
            <p className="truncate text-ink-2">{attention.length > 0 ? `${attention.length} venter på godkjenning etterpå` : "Alt er godkjent"}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={onBack} disabled={committing}>
              Tilbake
            </Button>
            <Button size="lg" onClick={onCommit} loading={committing} disabled={included.length === 0}>
              Importer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

