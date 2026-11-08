// Tolkning av beløp i norske (og internasjonale) CSV-formater.

export type DecimalSep = "," | ".";

const MINUS_CHARS = /[−‒–—]/g; // −  ‒  –  —

/** Fjern alt unntatt sifre og skilletegn. */
function stripToNumeric(s: string): string {
  return s.replace(/[^\d.,]/g, "");
}

/**
 * Tolker et beløp. Håndterer «1 234,56», «1.234,56», «1,234.56», «-1234.56»,
 * «(1 234,56)», «1234,56-», «kr 1 234,56», «+500», unicode-minus og NBSP.
 *
 * `decimalHint` brukes kun når tegnet er tvetydig («1.234» kan være 1234 eller 1,234).
 */
export function parseAmount(input: string | null | undefined, decimalHint: DecimalSep = ","): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  s = s.replace(MINUS_CHARS, "-");
  let negative = false;

  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/-\s*$/.test(s)) {
    negative = true;
    s = s.replace(/-\s*$/, "");
  }
  if (/^\s*-/.test(s) || /^[^\d]*-\s*\d/.test(s)) {
    negative = true;
  }
  if (/\b(dr|db|debit)\b/i.test(s)) negative = true;

  const numeric = stripToNumeric(s);
  if (!numeric || !/\d/.test(numeric)) return null;

  const commas = (numeric.match(/,/g) ?? []).length;
  const dots = (numeric.match(/\./g) ?? []).length;
  let normalized: string;

  if (commas > 0 && dots > 0) {
    // Siste skilletegn er desimaltegn.
    const lastComma = numeric.lastIndexOf(",");
    const lastDot = numeric.lastIndexOf(".");
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = numeric.split(thousands).join("").replace(decimal, ".");
  } else if (commas > 0 || dots > 0) {
    const sep = commas > 0 ? "," : ".";
    const count = commas > 0 ? commas : dots;
    if (count > 1) {
      // «1.234.567» – tusenskilletegn
      normalized = numeric.split(sep).join("");
    } else {
      const [intPart, fracPart = ""] = numeric.split(sep);
      if (fracPart.length === 3 && intPart.length >= 1 && intPart.length <= 3 && sep !== decimalHint) {
        normalized = intPart + fracPart; // tvetydig, tolkes som tusenskille
      } else {
        normalized = `${intPart || "0"}.${fracPart}`;
      }
    }
  } else {
    normalized = numeric;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return negative ? -rounded : rounded;
}

/** Finner ut om en kolonne bruker «,» eller «.» som desimaltegn. Standard er «,». */
export function detectDecimalSeparator(values: Array<string | null | undefined>): DecimalSep {
  let comma = 0;
  let dot = 0;
  for (const raw of values) {
    if (!raw) continue;
    const numeric = stripToNumeric(String(raw));
    const lastComma = numeric.lastIndexOf(",");
    const lastDot = numeric.lastIndexOf(".");
    if (lastComma < 0 && lastDot < 0) continue;

    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) comma++;
      else dot++;
      continue;
    }
    const sep = lastComma >= 0 ? "," : ".";
    const idx = lastComma >= 0 ? lastComma : lastDot;
    const count = (numeric.match(sep === "," ? /,/g : /\./g) ?? []).length;
    const digitsAfter = numeric.length - idx - 1;
    if (count > 1) {
      // gjentatt tegn = tusenskille → det andre er desimaltegn
      if (sep === ",") dot++;
      else comma++;
    } else if (digitsAfter !== 3) {
      if (sep === ",") comma++;
      else dot++;
    }
  }
  return dot > comma ? "." : ",";
}

/** Ser verdien ut som et kontonummer / referansenummer (og ikke tekst)? */
export function looksLikeAccountNumber(s: string): boolean {
  const t = s.replace(/\s/g, "");
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i.test(t)) return true; // IBAN
  return /^[\d.\-]{8,}$/.test(t);
}
