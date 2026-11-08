"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTransaction, updateManualTransaction } from "@/app/actions/transactions";
import { CategorySelect, type CategoryValue } from "@/components/category-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { todayISO } from "@/lib/dates";
import type { Account, Category, Subcategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface EditableTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amount: number; // med fortegn
  categoryId: string | null;
  subcategoryId: string | null;
  note: string | null;
}

interface Props {
  accounts: Account[];
  categories: Category[];
  subcategories: Subcategory[];
  editing?: EditableTransaction | null;
  onSaved?: () => void;
}

/** Ny transaksjon, eller redigering av en manuelt registrert transaksjon. */
export function TransactionFormDialog({ open, onOpenChange, editing, ...rest }: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Rediger transaksjon" : "Ny transaksjon"} description="Registrer en utgift eller inntekt manuelt.">
        {/* Innholdet monteres på nytt hver gang dialogen åpnes, så skjemaet starter rent */}
        <FormBody key={editing?.id ?? "new"} editing={editing} onClose={() => onOpenChange(false)} {...rest} />
      </DialogContent>
    </Dialog>
  );
}

function FormBody({ accounts, categories, subcategories, editing, onSaved, onClose }: Props & { onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const usable = accounts.filter((a) => !a.archived_at);

  const [kind, setKind] = useState<"expense" | "income">(editing ? (editing.amount < 0 ? "expense" : "income") : "expense");
  const [amount, setAmount] = useState(editing ? String(Math.abs(editing.amount)).replace(".", ",") : "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [accountId, setAccountId] = useState(editing?.accountId ?? usable.find((a) => a.kind === "checking")?.id ?? usable[0]?.id ?? "");
  const [category, setCategory] = useState<CategoryValue>({ categoryId: editing?.categoryId ?? null, subcategoryId: editing?.subcategoryId ?? null });
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return setError("Skriv inn et beløp større enn 0.");
    setError(null);
    const payload = {
      accountId,
      date,
      description,
      amount: n,
      kind,
      categoryId: category.categoryId,
      subcategoryId: category.subcategoryId,
      note: note || undefined,
    };
    start(async () => {
      const res = editing ? await updateManualTransaction({ id: editing.id, ...payload }) : await createTransaction(payload);
      if (!res.ok) return setError(res.error);
      toast.success(editing ? "Transaksjonen er oppdatert" : "Transaksjonen er lagt til");
      onClose();
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-4">
      <div role="radiogroup" aria-label="Type" className="grid grid-cols-2 gap-1 rounded-ctl bg-surface-2 p-1">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn("h-9 rounded-[9px] text-sm font-medium transition-all", kind === k ? (k === "expense" ? "bg-surface text-neg shadow-sm" : "bg-surface text-pos shadow-sm") : "text-ink-2")}
          >
            {k === "expense" ? "Utgift" : "Inntekt"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Beløp" htmlFor="tx-amount">
          <Input id="tx-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" required autoFocus />
        </Field>
        <Field label="Dato" htmlFor="tx-date">
          <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required max="2100-01-01" />
        </Field>
      </div>
      <Field label="Beskrivelse" htmlFor="tx-desc">
        <Input id="tx-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="F.eks. Kiwi, Husleie, Lønn" required maxLength={200} />
      </Field>
      <Field label="Kategori" htmlFor="tx-cat" hint="Du kan la den stå tom og velge senere.">
        <CategorySelect id="tx-cat" categories={categories} subcategories={subcategories} value={category} onChange={setCategory} kind={kind} emptyLabel="Ingen kategori" />
      </Field>
      {usable.length > 1 && (
        <Field label="Konto" htmlFor="tx-acc">
          <Select id="tx-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Notat (valgfritt)" htmlFor="tx-note">
        <Input id="tx-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>
      {error && (
        <p role="alert" className="rounded-ctl bg-neg-soft px-3.5 py-2.5 text-sm text-neg">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Avbryt
        </Button>
        <Button type="submit" loading={pending}>
          {editing ? "Lagre" : "Legg til"}
        </Button>
      </DialogFooter>
    </form>
  );
}
