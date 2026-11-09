// Budsjettplan: poster → månedsbeløp, kategorisummer, fordeling (behov / ønsker / sparing),
// tommelfingerråd, sparemål-krav og realitetssjekk mot historikk. Rene funksjoner uten I/O.
//
// Alle beløp rundes til hele kroner per post, slik at tallene i veiviseren, på
// budsjettsiden og i databasen (som lagrer hele kroner) alltid stemmer overens.

import { monthlyEquivalent } from "@/lib/finance/frequency";
import { goalProgress } from "@/lib/finance/goals";
import { formatMoney, formatPercent, monthLabel, roundNice } from "@/lib/format";
import type { BudgetPlanItem, Category, Frequency, PlanKind, PlanNature, SavingsGoal, Subcategory } from "@/lib/types";

/** Det beregningene trenger å vite om en post (fungerer for både lagrede poster og kladd). */
export interface PlanLine {
  kind: PlanKind;
  nature: PlanNature;
  categoryId: string | null;
  subcategoryId: string | null;
  /** Beløp per `frequency` */
  amount: number;
  frequency: Frequency;
}

/** Månedsbeløp for en post, i hele kroner. */
export function monthlyOf(line: Pick<PlanLine, "amount" | "frequency">): number {
  if (!Number.isFinite(line.amount) || line.amount <= 0) return 0;
  return Math.round(monthlyEquivalent(line.amount, line.frequency));
}

// ---------------------------------------------------------------------------------------
// Behov / ønsker / sparing (tommelfingerregelen 50/30/20)

export type BudgetGroup = "need" | "want" | "saving";

export const GROUP_LABEL: Record<BudgetGroup, string> = { need: "Behov", want: "Ønsker", saving: "Sparing" };

/** Veiledende fordeling i 50/30/20-regelen. */
export const GROUP_GUIDE: Record<BudgetGroup, number> = { need: 0.5, want: 0.3, saving: 0.2 };

const NEED_CATEGORY_KEYS = new Set(["bolig", "dagligvarer", "transport", "familie", "helse", "okonomi"]);
const NEED_SUBCATEGORY_KEYS = new Set(["abonnementer.mobil"]);
const WANT_SUBCATEGORY_KEYS = new Set(["transport.taxi"]);

/**
 * Er en utgift et behov eller et ønske? Bygger på kategoriens systemnøkkel;
 * egne kategorier (uten nøkkel) regnes som ønsker.
 */
export function expenseGroup(categoryKey: string | null | undefined, subcategoryKey?: string | null): "need" | "want" {
  if (subcategoryKey && NEED_SUBCATEGORY_KEYS.has(subcategoryKey)) return "need";
  if (subcategoryKey && WANT_SUBCATEGORY_KEYS.has(subcategoryKey)) return "want";
  return categoryKey && NEED_CATEGORY_KEYS.has(categoryKey) ? "need" : "want";
}

// ---------------------------------------------------------------------------------------
// Totaler

type PlanLookups = { categories: ReadonlyMap<string, Category>; subcategories: ReadonlyMap<string, Subcategory> };

export interface PlanTotals {
  /** Alt under er per måned, i hele kroner */
  income: number;
  fixed: number;
  variable: number;
  expenses: number;
  /** Sparing fra egne sparingsposter (nødfond, fond …) */
  itemSaving: number;
  /** Sparing til sparemål */
  goalSaving: number;
  saving: number;
  /** Inntekt − utgifter − sparing. Negativ = planen går i minus. */
  leftover: number;
  groups: { need: number; want: number; saving: number };
  /** Andel av inntekten som spares (null uten inntekt) */
  savingRate: number | null;
  /** Månedsbeløp per utgiftskategori */
  byCategory: Map<string, number>;
}

export function planTotals(lines: PlanLine[], lk: PlanLookups, goalSaving = 0): PlanTotals {
  let income = 0;
  let fixed = 0;
  let variable = 0;
  let itemSaving = 0;
  let need = 0;
  let want = 0;
  const byCategory = new Map<string, number>();

  for (const l of lines) {
    const m = monthlyOf(l);
    if (m <= 0) continue;
    if (l.kind === "income") {
      income += m;
    } else if (l.kind === "saving") {
      itemSaving += m;
    } else {
      if (l.nature === "fixed") fixed += m;
      else variable += m;
      const cat = l.categoryId ? lk.categories.get(l.categoryId) : undefined;
      const sub = l.subcategoryId ? lk.subcategories.get(l.subcategoryId) : undefined;
      if (expenseGroup(cat?.system_key, sub?.system_key) === "need") need += m;
      else want += m;
      if (l.categoryId) byCategory.set(l.categoryId, (byCategory.get(l.categoryId) ?? 0) + m);
    }
  }

  const goals = Number.isFinite(goalSaving) ? Math.max(0, Math.round(goalSaving)) : 0;
  const saving = itemSaving + goals;
  const expenses = fixed + variable;
  return {
    income,
    fixed,
    variable,
    expenses,
    itemSaving,
    goalSaving: goals,
    saving,
    leftover: income - expenses - saving,
    groups: { need, want, saving },
    savingRate: income > 0 ? saving / income : null,
    byCategory,
  };
}

/** Kategorilinjene som skrives til budsjettet (hele kroner, størst først). */
export function categoryBudgetLines(totals: Pick<PlanTotals, "byCategory">): Array<{ categoryId: string; amount: number }> {
  return [...totals.byCategory.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Behov/ønsker for budsjettlinjene en periode faktisk bruker (brukes på budsjettsiden).
 *
 * Har en kategori poster i planen, brukes postenes fordeling (nøyaktig ned på underkategori,
 * f.eks. mobil = behov og streaming = ønske), skalert til linjens beløp hvis du har justert det.
 * Uten poster avgjør kategorien alene. Slik stemmer tallene med dem i budsjettbyggeren.
 */
export function groupAmountsForBudget(
  lines: ReadonlyArray<{ categoryId: string; amount: number }>,
  planItems: ReadonlyArray<Pick<BudgetPlanItem, "kind" | "category_id" | "subcategory_id" | "amount" | "frequency">>,
  lk: PlanLookups,
): { need: number; want: number } {
  const fromPlan = new Map<string, { need: number; want: number }>();
  for (const it of planItems) {
    if (it.kind !== "expense" || !it.category_id) continue;
    const m = monthlyOf({ amount: it.amount, frequency: it.frequency });
    if (m <= 0) continue;
    const cat = lk.categories.get(it.category_id);
    const sub = it.subcategory_id ? lk.subcategories.get(it.subcategory_id) : undefined;
    const entry = fromPlan.get(it.category_id) ?? { need: 0, want: 0 };
    if (expenseGroup(cat?.system_key, sub?.system_key) === "need") entry.need += m;
    else entry.want += m;
    fromPlan.set(it.category_id, entry);
  }

  let need = 0;
  let total = 0;
  for (const l of lines) {
    total += l.amount;
    const split = fromPlan.get(l.categoryId);
    const planned = split ? split.need + split.want : 0;
    if (split && planned > 0) need += (l.amount * split.need) / planned;
    else if (expenseGroup(lk.categories.get(l.categoryId)?.system_key) === "need") need += l.amount;
  }
  const needRounded = Math.round(need);
  return { need: needRounded, want: total - needRounded };
}

// ---------------------------------------------------------------------------------------
// Fordeling («hvor går pengene?»)

export interface AllocationSegment {
  key: "need" | "want" | "saving" | "leftover";
  amount: number;
  /** Andel av stolpen (0–1) */
  share: number;
}

/**
 * Deler inntekten i behov / ønsker / sparing / til overs. Planlegger du mer enn du tjener,
 * er stolpen planen (ikke inntekten) og `overspent` forteller hvor mye som mangler.
 */
export function allocation(input: { income: number; need: number; want: number; saving: number }): { segments: AllocationSegment[]; overspent: number } {
  const planned = input.need + input.want + input.saving;
  const base = Math.max(input.income, planned);
  const leftover = Math.max(0, input.income - planned);
  const overspent = Math.max(0, planned - input.income);
  if (base <= 0) return { segments: [], overspent: 0 };
  const raw: Array<[AllocationSegment["key"], number]> = [
    ["need", input.need],
    ["want", input.want],
    ["saving", input.saving],
    ["leftover", leftover],
  ];
  return {
    segments: raw.filter(([, amount]) => amount > 0).map(([key, amount]) => ({ key, amount, share: amount / base })),
    overspent,
  };
}

// ---------------------------------------------------------------------------------------
// Råd – formulert som tommelfingerregler, aldri som fasit

export interface PlanCheck {
  id: string;
  tone: "good" | "info" | "warn" | "bad";
  title: string;
  text: string;
  /** Knapp som kan gjøre forslaget direkte */
  action?: "leftover_to_saving";
}

export function planChecks(t: PlanTotals, currency = "NOK"): PlanCheck[] {
  const money = (n: number) => formatMoney(n, { currency });
  const out: PlanCheck[] = [];

  if (t.income <= 0) {
    if (t.expenses + t.saving > 0) {
      out.push({
        id: "no-income",
        tone: "info",
        title: "Legg inn inntekt",
        text: "Uten inntekt kan vi ikke vise hva som blir til overs. Gå tilbake til første steg og legg den inn.",
      });
    }
    return out;
  }

  if (t.leftover < 0) {
    out.push({ id: "overspent", tone: "bad", title: "Planen går i minus", text: `Du har planlagt ${money(-t.leftover)} mer enn inntekten. Se på utgiftene eller sparingen.` });
  } else if (t.leftover / t.income >= 0.05) {
    out.push({
      id: "unallocated",
      tone: "info",
      title: "Penger uten jobb",
      text: `${money(t.leftover)} er ikke fordelt ennå. Sett dem av til sparing, eller legg dem til en utgift du vet kommer.`,
      action: "leftover_to_saving",
    });
  } else {
    out.push({ id: "balanced", tone: "good", title: "Hver krone har en jobb", text: "Planen går opp – nesten hele inntekten er fordelt." });
  }

  const rate = t.savingRate ?? 0;
  if (t.saving <= 0) {
    out.push({
      id: "no-saving",
      tone: "warn",
      title: "Ingen sparing planlagt",
      text: "Å sette av litt hver måned, selv fem prosent, gir en buffer til det uventede. Du kan legge det inn i sparing-steget.",
    });
  } else if (rate < 0.1) {
    out.push({
      id: "low-saving",
      tone: "info",
      title: `Du sparer ${formatPercent(rate)} av inntekten`,
      text: "Mange sikter mot 10–20 %. Det finnes ikke et riktig tall – det viktigste er et beløp du klarer å holde.",
    });
  } else {
    out.push({ id: "saving-ok", tone: "good", title: `Du sparer ${formatPercent(rate)} av inntekten`, text: "Det er i tråd med vanlige tommelfingerregler på 10–20 %." });
  }

  if (t.fixed / t.income > 0.6) {
    out.push({
      id: "fixed-high",
      tone: "warn",
      title: `Faste utgifter tar ${formatPercent(t.fixed / t.income)} av inntekten`,
      text: "Da blir det lite rom for det uforutsette. Se om noen av de faste kostnadene kan reduseres på sikt.",
    });
  } else if (t.groups.need / t.income > 0.6) {
    out.push({
      id: "needs-high",
      tone: "info",
      title: `Behov tar ${formatPercent(t.groups.need / t.income)} av inntekten`,
      text: "Tommelfingerregelen 50/30/20 regner med rundt 50 % til behov. Det er en rettesnor, ikke et krav – men det gir mindre rom til ønsker og sparing.",
    });
  }
  return out;
}

/** Hurtigvalg for sparing: 10, 15 og 20 prosent av inntekten. */
export function savingSuggestions(income: number): Array<{ rate: number; amount: number }> {
  if (!Number.isFinite(income) || income <= 0) return [];
  return [0.1, 0.15, 0.2].map((rate) => ({ rate, amount: roundNice(income * rate) }));
}

// ---------------------------------------------------------------------------------------
// Sparemål

export interface GoalAdvice {
  tone: "good" | "warn" | "info";
  text: string;
  /** Månedlig beløp som kreves for å nå måldatoen (null uten måldato) */
  requiredMonthly: number | null;
}

/** Hva betyr et månedlig sparebeløp for målet? */
export function goalAdvice(
  goal: Pick<SavingsGoal, "target_amount" | "current_amount" | "target_date">,
  monthly: number,
  today: string,
  currency = "NOK",
): GoalAdvice {
  const money = (n: number) => formatMoney(n, { currency });
  const p = goalProgress({ ...goal, monthly_contribution: Math.max(0, monthly) }, today);
  const required = p.requiredMonthly;
  if (p.status === "done") return { tone: "good", text: "Målet er nådd.", requiredMonthly: 0 };

  const targetLabel = goal.target_date ? monthLabel(goal.target_date.slice(0, 7)) : null;
  if (monthly <= 0) {
    return {
      tone: "info",
      requiredMonthly: required,
      text: required && targetLabel ? `For å nå målet innen ${targetLabel} trenger du ca. ${money(required)} per måned.` : "Legg inn et månedlig beløp for å se når du når målet.",
    };
  }
  const reached = p.estimatedDate ? monthLabel(p.estimatedDate.slice(0, 7)) : null;
  if (p.status === "behind" && reached && targetLabel) {
    return {
      tone: "warn",
      requiredMonthly: required,
      text: `Med ${money(monthly)} per måned når du målet først rundt ${reached}, etter ${targetLabel}.${required ? ` Du trenger ca. ${money(required)} per måned.` : ""}`,
    };
  }
  return {
    tone: "good",
    requiredMonthly: required,
    text: reached ? `Med ${money(monthly)} per måned når du målet rundt ${reached}${targetLabel ? ` – i tide til ${targetLabel}` : ""}.` : `Du sparer ${money(monthly)} per måned.`,
  };
}

// ---------------------------------------------------------------------------------------
// Realitetssjekk mot historikk (valgfritt – kun når det finnes nok data)

/** Gjennomsnittlig månedlig forbruk per kategori fra siste hele måneder. */
export interface PlanHistory {
  months: number;
  average: Record<string, number>;
}

export interface RealityRow {
  categoryId: string;
  planned: number;
  average: number;
  /** under = planlagt lavere enn vanlig forbruk, over = planlagt godt over */
  level: "under" | "over";
}

/** Kategorier der planen avviker tydelig fra det du faktisk har brukt. Størst avvik først. */
export function realityCheck(planned: ReadonlyMap<string, number>, history: PlanHistory | null, limit = 6): RealityRow[] {
  if (!history || history.months < 2) return [];
  const rows: Array<RealityRow & { gap: number }> = [];
  for (const [categoryId, average] of Object.entries(history.average)) {
    if (average < 300) continue;
    const p = planned.get(categoryId) ?? 0;
    if (p < average * 0.8 && average - p >= 200) rows.push({ categoryId, planned: p, average, level: "under", gap: average - p });
    else if (p > average * 1.3 && p - average >= 500) rows.push({ categoryId, planned: p, average, level: "over", gap: p - average });
  }
  return rows.sort((a, b) => b.gap - a.gap).slice(0, limit).map(({ gap: _gap, ...row }) => row);
}
