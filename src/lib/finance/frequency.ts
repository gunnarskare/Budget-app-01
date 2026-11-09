// Frekvens (uke/måned/kvartal/år) og omregning til månedsbeløp.
// Liten og uten avhengigheter, slik at både server og klient kan bruke den.

import type { Frequency } from "@/lib/types";

/** Omregner til månedlig beløp (positivt tall) for sammenligning. */
export function monthlyEquivalent(amount: number, frequency: Frequency): number {
  const a = Math.abs(amount);
  switch (frequency) {
    case "weekly":
      return (a * 52) / 12;
    case "monthly":
      return a;
    case "quarterly":
      return a / 3;
    case "yearly":
      return a / 12;
  }
}

export const FREQUENCY_OPTIONS: ReadonlyArray<{ value: Frequency; label: string; short: string }> = [
  { value: "monthly", label: "per måned", short: "/mnd" },
  { value: "weekly", label: "per uke", short: "/uke" },
  { value: "quarterly", label: "per kvartal", short: "/kvartal" },
  { value: "yearly", label: "per år", short: "/år" },
];

export const frequencyShort = (f: Frequency): string => FREQUENCY_OPTIONS.find((o) => o.value === f)?.short ?? "/mnd";
