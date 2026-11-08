"use client";

import { Lock, PenLine, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteTransactions, setTransfer, updateTransaction } from "@/app/actions/transactions";
import { CategorySelect, type CategoryValue } from "@/components/category-select";
import { ConfidencePill } from "@/components/transactions/confidence-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatDate, formatMoney } from "@/lib/format";
import type { Account, Category, Subcategory, Transaction } from "@/lib/types";

/** Detaljer og redigering av én transaksjon. Originaldata fra banken kan ikke endres. */
type Props = {
  onClose: () => void;
  categories: Category[];
  subcategories: Subcategory[];
  accounts: Account[];
  onEditManual: (tx: Transaction) => void;
};

export function TransactionDialog({ tx, ...rest }: { tx: Transaction | null } & Props) {
  if (!tx) return null;
  // key: skjemaet starter på nytt for hver transaksjon
  return <TransactionDialogBody key={tx.id} tx={tx} {...rest} />;
}

function TransactionDialogBody({ tx, onClose, categories, subcategories, accounts, onEditManual }: { tx: Transaction } & Props) {
  const [pending, start] = useTransition();
  const [category, setCategory] = useState<CategoryValue>({ categoryId: tx.category_id, subcategoryId: tx.subcategory_id });
  const [description, setDescription] = useState(tx.description);
  const [note, setNote] = useState(tx.note ?? "");
  const [isTransfer, setIsTransfer] = useState(tx.transfer_status === "confirmed");
  const [learn, setLearn] = useState(true);
  const [similar, setSimilar] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const account = accounts.find((a) => a.id === tx.account_id);
  const categoryChanged = category.categoryId !== tx.category_id || category.subcategoryId !== tx.subcategory_id;
  const transferChanged = isTransfer !== (tx.transfer_status === "confirmed");

  function save() {
    setError(null);
    start(async () => {
      if (transferChanged) {
        const res = await setTransfer([tx.id], isTransfer);
        if (!res.ok) return setError(res.error);
      }
      const patch: Parameters<typeof updateTransaction>[0] = { id: tx.id };
      if (description.trim() && description.trim() !== tx.description) patch.description = description.trim();
      if ((note || null) !== tx.note) patch.note = note || null;
      if (categoryChanged && !isTransfer) {
        patch.categoryId = category.categoryId;
        patch.subcategoryId = category.subcategoryId;
        patch.learn = learn && !!category.categoryId;
        patch.applyToSimilar = similar && !!category.categoryId;
      }
      if (Object.keys(patch).length > 1) {
        const res = await updateTransaction(patch);
        if (!res.ok) return setError(res.error);
        if (res.ruleSaved || res.similarUpdated > 0) {
          toast.success(res.similarUpdated > 0 ? `Lagret · ${res.similarUpdated} like transaksjoner oppdatert` : "Lagret · valget huskes til neste gang");
        } else toast.success("Lagret");
      } else if (transferChanged) toast.success("Lagret");
      onClose();
    });
  }

  function remove() {
    start(async () => {
      const res = await deleteTransactions([tx.id]);
      if (!res.ok) return setError(res.error);
      toast.success("Transaksjonen er slettet");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Transaksjon" description={`${formatDate(tx.booked_date)} · ${account?.name ?? "Konto"}`}>
        <div className="mt-1 space-y-5">
          <div className="flex items-end justify-between gap-3">
            <p className={`num-display text-4xl ${tx.amount < 0 ? "text-neg" : "text-pos"}`}>{formatMoney(tx.amount, { currency: tx.currency, decimals: 2, signed: true })}</p>
            <ConfidencePill confidence={tx.confidence} source={tx.category_source} approved={tx.review_status === "user"} />
          </div>

          <div className="rounded-2xl bg-surface-2 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
              <Lock className="size-3" aria-hidden="true" /> Original fra banken (kan ikke endres)
            </p>
            <p className="mt-1 break-words text-sm">{tx.original_description}</p>
          </div>

          <Field label="Visningsnavn" htmlFor="td-name">
            <Input id="td-name" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </Field>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Overføring mellom egne kontoer</span>
              <span className="block text-xs text-ink-2">Telles verken som inntekt eller utgift.</span>
            </span>
            <Switch checked={isTransfer} onCheckedChange={setIsTransfer} aria-label="Intern overføring" />
          </label>

          {!isTransfer && (
            <>
              <Field label="Kategori" htmlFor="td-cat">
                <CategorySelect id="td-cat" categories={categories} subcategories={subcategories} value={category} onChange={setCategory} emptyLabel="Ukategorisert" />
              </Field>
              {categoryChanged && category.categoryId && (
                <div className="space-y-2.5 rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary-soft-ink">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <Checkbox checked={learn} onCheckedChange={(v) => setLearn(v === true)} />
                    Husk dette for fremtidige «{tx.merchant_key || tx.description}»
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <Checkbox checked={similar} onCheckedChange={(v) => setSimilar(v === true)} />
                    Oppdater like transaksjoner som ikke er godkjent
                  </label>
                </div>
              )}
            </>
          )}

          <Field label="Notat" htmlFor="td-note">
            <Input id="td-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Valgfritt" />
          </Field>

          {error && (
            <p role="alert" className="rounded-ctl bg-neg-soft px-3.5 py-2.5 text-sm text-neg">
              {error}
            </p>
          )}

          {confirmDelete ? (
            <div className="rounded-2xl bg-neg-soft p-4">
              <p className="text-sm font-medium text-neg">Slette denne transaksjonen?</p>
              <p className="mt-1 text-xs text-neg/80">Dette kan ikke angres.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="destructive" size="sm" onClick={remove} loading={pending}>
                  Ja, slett
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Avbryt
                </Button>
              </div>
            </div>
          ) : (
            <DialogFooter className="!mt-2 sm:justify-between">
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> Slett
                </Button>
                {tx.source === "manual" && (
                  <Button variant="ghost" onClick={() => onEditManual(tx)}>
                    <PenLine /> Beløp og dato
                  </Button>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="ghost" onClick={onClose}>
                  Avbryt
                </Button>
                <Button onClick={save} loading={pending}>
                  Lagre
                </Button>
              </div>
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
