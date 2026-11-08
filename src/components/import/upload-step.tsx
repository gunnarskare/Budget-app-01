"use client";

import { FileSpreadsheet, Lock, ShieldCheck, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Account, AccountKind } from "@/lib/types";

const BANKS = ["DNB", "SpareBank 1", "Nordea", "Sbanken", "Handelsbanken", "Danske Bank"];

export function UploadStep({
  accounts,
  accountId,
  onAccountChange,
  onFile,
  onCreateAccount,
  error,
  busy,
}: {
  accounts: Account[];
  accountId: string;
  onAccountChange: (id: string) => void;
  onFile: (file: File) => void;
  onCreateAccount: (name: string, kind: AccountKind) => Promise<string | null>;
  error: string | null;
  busy: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<AccountKind>("checking");
  const [accError, setAccError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const usable = accounts.filter((a) => !a.archived_at);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className={cn(
            "grid place-items-center rounded-card border-2 border-dashed px-6 py-14 text-center transition-all",
            dragging ? "scale-[1.01] border-primary bg-primary-soft" : "border-line-2 bg-surface hover:border-primary/60",
          )}
        >
          <div className="max-w-sm">
            <span aria-hidden="true" className={cn("mx-auto mb-4 grid size-16 place-items-center rounded-3xl bg-primary-soft text-primary-soft-ink transition-transform", dragging && "scale-110")}>
              <UploadCloud className="size-8" />
            </span>
            <h2 className="font-display text-xl font-semibold">Dra og slipp bankfilen her</h2>
            <p className="mt-1.5 text-sm text-ink-2">eller velg en fil fra datamaskinen. Støtter .csv, .tsv og .txt (maks 5 MB).</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
              className="sr-only"
              aria-label="Velg CSV-fil"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <Button className="mt-5" size="lg" onClick={() => inputRef.current?.click()} loading={busy}>
              <FileSpreadsheet /> Velg fil
            </Button>
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-ctl bg-neg-soft px-4 py-3 text-sm text-neg">
            {error}
          </p>
        )}

        <Card className="p-5">
          <Field label="Hvilken konto gjelder filen?" htmlFor="imp-account">
            <div className="flex flex-wrap gap-2">
              <Select id="imp-account" value={accountId} onChange={(e) => onAccountChange(e.target.value)} className="min-w-0 flex-1 sm:max-w-xs">
                {usable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" onClick={() => setCreating((c) => !c)}>
                {creating ? "Avbryt" : "Ny konto"}
              </Button>
            </div>
          </Field>
          {creating && (
            <form
              className="mt-4 grid gap-3 rounded-2xl bg-surface-2 p-4 sm:grid-cols-[1fr_auto_auto]"
              onSubmit={async (e) => {
                e.preventDefault();
                setAccError(null);
                const id = await onCreateAccount(newName, newKind);
                if (id) {
                  setCreating(false);
                  setNewName("");
                } else setAccError("Kunne ikke opprette kontoen.");
              }}
            >
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="F.eks. Sparekonto" aria-label="Kontonavn" required maxLength={80} />
              <Select value={newKind} onChange={(e) => setNewKind(e.target.value as AccountKind)} aria-label="Kontotype">
                <option value="checking">Brukskonto</option>
                <option value="savings">Sparekonto</option>
                <option value="credit">Kredittkort</option>
                <option value="investment">Investering</option>
                <option value="cash">Kontanter</option>
              </Select>
              <Button type="submit">Opprett</Button>
              {accError && <p className="text-sm text-neg sm:col-span-3">{accError}</p>}
            </form>
          )}
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-[18px] text-pos" aria-hidden="true" /> Trygt og enkelt
          </h3>
          <ul className="mt-3 space-y-2.5 text-sm text-ink-2">
            <li className="flex gap-2">
              <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
              Filen leses i nettleseren din. Kun transaksjonsradene sendes videre – aldri innlogging, BankID eller passord.
            </li>
            <li className="flex gap-2">
              <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
              Originalteksten fra banken bevares uendret.
            </li>
            <li className="flex gap-2">
              <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
              Du kan angre en import når som helst.
            </li>
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold">Støttede banker</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {BANKS.map((b) => (
              <span key={b} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2">
                {b}
              </span>
            ))}
            <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2">+ andre med standard CSV</span>
          </div>
          <p className="mt-3 text-sm text-ink-2">
            Eksporter kontoutskrift som <strong>CSV</strong> fra nettbanken (ikke Excel eller PDF). Vi gjenkjenner dato, beskrivelse og beløp automatisk – og lar deg justere kolonnene hvis formatet er nytt for oss.
          </p>
        </Card>
      </aside>
    </div>
  );
}
