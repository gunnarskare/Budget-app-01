// Kategorifarger lagres som hex i databasen (lys modus). Disse åtte er den validerte
// diagrampaletten – de mappes til CSS-variabler slik at de får egne, valgte trinn i mørk modus.

const SLOT: Record<string, string> = {
  "#2a78d6": "var(--c1)",
  "#eb6834": "var(--c2)",
  "#1baf7a": "var(--c3)",
  "#eda100": "var(--c4)",
  "#e87ba4": "var(--c5)",
  "#008300": "var(--c6)",
  "#6250d6": "var(--c7)",
  "#e34948": "var(--c8)",
};

/** Hex → CSS-farge som følger lys/mørk modus (for kjente palettfarger), ellers uendret. */
export function themed(hex: string): string {
  return SLOT[hex.toLowerCase()] ?? hex;
}
