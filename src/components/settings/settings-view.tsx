"use client";

import { Bot, FlaskConical, Landmark, Lock, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { seedDemoData } from "@/app/actions/onboarding";
import { createAccount, deleteAccount, deleteAllTransactions, deleteMyAccount, removeDemoData, updateAccount, updateProfile } from "@/app/actions/settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatMoney, plural } from "@/lib/format";
import type { Account, AccountKind, Profile } from "@/lib/types";

const KIND_LABEL: Record<AccountKind, string> = { checking: "Brukskonto", savings: "Sparekonto", credit: "Kredittkort", investment: "Investering", cash: "Kontanter" };
const CURRENCIES = ["NOK", "SEK", "DKK", "EUR", "USD", "GBP"] as const;

export function SettingsView({ profile, email, accounts, balances, txCount, aiConfigured }: { profile: Profile; email: string; accounts: Account[]; balances: Record<string, number>; txCount: number; aiConfigured: boolean }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ProfileCard profile={profile} email={email} aiConfigured={aiConfigured} />
      <AppearanceCard />
      <div className="lg:col-span-2">
        <AccountsCard accounts={accounts} balances={balances} currency={profile.currency} />
      </div>
      <PrivacyCard />
      <DataCard accounts={accounts} txCount={txCount} />
    </div>
  );
}

function ProfileCard({ profile, email, aiConfigured }: { profile: Profile; email: string; aiConfigured: boolean }) {
  const [name, setName] = useState(profile.display_name ?? "");
  const [currency, setCurrency] = useState(profile.currency);
  const [ai, setAi] = useState(profile.ai_enabled);
  const [pending, start] = useTransition();
  const dirty = name !== (profile.display_name ?? "") || currency !== profile.currency || ai !== profile.ai_enabled;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Profil</CardTitle>
          <CardDescription>{email}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Navn" htmlFor="s-name">
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Fornavn" />
        </Field>
        <Field label="Valuta" htmlFor="s-cur">
          <Select id="s-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-line px-4 py-3">
          <span>
            <span className="flex items-center gap-2 text-sm font-medium">
              <Bot className="size-4 text-ink-3" aria-hidden="true" /> Bruk AI på usikre transaksjoner
            </span>
            <span className="mt-0.5 block text-xs text-ink-2">
              {aiConfigured ? "Sender kun renset tekst (uten tall, e-post og personoverføringer) – aldri datoer, kontonumre eller saldo." : "AI er ikke konfigurert på serveren (mangler OPENAI_API_KEY). Appen fungerer fullt ut uten."}
            </span>
          </span>
          <Switch checked={ai} onCheckedChange={setAi} aria-label="Bruk AI" />
        </label>
        <Button
          loading={pending}
          disabled={!dirty}
          onClick={() =>
            start(async () => {
              const res = await updateProfile({ name, currency: currency as (typeof CURRENCIES)[number], aiEnabled: ai });
              if (!res.ok) toast.error(res.error);
              else toast.success("Innstillingene er lagret");
            })
          }
        >
          Lagre
        </Button>
      </CardContent>
    </Card>
  );
}

function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Utseende</CardTitle>
          <CardDescription>Velg lys eller mørk modus – eller følg enheten din.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ThemeToggle />
      </CardContent>
    </Card>
  );
}

function AccountsCard({ accounts, balances, currency }: { accounts: Account[]; balances: Record<string, number>; currency: string }) {
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary-soft-ink">
            <Landmark className="size-[18px]" />
          </span>
          <div>
            <CardTitle>Kontoer</CardTitle>
            <CardDescription>Flere kontoer støttes. Overføringer mellom dem telles ikke som inntekt eller utgift.</CardDescription>
          </div>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Ny konto
        </Button>
      </CardHeader>
      <CardContent className="pt-3">
        <ul className="divide-y divide-line/70">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  <span className="truncate">{a.name}</span>
                  {a.is_demo && <Badge tone="warn">Eksempel</Badge>}
                </p>
                <p className="text-xs text-ink-3">
                  {KIND_LABEL[a.kind]}
                  {a.bank ? ` · ${a.bank}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{formatMoney(balances[a.id] ?? 0, { currency })}</p>
                <p className="text-xs text-ink-3">beregnet saldo</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Rediger ${a.name}`} onClick={() => setEditing(a)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Slett ${a.name}`} onClick={() => setDeleting(a)} disabled={accounts.length <= 1} title={accounts.length <= 1 ? "Du må beholde minst én konto" : undefined}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-3">Saldo er startsaldo pluss alle transaksjoner i appen – ikke nødvendigvis det banken viser.</p>
      </CardContent>
      <AccountDialog target={editing} onClose={() => setEditing(null)} />
      <DeleteAccountDialog account={deleting} onClose={() => setDeleting(null)} />
    </Card>
  );
}

function AccountDialog({ target, onClose }: { target: Account | "new" | null; onClose: () => void }) {
  const editing = target && target !== "new" ? target : null;
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [kind, setKind] = useState<AccountKind>("checking");
  const [opening, setOpening] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [seen, setSeen] = useState<unknown>(null);
  if (target !== seen) {
    setSeen(target);
    setName(editing?.name ?? "");
    setBank(editing?.bank ?? "");
    setKind(editing?.kind ?? "checking");
    setOpening(editing ? String(editing.opening_balance) : "0");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(opening.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n)) return setError("Startsaldo må være et tall.");
    setError(null);
    start(async () => {
      const payload = { name, bank, kind, openingBalance: n };
      const res = editing ? await updateAccount(editing.id, payload) : await createAccount(payload);
      if (!res.ok) return setError(res.error);
      toast.success(editing ? "Kontoen er oppdatert" : "Kontoen er opprettet");
      onClose();
    });
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={editing ? "Rediger konto" : "Ny konto"}>
        <form onSubmit={submit} className="mt-2 space-y-4">
          <Field label="Navn" htmlFor="a-name">
            <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus placeholder="F.eks. Brukskonto" />
          </Field>
          <Field label="Bank (valgfritt)" htmlFor="a-bank">
            <Input id="a-bank" value={bank} onChange={(e) => setBank(e.target.value)} maxLength={60} placeholder="F.eks. DNB" />
          </Field>
          <Field label="Type" htmlFor="a-kind" hint="Sparekontoer og investeringskontoer regnes som sparing når du flytter penger dit.">
            <Select id="a-kind" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Startsaldo" htmlFor="a-open" hint="Saldo før den første transaksjonen i appen.">
            <Input id="a-open" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
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
              Lagre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [pending, start] = useTransition();
  if (!account) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Slette «${account.name}»?`} description="Alle transaksjoner og importer på kontoen slettes også. Dette kan ikke angres.">
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Behold
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteAccount(account.id);
                if (!res.ok) return void toast.error(res.error);
                toast.success(`Kontoen er slettet (${plural(res.deletedTransactions, "transaksjon", "transaksjoner")})`);
                onClose();
              })
            }
          >
            Slett konto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrivacyCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-pos-soft text-pos">
            <ShieldCheck className="size-[18px]" />
          </span>
          <div>
            <CardTitle>Sikkerhet og personvern</CardTitle>
            <CardDescription>Slik behandles dataene dine</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm text-ink-2">
          {[
            "Vi lagrer aldri bankinnlogging, BankID eller passord – bare CSV-filer du selv laster opp.",
            "Filen leses i nettleseren din. Selve filen lagres ikke; kun transaksjonsradene og originalteksten fra banken.",
            "Databasen har radnivå-sikkerhet (RLS): ingen andre brukere kan lese dataene dine.",
            "AI får bare renset tekst for usikre kjøp – ikke datoer, kontonumre, saldo eller navn på personoverføringer.",
            "Du kan når som helst slette importerte data, eksempeldata eller hele kontoen.",
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DataCard({ accounts, txCount }: { accounts: Account[]; txCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"transactions" | "account" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hasDemo = accounts.some((a) => a.is_demo);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Dine data</CardTitle>
          <CardDescription>{plural(txCount, "transaksjon", "transaksjoner")} lagret</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasDemo ? (
          <Row title="Fjern eksempeldata" text="Sletter eksempelkontoene, transaksjonene, budsjettene og sparemålene som ble lastet inn." action={
            <Button variant="secondary" loading={pending} onClick={() => start(async () => {
              const res = await removeDemoData();
              if (!res.ok) toast.error(res.error); else { toast.success("Eksempeldata er fjernet"); router.refresh(); }
            })}>Fjern</Button>
          } />
        ) : (
          <Row title="Prøv med eksempeldata" text="Last inn realistiske tall for å se hvordan appen fungerer. Fjernes med ett klikk." action={
            <Button variant="secondary" loading={pending} onClick={() => start(async () => {
              const res = await seedDemoData();
              if (!res.ok) toast.error(res.error); else { toast.success("Eksempeldata er lastet inn"); router.refresh(); }
            })}><FlaskConical /> Last inn</Button>
          } />
        )}
        <Row title="Slett alle transaksjoner" text="Fjerner transaksjoner og importhistorikk. Kontoer, kategorier, regler, budsjetter og sparemål beholdes." action={<Button variant="danger" onClick={() => { setDialog("transactions"); setError(null); }}>Slett …</Button>} />
        <Row title="Slett konto og alle data" text="Sletter brukeren din og alt som er lagret – for godt." action={<Button variant="destructive" onClick={() => { setDialog("account"); setConfirmText(""); setError(null); }}>Slett konto …</Button>} />
      </CardContent>

      <Dialog open={dialog === "transactions"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Slette alle transaksjoner?" description={`Dette sletter ${plural(txCount, "transaksjon", "transaksjoner")} og hele importhistorikken. Dette kan ikke angres.`}>
          {error && <p role="alert" className="mb-3 rounded-ctl bg-neg-soft px-3.5 py-2.5 text-sm text-neg">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>Avbryt</Button>
            <Button variant="destructive" loading={pending} onClick={() => start(async () => {
              const res = await deleteAllTransactions();
              if (!res.ok) return setError(res.error);
              toast.success(`${plural(res.deleted, "transaksjon", "transaksjoner")} slettet`);
              setDialog(null);
              router.refresh();
            })}>Slett alt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "account"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Slette kontoen din?" description="All data slettes permanent, og du logges ut. Dette kan ikke angres.">
          <Field label="Skriv «slett» for å bekrefte" htmlFor="del-confirm">
            <Input id="del-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </Field>
          {error && <p role="alert" className="mt-3 rounded-ctl bg-neg-soft px-3.5 py-2.5 text-sm text-neg">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>Avbryt</Button>
            <Button variant="destructive" loading={pending} disabled={confirmText.trim().toLowerCase() !== "slett"} onClick={() => start(async () => {
              const res = await deleteMyAccount(confirmText);
              if (res && !res.ok) setError(res.error);
            })}>Slett kontoen min</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Row({ title, text, action }: { title: string; text: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-ink-2">{text}</p>
      </div>
      {action}
    </div>
  );
}
