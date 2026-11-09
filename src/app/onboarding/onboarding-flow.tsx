"use client";

import { ArrowRight, FlaskConical, Hammer, PartyPopper, PenLine, Sparkles, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { applyBudgetSuggestions, getBudgetSuggestions } from "@/app/actions/budgets";
import { completeOnboarding, seedDemoData, startOnboarding } from "@/app/actions/onboarding";
import { CategoryIcon } from "@/components/category-chip";
import { ImportWizard } from "@/components/import/import-wizard";
import { Logo } from "@/components/logo";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { celebrate } from "@/lib/confetti";
import { monthStart, todayISO } from "@/lib/dates";
import type { SuggestionResult } from "@/lib/finance/budget";
import { formatMoney, monthName } from "@/lib/format";
import type { Account, Category, Subcategory } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = "welcome" | "currency" | "method" | "import" | "manual" | "budget" | "done";
const ORDER: Step[] = ["welcome", "currency", "method", "import", "budget", "done"];

const CURRENCIES = [
  { code: "NOK", name: "Norske kroner" },
  { code: "SEK", name: "Svenske kroner" },
  { code: "DKK", name: "Danske kroner" },
  { code: "EUR", name: "Euro" },
  { code: "USD", name: "US-dollar" },
  { code: "GBP", name: "Britiske pund" },
];

export function OnboardingFlow({
  name: initialName,
  currency: initialCurrency,
  accounts,
  categories,
  subcategories,
}: {
  name: string;
  currency: string;
  accounts: Account[];
  categories: Category[];
  subcategories: Subcategory[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState(initialName);
  const [currency, setCurrency] = useState(initialCurrency || "NOK");
  const [pending, start] = useTransition();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCount, setManualCount] = useState(0);

  const visibleIndex = Math.max(0, ORDER.indexOf(step === "manual" ? "import" : step));

  function saveBasics() {
    start(async () => {
      const res = await startOnboarding({ name, currency: currency as "NOK" });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      setStep("method");
    });
  }

  function loadDemo() {
    start(async () => {
      const res = await seedDemoData();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      setStep("done");
      void celebrate("big");
    });
  }

  /** Hopper rett til budsjettbyggeren – uten at brukeren må ha importert noe først. */
  function buildBudgetFirst() {
    start(async () => {
      const res = await completeOnboarding();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push("/budsjett/bygg");
      router.refresh();
    });
  }

  function finish() {
    start(async () => {
      const res = await completeOnboarding();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push("/oversikt");
      router.refresh();
    });
  }

  return (
    <div className={cn("mx-auto flex min-h-dvh flex-col px-5 py-8 sm:py-12", step === "import" ? "max-w-5xl" : "max-w-3xl")}>
      <header className="mb-8 flex items-center justify-between">
        <Logo />
        <span className="text-sm text-ink-3" aria-live="polite">
          Steg {visibleIndex + 1} av {ORDER.length}
        </span>
      </header>
      <div className="mb-8 flex gap-1.5" aria-hidden="true">
        {ORDER.map((s, i) => (
          <span key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-500", i <= visibleIndex ? "bg-primary" : "bg-line")} />
        ))}
      </div>

      <main className="flex-1">
        {step === "welcome" && (
          <section className="animate-fade-up">
            <span aria-hidden="true" className="mb-5 grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary-soft-ink">
              <Sparkles className="size-7" />
            </span>
            <h1 className="font-display text-4xl font-bold tracking-tight">Velkommen til Pengeflyt</h1>
            <p className="mt-3 text-lg text-ink-2">Vi hjelper deg å forstå hvor pengene går – på under fem minutter. Ingen kompliserte skjemaer.</p>
            <div className="mt-8 max-w-sm">
              <Field label="Hva skal vi kalle deg? (valgfritt)" htmlFor="ob-name">
                <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fornavn" maxLength={80} autoComplete="given-name" autoFocus onKeyDown={(e) => e.key === "Enter" && setStep("currency")} />
              </Field>
            </div>
            <Button size="lg" className="mt-8" onClick={() => setStep("currency")}>
              Kom i gang <ArrowRight />
            </Button>
          </section>
        )}

        {step === "currency" && (
          <section className="animate-fade-up">
            <h1 className="font-display text-3xl font-bold tracking-tight">Hvilken valuta bruker du?</h1>
            <p className="mt-2 text-ink-2">De fleste velger norske kroner. Du kan endre det senere.</p>
            <div role="radiogroup" aria-label="Valuta" className="mt-6 grid gap-3 sm:grid-cols-2">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  role="radio"
                  aria-checked={currency === c.code}
                  onClick={() => setCurrency(c.code)}
                  className={cn("flex items-center justify-between rounded-2xl border-2 px-5 py-4 text-left transition-all", currency === c.code ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-2")}
                >
                  <span>
                    <span className="block font-semibold">{c.code}</span>
                    <span className="block text-sm text-ink-2">{c.name}</span>
                  </span>
                  <span className="text-sm text-ink-3">{formatMoney(1234, { currency: c.code })}</span>
                </button>
              ))}
            </div>
            <div className="mt-8 flex gap-2">
              <Button variant="ghost" onClick={() => setStep("welcome")}>
                Tilbake
              </Button>
              <Button size="lg" onClick={saveBasics} loading={pending}>
                Fortsett <ArrowRight />
              </Button>
            </div>
          </section>
        )}

        {step === "method" && (
          <section className="animate-fade-up">
            <h1 className="font-display text-3xl font-bold tracking-tight">Hvordan vil du komme i gang?</h1>
            <p className="mt-2 text-ink-2">Importer fra banken er raskest. Du kan også starte med å bygge et budsjett fra bunnen, legge inn selv eller bare prøve først.</p>
            <div className="mt-6 grid gap-3">
              {[
                { icon: <Upload className="size-6" />, title: "Importer fra banken (CSV)", text: "Last opp en kontoutskrift – vi kategoriserer automatisk.", onClick: () => setStep("import"), badge: "Anbefalt" },
                { icon: <Hammer className="size-6" />, title: "Bygg budsjettet først", text: "Start med inntekt, faste utgifter og sparing. Du trenger ingen bankfil.", onClick: buildBudgetFirst, badge: "Uten bankfil" },
                { icon: <PenLine className="size-6" />, title: "Legg inn manuelt", text: "Registrer noen utgifter og inntekter selv.", onClick: () => setStep("manual") },
                { icon: <FlaskConical className="size-6" />, title: "Prøv med eksempeldata", text: "Se appen med realistiske tall. Fjernes enkelt senere.", onClick: loadDemo },
              ].map((o) => (
                <button key={o.title} type="button" onClick={o.onClick} disabled={pending} className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/50 disabled:opacity-60">
                  <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary-soft-ink">
                    {o.icon}
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center gap-2 font-semibold">
                      {o.title}
                      {o.badge && <span className="rounded-full bg-pos-soft px-2 py-0.5 text-xs font-medium text-pos">{o.badge}</span>}
                    </span>
                    <span className="block text-sm text-ink-2">{o.text}</span>
                  </span>
                  <ArrowRight className="size-5 text-ink-3 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        )}

        {step === "import" && (
          <section className="animate-fade-up">
            <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">Importer første bankfil</h1>
            <p className="mb-6 text-ink-2">Vi kategoriserer automatisk. Du bekrefter det som er uklart.</p>
            <ImportWizard accounts={accounts} categories={categories} subcategories={subcategories} currency={currency} onFinish={() => setStep("budget")} finishLabel="Lag første budsjett" />
            <Button variant="ghost" className="mt-6" onClick={() => setStep("method")}>
              ← Tilbake
            </Button>
          </section>
        )}

        {step === "manual" && (
          <section className="animate-fade-up">
            <h1 className="font-display text-3xl font-bold tracking-tight">Legg inn noen transaksjoner</h1>
            <p className="mt-2 text-ink-2">Legg inn et par for å komme i gang – du kan alltid legge til flere senere.</p>
            <Card className="mt-6 p-6 text-center">
              <p className="num-display text-5xl">{manualCount}</p>
              <p className="mt-1 text-sm text-ink-2">{manualCount === 1 ? "transaksjon lagt til" : "transaksjoner lagt til"}</p>
              <Button className="mt-5" onClick={() => setManualOpen(true)}>
                <PenLine /> Legg til transaksjon
              </Button>
            </Card>
            <div className="mt-8 flex gap-2">
              <Button variant="ghost" onClick={() => setStep("method")}>
                Tilbake
              </Button>
              <Button size="lg" onClick={() => setStep("budget")}>
                {manualCount > 0 ? "Fortsett" : "Hopp over"} <ArrowRight />
              </Button>
            </div>
            <TransactionFormDialog open={manualOpen} onOpenChange={setManualOpen} accounts={accounts} categories={categories} subcategories={subcategories} onSaved={() => setManualCount((c) => c + 1)} />
          </section>
        )}

        {step === "budget" && <BudgetStep categories={categories} currency={currency} onBuild={buildBudgetFirst} building={pending} onDone={() => { setStep("done"); void celebrate("big"); }} />}

        {step === "done" && (
          <section className="animate-fade-up py-10 text-center">
            <span aria-hidden="true" className="mx-auto grid size-20 animate-pop place-items-center rounded-full bg-primary-soft text-primary-soft-ink">
              <PartyPopper className="size-10" />
            </span>
            <h1 className="mt-6 font-display text-4xl font-bold tracking-tight">Alt klart{name ? `, ${name}` : ""}!</h1>
            <p className="mx-auto mt-3 max-w-md text-lg text-ink-2">Dashbordet ditt er klart. Du kan importere flere måneder, justere budsjettet og sette sparemål når du vil.</p>
            <Button size="lg" className="mt-8" onClick={finish} loading={pending}>
              Se oversikten <ArrowRight />
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}

function BudgetStep({ categories, currency, onDone, onBuild, building }: { categories: Category[]; currency: string; onDone: () => void; onBuild: () => void; building: boolean }) {
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  const catById = new Map(categories.map((c) => [c.id, c]));

  useEffect(() => {
    let alive = true;
    getBudgetSuggestions().then((res) => {
      if (!alive) return;
      setLoading(false);
      if (!res.ok) return void toast.error(res.error);
      setResult(res.result);
      setAmounts(Object.fromEntries(res.result.suggestions.map((s) => [s.categoryId, String(s.suggested)])));
    });
    return () => {
      alive = false;
    };
  }, []);

  function apply() {
    const items = Object.entries(amounts)
      .map(([categoryId, v]) => ({ categoryId, amount: Number(v.replace(/\s/g, "").replace(",", ".")) }))
      .filter((i) => Number.isFinite(i.amount) && i.amount > 0);
    if (items.length === 0) return onDone();
    start(async () => {
      const res = await applyBudgetSuggestions({ periodType: "month", periodStart: monthStart(todayISO().slice(0, 7)), items, plannedIncome: result?.suggestedIncome ?? null });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Budsjettet er laget");
      onDone();
    });
  }

  const total = Object.values(amounts).reduce((n, v) => n + (Number(v.replace(/\s/g, "").replace(",", ".")) || 0), 0);

  return (
    <section className="animate-fade-up">
      <h1 className="font-display text-3xl font-bold tracking-tight">Ditt første budsjett</h1>
      {loading ? (
        <p className="mt-4 text-ink-2">Regner ut forslag fra transaksjonene dine …</p>
      ) : !result || result.suggestions.length === 0 ? (
        <>
          <p className="mt-2 text-ink-2">Vi har ikke nok transaksjoner til å foreslå et budsjett ennå, men du kan bygge det fra bunnen: start med inntekt, faste utgifter og sparing.</p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Button size="lg" onClick={onBuild} loading={building}>
              <Hammer /> Bygg budsjettet
            </Button>
            <Button size="lg" variant="ghost" onClick={onDone}>
              Hopp over
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-ink-2">
            {result.usedPartialMonth
              ? "Forslaget bygger på bare én måned (foreløpig anslag). Juster gjerne."
              : `Forslag basert på dine siste ${result.months.length} måneder. Juster det du vil – ${monthName(todayISO().slice(0, 7))} er første måned.`}
          </p>
          <Card className="mt-6 divide-y divide-line">
            {result.suggestions.map((s) => {
              const cat = catById.get(s.categoryId);
              if (!cat) return null;
              return (
                <div key={s.categoryId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{cat.name}</p>
                    <p className="text-xs text-ink-3">Snitt {formatMoney(s.average, { currency })} per måned</p>
                  </div>
                  <Input
                    aria-label={`Budsjett for ${cat.name}`}
                    inputMode="numeric"
                    className="w-28 text-right"
                    value={amounts[s.categoryId] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [s.categoryId]: e.target.value }))}
                  />
                </div>
              );
            })}
            <div className="flex items-center justify-between bg-surface-2/60 px-5 py-3 text-sm">
              <span className="font-medium">Sum planlagt</span>
              <span className="font-semibold tabular-nums">{formatMoney(total, { currency })}</span>
            </div>
          </Card>
          <div className="mt-8 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onDone}>
              Hopp over
            </Button>
            <Button variant="ghost" onClick={onBuild} loading={building}>
              <Hammer /> Bygg fra bunnen i stedet
            </Button>
            <Button size="lg" onClick={apply} loading={pending}>
              Bruk dette budsjettet <ArrowRight />
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
