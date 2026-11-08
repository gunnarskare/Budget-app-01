// Kategoriseringsmotor. Rekkefølge (første treff vinner):
//   1. Brukerdefinerte og lærte regler
//   2. Tidligere godkjente kategoriseringer (historikk)
//   3. Butikk-/leverandørregister
//   4. Nøkkelord
//   5. (utenfor denne modulen) AI for det som fortsatt er usikkert
// Ren funksjon uten I/O – dekket av enhetstester.

import { cleanDescription, looksLikePersonalTransfer } from "@/lib/csv/clean";
import { UNCATEGORIZED_EXPENSE, UNCATEGORIZED_INCOME } from "@/lib/categories/defaults";
import type {
  CategorizationRule,
  Category,
  CategorySource,
  ReviewStatus,
  Subcategory,
  TransferStatus,
} from "@/lib/types";
import { findKeyword } from "./keywords";
import { findMerchant } from "./merchants";

/** Konfidens fra og med denne verdien godkjennes automatisk; under går til manuell godkjenning. */
export const AUTO_THRESHOLD = 0.8;

export interface CategoryRef {
  categoryId: string | null;
  subcategoryId: string | null;
}

export interface HistoryEntry extends CategoryRef {
  count: number;
}

export class Catalog {
  private catByKey = new Map<string, Category>();
  private subByKey = new Map<string, Subcategory>();
  private catById = new Map<string, Category>();
  private subById = new Map<string, Subcategory>();

  constructor(
    public readonly categories: Category[],
    public readonly subcategories: Subcategory[],
  ) {
    for (const c of categories) {
      this.catById.set(c.id, c);
      if (c.system_key) this.catByKey.set(c.system_key, c);
    }
    for (const s of subcategories) {
      this.subById.set(s.id, s);
      if (s.system_key) this.subByKey.set(s.system_key, s);
    }
  }

  /** «transport.drivstoff» eller «transport» → id-par, eller null hvis kategorien er slettet. */
  resolve(key: string): CategoryRef | null {
    if (!key) return null;
    const sub = this.subByKey.get(key);
    if (sub && this.catById.has(sub.category_id)) return { categoryId: sub.category_id, subcategoryId: sub.id };
    const catKey = key.split(".")[0];
    const cat = this.catByKey.get(catKey);
    return cat ? { categoryId: cat.id, subcategoryId: null } : null;
  }

  category(id: string | null): Category | undefined {
    return id ? this.catById.get(id) : undefined;
  }

  subcategory(id: string | null): Subcategory | undefined {
    return id ? this.subById.get(id) : undefined;
  }

  /** «Transport › Drivstoff» */
  label(ref: CategoryRef): string {
    const c = this.category(ref.categoryId);
    if (!c) return "Ukategorisert";
    const s = this.subcategory(ref.subcategoryId);
    return s ? `${c.name} › ${s.name}` : c.name;
  }

  isIncome(ref: CategoryRef): boolean {
    return this.category(ref.categoryId)?.kind === "income";
  }
}

export interface EngineContext {
  catalog: Catalog;
  rules: CategorizationRule[];
  /** merchant_key → tidligere godkjente valg */
  history: Map<string, HistoryEntry[]>;
}

export interface Suggestion extends CategoryRef {
  source: CategorySource;
  confidence: number;
  /** Kort forklaring til brukeren («Kjent butikk: REMA 1000»). */
  reason: string;
  transfer: TransferStatus;
  isSubscription: boolean;
  /** Positivt beløp i en utgiftskategori: tilbakebetaling/refusjon. */
  isRefund: boolean;
  merchantName: string | null;
  ruleId: string | null;
  /** Pent visningsnavn og læringsnøkkel */
  display: string;
  merchantKey: string;
}

export const statusFor = (confidence: number): ReviewStatus => (confidence >= AUTO_THRESHOLD ? "auto" : "review");

/** AI-forslag krever høyere sikkerhet enn regler før de godkjennes automatisk. */
export const AI_AUTO_THRESHOLD = 0.85;

export function statusForSource(source: CategorySource, confidence: number): ReviewStatus {
  if (source === "ai") return confidence >= AI_AUTO_THRESHOLD ? "auto" : "review";
  if (source === "default") return "review";
  return statusFor(confidence);
}

function ruleMatches(rule: CategorizationRule, normalized: string, direction: "in" | "out"): boolean {
  if (rule.direction !== "any" && rule.direction !== direction) return false;
  const p = rule.pattern.toLowerCase();
  switch (rule.match_type) {
    case "equals":
      return normalized === p;
    case "starts_with":
      return normalized.startsWith(p);
    default:
      return normalized.includes(p);
  }
}

function sortRules(rules: CategorizationRule[]): CategorizationRule[] {
  return [...rules].sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.source === b.source ? 0 : a.source === "user" ? -1 : 1) ||
      b.pattern.length - a.pattern.length,
  );
}

export function categorize(input: { description: string; amount: number }, ctx: EngineContext): Suggestion {
  const { catalog } = ctx;
  const clean = cleanDescription(input.description);
  const direction: "in" | "out" = input.amount > 0 ? "in" : "out";

  const base = {
    display: clean.display || input.description.slice(0, 120),
    merchantKey: clean.key,
    transfer: "none" as TransferStatus,
    isSubscription: false,
    merchantName: null as string | null,
    ruleId: null as string | null,
  };

  const finish = (s: Omit<Suggestion, "isRefund" | keyof typeof base> & Partial<typeof base>): Suggestion => {
    const merged = { ...base, ...s };
    return {
      ...merged,
      isRefund: input.amount > 0 && s.categoryId !== null && catalog.category(s.categoryId)?.kind === "expense" && merged.transfer === "none",
    };
  };

  // 1. Brukerregler
  for (const rule of sortRules(ctx.rules)) {
    if (!ruleMatches(rule, clean.normalized, direction)) continue;
    const hasCategory = rule.category_id && catalog.category(rule.category_id);
    if (!hasCategory && !rule.mark_transfer) continue;
    return finish({
      categoryId: hasCategory ? rule.category_id : null,
      subcategoryId: hasCategory ? rule.subcategory_id : null,
      source: "rule",
      confidence: 0.99,
      reason: `Din regel: «${rule.pattern}»`,
      transfer: rule.mark_transfer ? "confirmed" : "none",
      ruleId: rule.id,
    });
  }

  // 2. Historikk
  const hist = ctx.history.get(clean.key);
  if (hist && hist.length > 0) {
    const total = hist.reduce((n, h) => n + h.count, 0);
    const top = hist.reduce((a, b) => (b.count > a.count ? b : a));
    const share = top.count / total;
    if (share >= 0.6 && catalog.category(top.categoryId)) {
      const baseConf = total >= 3 ? 0.96 : total === 2 ? 0.94 : 0.9;
      return finish({
        categoryId: top.categoryId,
        subcategoryId: top.subcategoryId,
        source: "history",
        confidence: Math.round(baseConf * share * 100) / 100,
        reason: total === 1 ? "Du valgte dette sist" : `Du har valgt dette ${top.count} av ${total} ganger`,
      });
    }
  }

  // 3. Butikk/leverandør
  const merchant = findMerchant(clean.normalized, direction);
  if (merchant) {
    const ref = catalog.resolve(merchant.def.category);
    if (ref) {
      return finish({
        ...ref,
        source: "merchant",
        confidence: merchant.def.confidence ?? 0.92,
        reason: `Kjent butikk: ${merchant.def.name}`,
        isSubscription: !!merchant.def.subscription,
        merchantName: merchant.def.name,
      });
    }
  }

  // 4. Nøkkelord
  const kw = findKeyword(clean.normalized, direction);
  if (kw) {
    if (kw.rule.transfer) {
      return finish({
        categoryId: null,
        subcategoryId: null,
        source: "keyword",
        confidence: kw.rule.confidence,
        reason: "Ser ut som overføring mellom egne kontoer",
        transfer: "confirmed",
      });
    }
    const ref = catalog.resolve(kw.rule.category);
    if (ref) {
      return finish({
        ...ref,
        source: "keyword",
        confidence: kw.rule.confidence,
        reason: `Nøkkelord: «${kw.stem}»`,
        isSubscription: !!kw.rule.subscription,
      });
    }
  }

  // 5. Ingen treff – foreslå nøytral kategori og send til manuell godkjenning
  const ref = catalog.resolve(direction === "in" ? UNCATEGORIZED_INCOME : UNCATEGORIZED_EXPENSE) ?? {
    categoryId: null,
    subcategoryId: null,
  };
  return finish({
    ...ref,
    source: "default",
    confidence: 0,
    reason: looksLikePersonalTransfer(input.description)
      ? "Overføring til/fra en privatperson – velg kategori"
      : "Ingen treff – velg kategori",
  });
}

/** Bygger en lært regel av et brukervalg. Returnerer null hvis nøkkelen er for kort til å være trygg. */
export function ruleFromChoice(
  merchantKey: string,
  ref: CategoryRef,
): { pattern: string; match_type: "contains"; direction: "any"; category_id: string; subcategory_id: string | null } | null {
  const pattern = merchantKey.trim().toLowerCase();
  if (pattern.length < 3 || !ref.categoryId) return null;
  return { pattern, match_type: "contains", direction: "any", category_id: ref.categoryId, subcategory_id: ref.subcategoryId };
}
