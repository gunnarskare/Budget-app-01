"use client";

import { Filter, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import type { Account, Category } from "@/lib/types";

export interface FilterValues {
  q: string;
  fra: string;
  til: string;
  kategori: string;
  konto: string;
  type: string;
  min: string;
  maks: string;
  visning: string;
}

export function TransactionFilters({ values, categories, accounts, autoFocusSearch }: { values: FilterValues; categories: Category[]; accounts: Account[]; autoFocusSearch?: boolean }) {
  const router = useRouter();
  const activeCount = (["q", "fra", "til", "kategori", "konto", "type", "min", "maks"] as const).filter((k) => values[k]).length;
  const [open, setOpen] = useState(activeCount > 0 && !values.q);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const [k, v] of data.entries()) if (typeof v === "string" && v.trim() !== "") params.set(k, v.trim());
    router.push(`/transaksjoner${params.size ? `?${params}` : ""}`);
  }

  const reset = () => router.push(values.visning ? `/transaksjoner?visning=${values.visning}` : "/transaksjoner");

  return (
    <Card className="mb-4 p-3 sm:p-4">
      <form action="/transaksjoner" method="get" onSubmit={submit} role="search" aria-label="Filtrer transaksjoner">
        {values.visning && <input type="hidden" name="visning" value={values.visning} />}
        <div className="flex gap-2">
          <Input name="q" type="search" defaultValue={values.q} placeholder="Søk i beskrivelse …" aria-label="Søk i transaksjoner" autoFocus={autoFocusSearch} className="flex-1" maxLength={60} />
          <Button type="button" variant={open || activeCount > 0 ? "soft" : "secondary"} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="filter-panel">
            <Filter /> <span className="hidden sm:inline">Filtre</span>
            {activeCount > 0 && <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[11px] text-primary-ink">{activeCount}</span>}
          </Button>
          <Button type="submit">Søk</Button>
        </div>
        <div id="filter-panel" hidden={!open} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Fra dato" htmlFor="f-fra">
            <Input id="f-fra" name="fra" type="date" defaultValue={values.fra} />
          </Field>
          <Field label="Til dato" htmlFor="f-til">
            <Input id="f-til" name="til" type="date" defaultValue={values.til} />
          </Field>
          <Field label="Kategori" htmlFor="f-kat">
            <Select id="f-kat" name="kategori" defaultValue={values.kategori}>
              <option value="">Alle kategorier</option>
              {categories.filter((c) => !c.archived_at).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="ukategorisert">Ukategorisert</option>
            </Select>
          </Field>
          <Field label="Konto" htmlFor="f-konto">
            <Select id="f-konto" name="konto" defaultValue={values.konto}>
              <option value="">Alle kontoer</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type" htmlFor="f-type">
            <Select id="f-type" name="type" defaultValue={values.type}>
              <option value="">Inn og ut</option>
              <option value="ut">Utgifter</option>
              <option value="inn">Inntekter</option>
            </Select>
          </Field>
          <Field label="Beløp fra" htmlFor="f-min">
            <Input id="f-min" name="min" inputMode="decimal" defaultValue={values.min} placeholder="0" />
          </Field>
          <Field label="Beløp til" htmlFor="f-maks">
            <Input id="f-maks" name="maks" inputMode="decimal" defaultValue={values.maks} placeholder="∞" />
          </Field>
          <div className="flex items-end">
            <Button type="button" variant="ghost" onClick={reset} disabled={activeCount === 0}>
              <X /> Nullstill filtre
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
