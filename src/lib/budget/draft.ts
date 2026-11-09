// Kladden i budsjettbyggeren: forslagsrader + egne poster, beløp som tekst (slik brukeren skriver dem),
// og oversettelse til beregninger og til det som sendes til serveren. Rene funksjoner.

import type { BudgetPlanItem, Category, Frequency, PlanKind, PlanNature, Subcategory } from "@/lib/types";
import { monthlyOf, type PlanLine } from "./plan";
import { ALL_PROMPTS, type PlanPrompt } from "./templates";

export interface DraftItem {
  /** Stabil nøkkel i brukergrensesnittet (ikke databasen) */
  key: string;
  /** Databasens id når posten er lagret tidligere */
  id: string | null;
  /** Forslagsradens nøkkel; null for egne poster */
  slot: string | null;
  kind: PlanKind;
  nature: PlanNature;
  name: string;
  categoryId: string | null;
  subcategoryId: string | null;
  /** Det brukeren har skrevet i beløpsfeltet */
  amount: string;
  frequency: Frequency;
  /** Egen post (ikke et forslag): kan få nytt navn og slettes */
  custom: boolean;
  hint?: string;
}

/** «12 500», «12500», «1 250,50» → tall. Tomt felt = 0, ugyldig = null. */
export function parseAmountText(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(/kr$/i, "").replace(",", ".");
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 99_999_999 ? Math.round(n * 100) / 100 : null;
}

const amountFmt = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });

/** 12000 → «12 000» (med hardt mellomrom), 249.5 → «249,5». Leses tilbake av parseAmountText. */
export const formatAmountText = (n: number): string => amountFmt.format(n);

const toText = formatAmountText;

/** Finner kategori (og underkategori) en forslagsrad peker på. Null hvis kategorien ikke finnes lenger. */
export function resolvePrompt(
  p: Pick<PlanPrompt, "categoryKey" | "subKey">,
  categories: readonly Category[],
  subcategories: readonly Subcategory[],
): { categoryId: string; subcategoryId: string | null } | null {
  const cat = categories.find((c) => c.system_key === p.categoryKey && !c.archived_at);
  if (!cat) return null;
  const sub = p.subKey ? subcategories.find((s) => s.category_id === cat.id && s.system_key === `${p.categoryKey}.${p.subKey}`) : undefined;
  return { categoryId: cat.id, subcategoryId: sub?.id ?? null };
}

export interface DraftSource {
  items: readonly BudgetPlanItem[];
  categories: readonly Category[];
  subcategories: readonly Subcategory[];
  /** Eksisterende (manuelt laget) budsjett. Brukes kun som utgangspunkt når det ikke finnes noen plan ennå. */
  fallback?: { plannedIncome: number | null; lines: ReadonlyArray<{ categoryId: string; amount: number }> } | null;
}

/** Bygger kladden: alle forslagsrader (fylt ut hvis de er lagret) + lagrede egne poster. */
export function buildDraft(src: DraftSource): { draft: DraftItem[]; importedFromBudget: boolean } {
  const bySlot = new Map(src.items.filter((i) => i.slot).map((i) => [i.slot as string, i]));
  const placed = new Set<string>();
  const draft: DraftItem[] = [];

  for (const p of ALL_PROMPTS) {
    const target = resolvePrompt(p, src.categories, src.subcategories);
    if (!target) continue;
    const saved = bySlot.get(p.slot);
    if (saved) placed.add(saved.id);
    draft.push({
      key: p.slot,
      id: saved?.id ?? null,
      slot: p.slot,
      kind: p.kind,
      nature: p.nature,
      name: p.label,
      categoryId: target.categoryId,
      subcategoryId: target.subcategoryId,
      amount: saved ? toText(saved.amount) : "",
      frequency: saved?.frequency ?? p.frequency,
      custom: false,
      hint: p.hint,
    });
  }

  for (const it of src.items) {
    if (placed.has(it.id)) continue;
    draft.push({
      key: it.id,
      id: it.id,
      slot: null,
      kind: it.kind,
      nature: it.nature,
      name: it.name,
      categoryId: it.category_id,
      subcategoryId: it.subcategory_id,
      amount: toText(it.amount),
      frequency: it.frequency,
      custom: true,
    });
  }

  let importedFromBudget = false;
  if (src.items.length === 0 && src.fallback) {
    const lonn = draft.find((d) => d.slot === "inntekter.lonn");
    if (lonn && src.fallback.plannedIncome && src.fallback.plannedIncome > 0) {
      lonn.amount = toText(src.fallback.plannedIncome);
      importedFromBudget = true;
    }
    for (const line of src.fallback.lines) {
      if (line.amount <= 0) continue;
      const slotRow = draft.find((d) => d.slot?.startsWith("var.") && d.categoryId === line.categoryId && d.amount === "");
      if (slotRow) {
        slotRow.amount = toText(line.amount);
        importedFromBudget = true;
        continue;
      }
      const cat = src.categories.find((c) => c.id === line.categoryId);
      if (!cat || cat.kind !== "expense") continue;
      // Kategorier uten variabel forslagsrad (bolig, abonnementer, lån) er i hovedsak faste utgifter,
      // og samlebeløpet vises sammen med dem så det er lett å dele opp i enkeltposter.
      draft.push({
        key: `budget-${cat.id}`,
        id: null,
        slot: null,
        kind: "expense",
        nature: "fixed",
        name: `${cat.name} (fra budsjettet ditt)`,
        categoryId: cat.id,
        subcategoryId: null,
        amount: toText(line.amount),
        frequency: "monthly",
        custom: true,
      });
      importedFromBudget = true;
    }
  }
  return { draft, importedFromBudget };
}

/** Ny, tom egen post. */
export function newCustomItem(key: string, kind: PlanKind, nature: PlanNature, categoryId: string | null = null): DraftItem {
  return { key, id: null, slot: null, kind, nature, name: "", categoryId, subcategoryId: null, amount: "", frequency: "monthly", custom: true };
}

/** Postene som teller i beregningene (gyldig beløp > 0). */
export function draftLines(draft: readonly DraftItem[]): PlanLine[] {
  const out: PlanLine[] = [];
  for (const d of draft) {
    const amount = parseAmountText(d.amount);
    if (!amount || amount <= 0) continue;
    out.push({ kind: d.kind, nature: d.nature, categoryId: d.categoryId, subcategoryId: d.subcategoryId, amount, frequency: d.frequency });
  }
  return out;
}

/** Månedsbeløp for én kladdepost (0 når feltet er tomt eller ugyldig). */
export function draftMonthly(d: Pick<DraftItem, "amount" | "frequency">): number {
  const amount = parseAmountText(d.amount);
  return amount ? monthlyOf({ amount, frequency: d.frequency }) : 0;
}

/** Feil som hindrer lagring, per postnøkkel. */
export function draftIssues(draft: readonly DraftItem[]): Record<string, string> {
  const issues: Record<string, string> = {};
  for (const d of draft) {
    const amount = parseAmountText(d.amount);
    if (amount === null) {
      issues[d.key] = "Skriv et gyldig beløp";
      continue;
    }
    if (amount <= 0) continue;
    if (d.custom && d.name.trim() === "") issues[d.key] = "Gi posten et navn";
    else if (d.kind === "expense" && !d.categoryId) issues[d.key] = "Velg en kategori";
  }
  return issues;
}

export interface PlanItemInput {
  id: string | null;
  slot: string | null;
  kind: PlanKind;
  nature: PlanNature;
  name: string;
  categoryId: string | null;
  subcategoryId: string | null;
  amount: number;
  frequency: Frequency;
  sortOrder: number;
}

/** Det som sendes til serveren: kun poster med beløp. */
export function draftPayload(draft: readonly DraftItem[]): PlanItemInput[] {
  const out: PlanItemInput[] = [];
  draft.forEach((d, i) => {
    const amount = parseAmountText(d.amount);
    if (!amount || amount <= 0) return;
    out.push({
      id: d.id,
      slot: d.slot,
      kind: d.kind,
      nature: d.nature,
      name: d.name.trim().slice(0, 80),
      categoryId: d.categoryId,
      subcategoryId: d.subcategoryId,
      amount,
      frequency: d.frequency,
      sortOrder: i,
    });
  });
  return out;
}
