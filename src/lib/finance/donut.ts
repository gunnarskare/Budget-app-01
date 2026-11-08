// Gjør forbruk per kategori om til donut-/rangeringsdeler: maks 7 + «Andre» (dataviz-regel:
// aldri flere farger enn paletten tåler – halen foldes sammen).

import type { Lookups } from "@/lib/types";
import type { CategorySpend } from "./aggregate";

export interface Slice {
  id: string;
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  amount: number;
  share: number;
  count: number;
  other?: boolean;
}

export const MAX_SLICES = 7;

export function buildSlices(spend: CategorySpend[], lk: Lookups, max = MAX_SLICES): Slice[] {
  const positive = spend.filter((s) => s.amount > 0);
  const total = positive.reduce((n, s) => n + s.amount, 0);
  if (total <= 0) return [];

  const named = positive.map((s) => {
    const cat = s.categoryId ? lk.categories.get(s.categoryId) : undefined;
    return {
      id: s.categoryId ?? "uncategorized",
      categoryId: s.categoryId,
      name: cat?.name ?? "Ukategorisert",
      icon: cat?.icon ?? "tag",
      color: cat?.color ?? "#898781",
      amount: s.amount,
      share: s.amount / total,
      count: s.count,
    };
  });

  if (named.length <= max + 1) return named;
  const head = named.slice(0, max);
  const tail = named.slice(max);
  const amount = tail.reduce((n, s) => n + s.amount, 0);
  return [
    ...head,
    {
      id: "other",
      categoryId: null,
      name: `Andre (${tail.length})`,
      icon: "tag",
      color: "#b5b3ac",
      amount,
      share: amount / total,
      count: tail.reduce((n, s) => n + s.count, 0),
      other: true,
    },
  ];
}
