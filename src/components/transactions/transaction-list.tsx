"use client";

import { ArrowLeftRight, CheckCheck, ListChecks, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { approveTransactions, bulkUpdateCategory, deleteTransactions, restoreCategory, setTransfer, updateTransaction } from "@/app/actions/transactions";
import { CategoryIcon } from "@/components/category-chip";
import { CategorySelect, type CategoryValue } from "@/components/category-select";
import { ConfidencePill } from "@/components/transactions/confidence-pill";
import { TransactionDialog } from "@/components/transactions/transaction-dialog";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { capitalize, formatDateLong, formatMoney, plural } from "@/lib/format";
import type { Account, Category, Subcategory, Transaction } from "@/lib/types";
import { cn, toggled } from "@/lib/utils";

type Override = Pick<Transaction, "category_id" | "subcategory_id" | "review_status" | "transfer_status" | "confidence" | "category_source">;

export function TransactionList({
  rows,
  categories,
  subcategories,
  accounts,
  reviewMode,
}: {
  rows: Transaction[];
  categories: Category[];
  subcategories: Subcategory[];
  accounts: Account[];
  reviewMode: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [open, setOpen] = useState<Transaction | null>(null);
  const [editManual, setEditManual] = useState<Transaction | null>(null);
  const [bulk, setBulk] = useState<CategoryValue>({ categoryId: null, subcategoryId: null });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  // Server-data er sannheten – forkast lokale overstyringer når nye rader kommer
  const [seenRows, setSeenRows] = useState(rows);
  if (seenRows !== rows) {
    setSeenRows(rows);
    setOverrides({});
    setSelected((s) => new Set([...s].filter((id) => rows.some((r) => r.id === id))));
  }

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const subById = useMemo(() => new Map(subcategories.map((s) => [s.id, s])), [subcategories]);
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const merged = useMemo(() => rows.map((r) => ({ ...r, ...(overrides[r.id] ?? {}) })), [rows, overrides]);
  const groups = useMemo(() => {
    const out: Array<{ date: string; items: Transaction[] }> = [];
    for (const r of merged) {
      const last = out[out.length - 1];
      if (last && last.date === r.booked_date) last.items.push(r);
      else out.push({ date: r.booked_date, items: [r] });
    }
    return out;
  }, [merged]);

  const showCheckboxes = selectMode || selected.size > 0;
  const toggle = (id: string) => setSelected((s) => toggled(s, id));

  function changeCategory(tx: Transaction, value: CategoryValue) {
    if (!value.categoryId) return;
    const previous = { categoryId: tx.category_id, subcategoryId: tx.subcategory_id };
    setOverrides((o) => ({ ...o, [tx.id]: { category_id: value.categoryId, subcategory_id: value.subcategoryId, review_status: "user", transfer_status: "none", confidence: 1, category_source: "manual" } }));
    start(async () => {
      const res = await updateTransaction({ id: tx.id, categoryId: value.categoryId, subcategoryId: value.subcategoryId, learn: true, applyToSimilar: true });
      if (!res.ok) {
        setOverrides((o) => {
          const n = { ...o };
          delete n[tx.id];
          return n;
        });
        toast.error(res.error);
        return;
      }
      const cat = catById.get(value.categoryId!);
      toast.success(`Flyttet til ${cat?.name ?? "ny kategori"}`, {
        description: [res.ruleSaved ? `Husker valget for «${tx.merchant_key}»` : null, res.similarUpdated > 0 ? `${plural(res.similarUpdated, "lik transaksjon", "like transaksjoner")} oppdatert` : null].filter(Boolean).join(" · ") || undefined,
        action: {
          label: "Angre",
          onClick: () => void restoreCategory({ id: tx.id, ...previous }).then((r) => (r.ok ? router.refresh() : toast.error(r.error))),
        },
      });
    });
  }

  function markTransfer(ids: string[], confirmed: boolean) {
    start(async () => {
      const res = await setTransfer(ids, confirmed);
      if (!res.ok) return void toast.error(res.error);
      toast.success(confirmed ? "Markert som overføring mellom egne kontoer" : "Ikke en overføring – telles som vanlig");
      setSelected(new Set());
    });
  }

  function approve(ids: string[]) {
    start(async () => {
      const res = await approveTransactions(ids);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${plural(res.approved, "transaksjon", "transaksjoner")} godkjent`);
      setSelected(new Set());
    });
  }

  if (merged.length === 0) return null;

  const pendingIds = merged.filter((r) => r.review_status === "review" && r.transfer_status !== "confirmed").map((r) => r.id);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">{reviewMode ? "Se over forslagene og godkjenn – eller endre kategorien direkte i listen." : "Klikk på en transaksjon for detaljer. Endre kategori direkte i listen."}</p>
        <div className="flex gap-2">
          {reviewMode && pendingIds.length > 0 && (
            <Button variant="soft" size="sm" onClick={() => approve(pendingIds)} loading={pending}>
              <CheckCheck /> Godkjenn alle på siden ({pendingIds.length})
            </Button>
          )}
          <Button variant={selectMode ? "soft" : "ghost"} size="sm" className="md:hidden" onClick={() => setSelectMode((m) => !m)}>
            <ListChecks /> Velg
          </Button>
        </div>
      </div>

      <div className="space-y-5 pb-24">
        {groups.map((g) => (
          <section key={g.date} aria-label={formatDateLong(g.date)}>
            <h2 className="mb-2 px-1 text-[13px] font-semibold text-ink-2">{capitalize(formatDateLong(g.date))}</h2>
            <Card className="divide-y divide-line/70 overflow-hidden">
              {g.items.map((tx) => {
                const cat = tx.category_id ? catById.get(tx.category_id) : undefined;
                const sub = tx.subcategory_id ? subById.get(tx.subcategory_id) : undefined;
                const isTransfer = tx.transfer_status === "confirmed";
                const suggested = tx.transfer_status === "suggested";
                const needsReview = tx.review_status === "review";
                const acc = accById.get(tx.account_id);
                return (
                  <div key={tx.id} className={cn("group relative transition-colors hover:bg-surface-2/50", selected.has(tx.id) && "bg-primary-soft/60", needsReview && "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-warn-fill")}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className={cn("shrink-0", showCheckboxes ? "block" : "hidden md:block md:w-[18px] md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100")}>
                        <Checkbox checked={selected.has(tx.id)} onCheckedChange={() => toggle(tx.id)} aria-label={`Velg ${tx.description}`} />
                      </div>
                      <button type="button" onClick={() => setOpen(tx)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Åpne ${tx.description}`}>
                        {isTransfer ? (
                          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                            <ArrowLeftRight className="size-[18px]" />
                          </span>
                        ) : (
                          <CategoryIcon icon={cat?.icon ?? "tag"} color={cat?.color ?? "#898781"} />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-medium">{tx.description}</span>
                          <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-ink-3">
                            <span className="truncate md:hidden">{isTransfer ? "Intern overføring" : cat ? `${cat.name}${sub ? ` › ${sub.name}` : ""}` : "Ukategorisert"}</span>
                            <span className="hidden truncate md:inline">{acc?.name}</span>
                            {tx.note && <span className="hidden truncate md:inline">· {tx.note}</span>}
                            {needsReview && <span className="md:hidden"><ConfidencePill confidence={tx.confidence} source={tx.category_source} compact /></span>}
                          </span>
                        </span>
                      </button>
                      <div className="hidden w-64 shrink-0 items-center gap-2 md:flex lg:w-80">
                        <CategorySelect
                          categories={categories}
                          subcategories={subcategories}
                          value={{ categoryId: tx.category_id, subcategoryId: tx.subcategory_id }}
                          isTransfer={isTransfer}
                          allowTransfer
                          onTransfer={() => markTransfer([tx.id], true)}
                          onChange={(v) => changeCategory(tx, v)}
                          emptyLabel={tx.category_id ? undefined : "Ukategorisert"}
                          aria-label={`Kategori for ${tx.description}`}
                          className="h-9 text-[13px]"
                        />
                        {needsReview && <ConfidencePill confidence={tx.confidence} source={tx.category_source} compact />}
                      </div>
                      <span className={cn("w-28 shrink-0 text-right text-[14.5px] font-semibold tabular-nums", tx.amount < 0 ? "text-neg" : "text-pos")}>
                        {formatMoney(tx.amount, { currency: tx.currency, decimals: 2, signed: true })}
                      </span>
                    </div>
                    {suggested && (
                      <div className="mx-4 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
                        <ArrowLeftRight className="size-4 shrink-0" aria-hidden="true" />
                        <span className="flex-1">Ser ut som en overføring mellom egne kontoer. Stemmer det?</span>
                        <Button size="sm" variant="secondary" onClick={() => markTransfer([tx.id], true)} disabled={pending}>
                          Ja, overføring
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => markTransfer([tx.id], false)} disabled={pending}>
                          Nei
                        </Button>
                      </div>
                    )}
                    {isTransfer && (
                      <div className="px-4 pb-2.5 pl-[3.75rem] text-xs text-ink-3">
                        <Badge tone="neutral">↔ Intern overføring – telles ikke som inntekt/utgift</Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          </section>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur md:bottom-0 md:left-20 lg:left-64">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-2 md:px-4">
            <span className="mr-1 text-sm font-semibold">{selected.size} valgt</span>
            <div className="min-w-44 flex-1 sm:max-w-xs">
              <CategorySelect categories={categories} subcategories={subcategories} value={bulk} onChange={setBulk} emptyLabel="Velg kategori …" aria-label="Kategori for valgte" className="h-9" />
            </div>
            <Button
              size="sm"
              disabled={!bulk.categoryId}
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await bulkUpdateCategory({ ids: [...selected], categoryId: bulk.categoryId!, subcategoryId: bulk.subcategoryId, learn: true });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(`${plural(res.updated, "transaksjon", "transaksjoner")} oppdatert`);
                  setSelected(new Set());
                  setBulk({ categoryId: null, subcategoryId: null });
                })
              }
            >
              Sett kategori
            </Button>
            <Button size="sm" variant="soft" onClick={() => approve([...selected])} disabled={pending}>
              <CheckCheck /> Godkjenn
            </Button>
            <Button size="sm" variant="secondary" onClick={() => markTransfer([...selected], true)} disabled={pending}>
              <ArrowLeftRight /> Overføring
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={pending}>
              <Trash2 /> Slett
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Fjern markering">
              <X />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title={`Slette ${plural(selected.size, "transaksjon", "transaksjoner")}?`} description="Dette kan ikke angres. Vil du heller angre en hel import, finner du det under Importhistorikk.">
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteTransactions([...selected]);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(`${plural(res.deleted, "transaksjon", "transaksjoner")} slettet`);
                  setSelected(new Set());
                  setConfirmDelete(false);
                })
              }
            >
              Slett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionDialog
        tx={open}
        onClose={() => setOpen(null)}
        categories={categories}
        subcategories={subcategories}
        accounts={accounts}
        onEditManual={(tx) => {
          setOpen(null);
          setEditManual(tx);
        }}
      />
      <TransactionFormDialog
        open={!!editManual}
        onOpenChange={(o) => !o && setEditManual(null)}
        accounts={accounts}
        categories={categories}
        subcategories={subcategories}
        editing={
          editManual
            ? { id: editManual.id, accountId: editManual.account_id, date: editManual.booked_date, description: editManual.description, amount: editManual.amount, categoryId: editManual.category_id, subcategoryId: editManual.subcategory_id, note: editManual.note }
            : null
        }
      />
    </>
  );
}
