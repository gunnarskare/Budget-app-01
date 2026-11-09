"use client";

import { ArrowLeft, ArrowRight, Check, Lightbulb, Plus, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { savePlan } from "@/app/actions/plan";
import { CategoryIcon } from "@/components/category-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { draftIssues, draftLines, draftMonthly, draftPayload, formatAmountText, newCustomItem, parseAmountText, type DraftItem } from "@/lib/budget/draft";
import { allocation, categoryBudgetLines, planChecks, planTotals, realityCheck, savingSuggestions, type PlanCheck, type PlanHistory, type RealityRow } from "@/lib/budget/plan";
import { FIXED_PROMPTS, INCOME_PROMPTS, MAIN_SAVING_SLOT, SAVING_PROMPTS, VARIABLE_PROMPTS } from "@/lib/budget/templates";
import { celebrate } from "@/lib/confetti";
import { addMonths } from "@/lib/dates";
import { frequencyShort } from "@/lib/finance/frequency";
import { capitalize, formatMoney, monthName, roundNice } from "@/lib/format";
import type { Category, Frequency, PlanKind, PlanNature, Subcategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GoalRow, type BuilderGoal } from "./builder/goal-row";
import { ItemRow, SectionCard, type CategoryOption } from "./builder/item-row";
import { AllocationBar, CheckList, GuideTable, RealityList, StatusBar } from "./builder/summary-parts";

type StepId = "income" | "fixed" | "variable" | "saving" | "summary";

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "income", label: "Inntekt" },
  { id: "fixed", label: "Faste utgifter" },
  { id: "variable", label: "Variable utgifter" },
  { id: "saving", label: "Sparing" },
  { id: "summary", label: "Oppsummering" },
];

/** Faste forslagsrader samlet per kategori (i rekkefølge). */
const FIXED_GROUPS: Array<[string, string[]]> = (() => {
  const groups = new Map<string, string[]>();
  for (const p of FIXED_PROMPTS) {
    const list = groups.get(p.categoryKey) ?? [];
    list.push(p.slot);
    groups.set(p.categoryKey, list);
  }
  return [...groups.entries()];
})();

/** «Økonomi» sier lite i dette steget – her handler det om lån. */
const FIXED_TITLES: Record<string, string> = { okonomi: "Lån og gjeld" };

export interface BuilderRecurring {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  /** Positivt beløp per `frequency` */
  amount: number;
  frequency: Frequency;
}

export interface BuilderProps {
  initialDraft: DraftItem[];
  importedFromBudget: boolean;
  /** Har brukeren lagret en plan før? */
  hasPlan: boolean;
  categories: Category[];
  subcategories: Subcategory[];
  goals: BuilderGoal[];
  recurring: BuilderRecurring[];
  /** Snitt per kategori fra siste hele måneder – kun når det finnes data */
  history: PlanHistory | null;
  historyIncome: number | null;
  currency: string;
  today: string;
  /** «2026-11» */
  currentMonth: string;
}

const goalTextOf = (goals: BuilderGoal[]): Record<string, string> =>
  Object.fromEntries(goals.map((g) => [g.id, g.monthlyContribution > 0 ? formatAmountText(g.monthlyContribution) : ""]));

const snapshot = (draft: DraftItem[], goalText: Record<string, string>): string =>
  JSON.stringify([draft.map((d) => [d.key, d.name, d.amount, d.frequency, d.categoryId]), Object.entries(goalText).sort()]);

const stepOfItem = (d: Pick<DraftItem, "kind" | "nature">): StepId => (d.kind === "income" ? "income" : d.kind === "saving" ? "saving" : d.nature === "fixed" ? "fixed" : "variable");

function Stepper({ step, onGo }: { step: StepId; onGo: (s: StepId) => void }) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <nav aria-label="Stegene i budsjettbyggeren" className="mb-5">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.id} className="flex flex-1 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => onGo(s.id)}
                aria-current={active ? "step" : undefined}
                aria-label={`Steg ${i + 1}: ${s.label}`}
                className="group flex items-center gap-2 rounded-full py-0.5 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors",
                    done ? "bg-pos-fill text-white" : active ? "bg-primary text-primary-ink" : "bg-surface-2 text-ink-3 group-hover:bg-line",
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : i + 1}
                </span>
                <span className={cn("hidden text-sm font-medium lg:inline", active ? "text-ink" : "text-ink-3 group-hover:text-ink-2")}>{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <span aria-hidden="true" className={cn("h-0.5 min-w-2 flex-1 rounded-full", done ? "bg-pos-fill" : "bg-line")} />}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm font-medium text-ink-2 lg:hidden" aria-hidden="true">
        {STEPS[current]?.label}
      </p>
    </nav>
  );
}

function Intro({ title, children, headingRef }: { title: string; children: ReactNode; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="mb-4">
      <h2 ref={headingRef} tabIndex={-1} className="font-display text-xl font-bold tracking-tight outline-none sm:text-2xl">
        {title}
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-2 sm:text-[15px]">{children}</p>
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="-ml-2 text-accent hover:text-accent">
      <Plus /> {children}
    </Button>
  );
}

export function BudgetBuilder(props: BuilderProps) {
  const { categories, subcategories, goals, recurring, history, historyIncome, currency, today, currentMonth, hasPlan } = props;
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [draft, setDraft] = useState<DraftItem[]>(props.initialDraft);
  const [goalText, setGoalText] = useState<Record<string, string>>(() => goalTextOf(goals));
  const [step, setStep] = useState<StepId>(hasPlan ? "summary" : "income");
  const [month, setMonth] = useState(currentMonth);
  const [usedRecurring, setUsedRecurring] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [baseline] = useState(() => snapshot(props.initialDraft, goalTextOf(goals)));
  const counter = useRef(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // ---------- avledede verdier ----------
  const catsById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const lk = useMemo(() => ({ categories: catsById, subcategories: new Map(subcategories.map((s) => [s.id, s])) }), [catsById, subcategories]);
  const goalMonthly = useMemo(() => new Map(goals.map((g) => [g.id, g.completed ? 0 : Math.round(parseAmountText(goalText[g.id] ?? "") ?? 0)])), [goals, goalText]);
  const goalSaving = useMemo(() => [...goalMonthly.values()].reduce((n, v) => n + v, 0), [goalMonthly]);
  const totals = useMemo(() => planTotals(draftLines(draft), lk, goalSaving), [draft, lk, goalSaving]);
  const issues = useMemo(() => draftIssues(draft), [draft]);
  const bySlot = useMemo(() => new Map(draft.filter((d) => d.slot).map((d) => [d.slot as string, d])), [draft]);
  const dirty = snapshot(draft, goalText) !== baseline;

  const expenseOptions: CategoryOption[] = useMemo(() => categories.filter((c) => c.kind === "expense" && !c.archived_at).map((c) => ({ id: c.id, name: c.name })), [categories]);
  const incomeOptions: CategoryOption[] = useMemo(() => categories.filter((c) => c.kind === "income" && !c.archived_at).map((c) => ({ id: c.id, name: c.name })), [categories]);

  // Advarsel hvis du forlater siden med ulagrede endringer
  useEffect(() => {
    if (!dirty || saved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saved]);

  // ---------- endringer ----------
  const patchItem = (key: string, patch: Partial<DraftItem>) => setDraft((d) => d.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const removeItem = (key: string) => setDraft((d) => d.filter((x) => x.key !== key));
  const addCustom = (kind: PlanKind, nature: PlanNature) => {
    counter.current += 1;
    const key = `new-${counter.current}`;
    setDraft((d) => [...d, newCustomItem(key, kind, nature)]);
  };

  function go(next: StepId) {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }

  /** Fast månedsbeløp i en kategori (brukes for å ikke telle faste utgifter to ganger mot historikken). */
  const monthlyIn = (categoryId: string, nature: PlanNature, exceptKey?: string) =>
    draft.filter((d) => d.kind === "expense" && d.nature === nature && d.categoryId === categoryId && d.key !== exceptKey).reduce((n, d) => n + draftMonthly(d), 0);

  /** Variabel forslagsrad for en kategori, hvis den finnes. */
  const variableRowFor = (categoryId: string) => draft.find((d) => !d.custom && d.nature === "variable" && d.kind === "expense" && d.categoryId === categoryId);

  /** Vanlig forbruk i kategorien, fratrukket det som allerede er planlagt som fast/annet – det som er igjen er rammen. */
  const historyFor = (categoryId: string, rowKey: string): number => {
    const avg = history?.average[categoryId];
    if (!avg) return 0;
    return Math.max(0, roundNice(avg) - monthlyIn(categoryId, "fixed") - monthlyIn(categoryId, "variable", rowKey));
  };

  function applyAverage(row: RealityRow) {
    const target = variableRowFor(row.categoryId);
    if (!target) return;
    const value = historyFor(row.categoryId, target.key);
    patchItem(target.key, { amount: formatAmountText(value), frequency: "monthly" });
    toast.success("Satte rammen til snittet ditt");
  }

  function leftoverToSaving() {
    const main = bySlot.get(MAIN_SAVING_SLOT);
    if (!main || totals.leftover <= 0) return;
    patchItem(main.key, { amount: formatAmountText(draftMonthly(main) + totals.leftover), frequency: "monthly" });
    toast.success("Satt av til sparing");
  }

  function save() {
    const firstIssue = draft.find((d) => issues[d.key]);
    if (firstIssue) {
      toast.error("Rett opp feltene som er markert");
      go(stepOfItem(firstIssue));
      return;
    }
    const payload = {
      month,
      items: draftPayload(draft),
      goals: goals.filter((g) => !g.completed).map((g) => ({ id: g.id, monthlyContribution: goalMonthly.get(g.id) ?? 0 })),
    };
    startSave(async () => {
      const res = await savePlan(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSaved(true);
      toast.success("Budsjettet er lagret");
      void celebrate("small");
      router.push(`/budsjett?p=${res.month}`);
      router.refresh();
    });
  }

  // ---------- rader ----------
  const row = (item: DraftItem, opts: { leading?: ReactNode; reference?: { text: string; onUse: () => void } | null; categories?: CategoryOption[] } = {}) => (
    <ItemRow
      key={item.key}
      item={item}
      currency={currency}
      error={issues[item.key]}
      leading={opts.leading}
      reference={opts.reference}
      categoryOptions={item.custom ? opts.categories : undefined}
      onChange={(p) => patchItem(item.key, p)}
      onRemove={item.custom ? () => removeItem(item.key) : undefined}
    />
  );

  const catIcon = (categoryId: string | null) => {
    const c = categoryId ? catsById.get(categoryId) : undefined;
    return c ? <CategoryIcon icon={c.icon} color={c.color} size="sm" /> : null;
  };

  const customRows = (kind: PlanKind, nature: PlanNature, options?: CategoryOption[]) =>
    draft.filter((d) => d.custom && d.kind === kind && d.nature === nature).map((d) => row(d, { categories: options }));

  const money = (n: number) => formatMoney(n, { currency });
  const monthOptions = [currentMonth, addMonths(currentMonth, 1)];

  // ---------- steg ----------
  const incomeStep = (
    <>
      <Intro title="Hva har du å rutte med?" headingRef={headingRef}>
        Start med inntekten. Bruk det som faktisk kommer inn på kontoen etter skatt, så blir resten av budsjettet realistisk.
      </Intro>
      {props.importedFromBudget && (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary-soft-ink">
          <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Vi hentet beløpene fra budsjettet du allerede har. Bolig og abonnementer ligger som samlebeløp under faste utgifter: del dem gjerne opp i enkeltposter og fjern samlebeløpet.
        </p>
      )}
      <SectionCard title="Inntekt" total={totals.income} currency={currency} footer={<AddButton onClick={() => addCustom("income", "fixed")}>Legg til inntekt</AddButton>}>
        {INCOME_PROMPTS.map((p) => {
          const item = bySlot.get(p.slot);
          if (!item) return null;
          const ref =
            p.slot === "inntekter.lonn" && historyIncome && item.amount.trim() === ""
              ? { text: `Samlet inntekt de siste månedene: ${money(historyIncome)} – bruk`, onUse: () => patchItem(item.key, { amount: formatAmountText(historyIncome), frequency: "monthly" as Frequency }) }
              : null;
          return row(item, { reference: ref });
        })}
        {customRows("income", "fixed", incomeOptions)}
      </SectionCard>
    </>
  );

  const fixedStep = (
    <>
      <Intro title="Faste utgifter" headingRef={headingRef}>
        Dette er regningene du må betale uansett. Ha gjerne fakturaer og avtaler for hånden. Kommer en regning sjeldnere enn hver måned, som bilforsikring, velger du «per år», så regner vi om til måned.
      </Intro>

      {recurring.filter((r) => !usedRecurring.includes(r.id)).length > 0 && (
        <Card className="mb-5">
          <CardHeader>
            <div>
              <CardTitle>Fant disse i transaksjonene dine</CardTitle>
              <CardDescription>Faste betalinger som kommer jevnlig. Legg til de som hører med i budsjettet.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <ul className="divide-y divide-line">
              {recurring
                .filter((r) => !usedRecurring.includes(r.id))
                .map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-ink-2">
                        {r.categoryName} · {money(r.amount)}
                        {frequencyShort(r.frequency)}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Legg til ${r.name}`}
                      onClick={() => {
                        counter.current += 1;
                        const item: DraftItem = { ...newCustomItem(`new-${counter.current}`, "expense", "fixed", r.categoryId), name: r.name.slice(0, 80), subcategoryId: r.subcategoryId, amount: formatAmountText(r.amount), frequency: r.frequency };
                        setDraft((d) => [...d, item]);
                        setUsedRecurring((u) => [...u, r.id]);
                      }}
                    >
                      <Plus /> Legg til
                    </Button>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {FIXED_GROUPS.map(([categoryKey, slots]) => {
          const cat = categories.find((c) => c.system_key === categoryKey);
          const items = slots.map((s) => bySlot.get(s)).filter((i): i is DraftItem => !!i);
          if (!cat || items.length === 0) return null;
          return (
            <SectionCard key={categoryKey} title={FIXED_TITLES[categoryKey] ?? cat.name} icon={cat.icon} color={cat.color} total={items.reduce((n, i) => n + draftMonthly(i), 0)} currency={currency}>
              {items.map((i) => row(i))}
            </SectionCard>
          );
        })}
        <SectionCard title="Egne faste utgifter" total={draft.filter((d) => d.custom && d.kind === "expense" && d.nature === "fixed").reduce((n, d) => n + draftMonthly(d), 0)} currency={currency} footer={<AddButton onClick={() => addCustom("expense", "fixed")}>Legg til fast utgift</AddButton>}>
          {customRows("expense", "fixed", expenseOptions)}
          {draft.every((d) => !(d.custom && d.kind === "expense" && d.nature === "fixed")) && <p className="py-3 text-sm text-ink-3">Noe som mangler? Legg til lån, avgifter, barnetilsyn og lignende.</p>}
        </SectionCard>
      </div>
    </>
  );

  const variableStep = (
    <>
      <Intro title="Variable utgifter" headingRef={headingRef}>
        Her setter du en ramme for det du bruker etter behov. Det er helt greit å gjette, du kan justere underveis, og budsjettet viser deg hvordan det går.
      </Intro>
      <SectionCard title="Rammer per kategori" total={totals.variable} currency={currency} footer={<AddButton onClick={() => addCustom("expense", "variable")}>Legg til ramme</AddButton>}>
        {VARIABLE_PROMPTS.map((p) => {
          const item = bySlot.get(p.slot);
          if (!item) return null;
          const suggested = item.categoryId ? historyFor(item.categoryId, item.key) : 0;
          const current = draftMonthly(item);
          const ref =
            history && suggested >= 100 && suggested !== current
              ? { text: `Du bruker vanligvis ca. ${money(suggested)} per måned (snitt siste ${history.months} mnd) – bruk`, onUse: () => patchItem(item.key, { amount: formatAmountText(suggested), frequency: "monthly" as Frequency }) }
              : null;
          return row(item, { leading: catIcon(item.categoryId), reference: ref });
        })}
        {customRows("expense", "variable", expenseOptions)}
      </SectionCard>
    </>
  );

  const suggestions = savingSuggestions(totals.income);
  const mainSaving = bySlot.get(MAIN_SAVING_SLOT);
  const mainSavingMonthly = mainSaving ? draftMonthly(mainSaving) : 0;
  const savingStep = (
    <>
      <Intro title="Sparing: betal deg selv først" headingRef={headingRef}>
        Sparing er ikke det som blir til overs, men det du setter av først. Velg et beløp du klarer å holde, også i dyre måneder.
      </Intro>

      {mainSaving && (
        <Card className="mb-5">
          <CardContent className="pt-5">
            <p className="text-sm font-medium">Hvor mye vil du spare hver måned?</p>
            {suggestions.length > 0 ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Foreslåtte sparebeløp">
                  {suggestions.map((s) => {
                    const active = mainSavingMonthly === s.amount;
                    return (
                      <button
                        key={s.rate}
                        type="button"
                        aria-pressed={active}
                        onClick={() => patchItem(mainSaving.key, { amount: formatAmountText(s.amount), frequency: "monthly" })}
                        className={cn(
                          "rounded-full border px-4 py-2 text-sm transition-colors",
                          active ? "border-primary bg-primary-soft font-semibold text-primary-soft-ink" : "border-line-2 bg-surface hover:bg-surface-2",
                        )}
                      >
                        {Math.round(s.rate * 100)} % · {money(s.amount)}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-ink-3">Regnet av inntekten din. Tommelfingerregelen er 10–20 %, men det riktige tallet er det du faktisk klarer.</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-2">Legg inn inntekt i første steg, så kan vi foreslå beløp ut fra den.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <SectionCard title="Egen sparing" total={totals.itemSaving} currency={currency} footer={<AddButton onClick={() => addCustom("saving", "fixed")}>Legg til sparepost</AddButton>}>
          {SAVING_PROMPTS.map((p) => {
            const item = bySlot.get(p.slot);
            return item ? row(item) : null;
          })}
          {customRows("saving", "fixed")}
        </SectionCard>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sparemål</CardTitle>
              <CardDescription>Hvor mye setter du av til hvert mål per måned? Vi viser når du er i mål.</CardDescription>
            </div>
            {goalSaving > 0 && <span className="text-sm font-semibold tabular-nums">{money(goalSaving)}<span className="font-normal text-ink-3"> /mnd</span></span>}
          </CardHeader>
          <CardContent className="pt-1">
            {goals.length === 0 ? (
              <p className="py-3 text-sm text-ink-2">
                Du har ingen sparemål ennå.{" "}
                <Link href="/sparemal" target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                  Opprett et sparemål
                </Link>{" "}
                i en ny fane, last siden på nytt, så dukker det opp her.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {goals.map((g) => (
                  <GoalRow key={g.id} goal={g} value={goalText[g.id] ?? ""} monthly={goalMonthly.get(g.id) ?? 0} today={today} currency={currency} onChange={(t) => setGoalText((s) => ({ ...s, [g.id]: t }))} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );

  // ---------- oppsummering ----------
  const alloc = useMemo(() => allocation({ income: totals.income, need: totals.groups.need, want: totals.groups.want, saving: totals.groups.saving }), [totals]);
  const checks: PlanCheck[] = useMemo(() => planChecks(totals, currency), [totals, currency]);
  const reality = useMemo(() => realityCheck(totals.byCategory, history), [totals, history]);
  const lineList = useMemo(() => categoryBudgetLines(totals), [totals]);
  const names = useMemo(() => new Map(categories.map((c) => [c.id, { name: c.name, icon: c.icon, color: c.color }])), [categories]);
  const tile = (label: string, value: string, goTo: StepId | null, tone?: "pos" | "neg") => (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className={cn("num-display mt-1 text-2xl", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</p>
      {goTo && (
        <button type="button" onClick={() => go(goTo)} className="mt-1 text-xs font-medium text-accent hover:underline">
          Endre
        </button>
      )}
    </div>
  );

  const summaryStep = (
    <>
      <Intro title="Slik ser planen din ut" headingRef={headingRef}>
        Sjekk at tallene stemmer. Du kan hoppe tilbake til et steg og endre, og ingenting lagres før du trykker «Lagre budsjettet».
      </Intro>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tile("Inntekt per måned", money(totals.income), "income")}
          {tile("Utgifter", money(totals.expenses), "fixed")}
          {tile("Sparing", money(totals.saving), "saving")}
          {tile(totals.leftover < 0 ? "Mangler" : "Til overs", money(Math.abs(totals.leftover)), null, totals.income > 0 || totals.expenses > 0 ? (totals.leftover < 0 ? "neg" : "pos") : undefined)}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Slik fordeles inntekten</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationBar segments={alloc.segments} overspent={alloc.overspent} currency={currency} />
            <div className="mt-5 border-t border-line pt-4">
              <GuideTable income={totals.income} groups={totals.groups} />
            </div>
          </CardContent>
        </Card>

        {checks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Sjekk planen</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <CheckList checks={checks} onAction={(a) => a === "leftover_to_saving" && leftoverToSaving()} />
            </CardContent>
          </Card>
        )}

        {history && reality.length > 0 && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Realitetssjekk mot historikken</CardTitle>
                <CardDescription>Der planen avviker fra det du faktisk har brukt. Du bestemmer selv, historikk er bare en pekepinn.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <RealityList rows={reality} months={history.months} currency={currency} names={names} canApply={(id) => !!variableRowFor(id)} onApply={applyAverage} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Dette havner i budsjettet</CardTitle>
              <CardDescription>Månedsbeløp per kategori, regnet ut fra postene dine.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {lineList.length === 0 ? (
              <p className="py-3 text-sm text-ink-2">Ingen utgifter er lagt inn ennå.</p>
            ) : (
              <ul className="divide-y divide-line">
                {lineList.map((l) => {
                  const c = names.get(l.categoryId);
                  return (
                    <li key={l.categoryId} className="flex items-center gap-3 py-2.5">
                      {c && <CategoryIcon icon={c.icon} color={c.color} size="sm" />}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c?.name ?? "Kategori"}</span>
                      <span className="text-sm font-semibold tabular-nums">{money(l.amount)}</span>
                    </li>
                  );
                })}
                {totals.saving > 0 && (
                  <li className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1 text-sm font-medium">Sparing</span>
                    <span className="text-sm font-semibold tabular-nums">{money(totals.saving)}</span>
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <fieldset>
              <legend className="text-sm font-medium">Når skal planen gjelde fra?</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {monthOptions.map((m) => (
                  <label
                    key={m}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40",
                      month === m ? "border-primary bg-primary-soft font-semibold text-primary-soft-ink" : "border-line-2 bg-surface hover:bg-surface-2",
                    )}
                  >
                    <input type="radio" name="gjelder-fra" value={m} checked={month === m} onChange={() => setMonth(m)} className="sr-only" />
                    {capitalize(monthName(m))}
                    {m === currentMonth ? " (denne måneden)" : ""}
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-3">Senere måneder bruker samme budsjett til du endrer det. Måneder som allerede har eget budsjett, påvirkes ikke.</p>
            </fieldset>
          </CardContent>
        </Card>
      </div>
    </>
  );

  const content: Record<StepId, ReactNode> = { income: incomeStep, fixed: fixedStep, variable: variableStep, saving: savingStep, summary: summaryStep };
  const idx = STEPS.findIndex((s) => s.id === step);
  const prev = STEPS[idx - 1];
  const next = STEPS[idx + 1];
  const canSave = draftLines(draft).length > 0 || hasPlan;

  return (
    <div>
      <Stepper step={step} onGo={go} />
      {step !== "summary" && <StatusBar totals={totals} currency={currency} />}
      <div key={step} className="animate-fade-up">
        {content[step]}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          {prev ? (
            <Button variant="ghost" onClick={() => go(prev.id)}>
              <ArrowLeft /> Tilbake
            </Button>
          ) : (
            <Button variant="ghost" asChild>
              <Link href="/budsjett">Avbryt</Link>
            </Button>
          )}
        </div>
        {next ? (
          <Button size="lg" onClick={() => go(next.id)}>
            {next.label} <ArrowRight />
          </Button>
        ) : (
          <Button size="lg" onClick={save} loading={saving} disabled={!canSave}>
            <Save /> Lagre budsjettet
          </Button>
        )}
      </div>
    </div>
  );
}
