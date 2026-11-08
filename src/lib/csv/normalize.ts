// Fra tolkede CSV-rader + kolonnemapping til normaliserte transaksjoner.

import type { ColumnMapping } from "./columns";
import { detectDateOrder, parseDate } from "./dates";
import { detectDecimalSeparator, looksLikeAccountNumber, parseAmount } from "./numbers";
import type { ParsedCsv } from "./parse";

export interface ImportRow {
  /** Linjenummer i originalfila (for feilmeldinger). */
  line: number;
  date: string;
  description: string;
  amount: number;
  currency: string;
  balance: number | null;
  /** Kun siste 4 siffer sendes videre til serveren. */
  accountLast4: string | null;
  bankType: string | null;
  /** Originalrad (overskrift → verdi), lagres uendret. */
  raw: Record<string, string>;
}

export interface ImportIssue {
  line: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface NormalizeResult {
  rows: ImportRow[];
  issues: ImportIssue[];
  /** Rader som ikke kunne brukes. */
  skipped: number;
  dateOrder: string;
  decimal: string;
}

const PENDING_RE = /reservert|reserved|pending|ikke bokført|ikke bokfort/i;

function cell(cells: string[], idx: number | null): string {
  return idx == null ? "" : (cells[idx] ?? "").trim();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

export function normalizeRows(
  parsed: Pick<ParsedCsv, "headers" | "rows">,
  mapping: ColumnMapping,
  opts: { defaultCurrency?: string } = {},
): NormalizeResult {
  const { headers, rows } = parsed;
  const defaultCurrency = opts.defaultCurrency ?? "NOK";
  const issues: ImportIssue[] = [];
  const out: ImportRow[] = [];
  let skipped = 0;

  const colValues = (idx: number | null) => (idx == null ? [] : rows.map((r) => r.cells[idx] ?? ""));

  const dateOrder = mapping.dateOrder === "auto" ? detectDateOrder(colValues(mapping.dateCol)) : mapping.dateOrder;
  const decimal =
    mapping.decimal === "auto"
      ? detectDecimalSeparator([
          ...colValues(mapping.amountCol),
          ...colValues(mapping.inCol),
          ...colValues(mapping.outCol),
          ...colValues(mapping.balanceCol),
        ])
      : mapping.decimal;

  if (mapping.dateCol == null) {
    issues.push({ line: 0, severity: "error", message: "Velg hvilken kolonne som inneholder dato." });
    return { rows: [], issues, skipped: rows.length, dateOrder, decimal };
  }
  if (mapping.amountCol == null && mapping.inCol == null && mapping.outCol == null) {
    issues.push({ line: 0, severity: "error", message: "Velg hvilken kolonne som inneholder beløp." });
    return { rows: [], issues, skipped: rows.length, dateOrder, decimal };
  }
  if (mapping.descriptionCols.length === 0) {
    issues.push({ line: 0, severity: "error", message: "Velg minst én kolonne som inneholder beskrivelse." });
    return { rows: [], issues, skipped: rows.length, dateOrder, decimal };
  }

  for (const { line, cells } of rows) {
    // Reserverte (ikke bokførte) rader hoppes over – de endrer seg når banken bokfører dem.
    const status = cell(cells, mapping.statusCol);
    if (status && PENDING_RE.test(status)) {
      skipped++;
      issues.push({ line, severity: "info", message: "Hoppet over: reservert beløp (ikke bokført ennå)." });
      continue;
    }

    const rawDate = cell(cells, mapping.dateCol);
    const date = parseDate(rawDate, dateOrder);
    if (!date) {
      skipped++;
      issues.push({
        line,
        severity: "error",
        message: rawDate ? `Ugyldig dato «${truncate(rawDate, 30)}».` : "Mangler dato.",
      });
      continue;
    }

    let amount: number | null = null;
    if (mapping.amountCol != null) {
      const raw = cell(cells, mapping.amountCol);
      amount = parseAmount(raw, decimal);
      if (amount === null) {
        // Noen banker bruker separate inn/ut-kolonner i tillegg – prøv dem
        if (mapping.inCol == null && mapping.outCol == null) {
          skipped++;
          issues.push({
            line,
            severity: "error",
            message: raw ? `Ugyldig beløp «${truncate(raw, 30)}».` : "Mangler beløp.",
          });
          continue;
        }
      }
    }
    if (amount === null) {
      const inRaw = cell(cells, mapping.inCol);
      const outRaw = cell(cells, mapping.outCol);
      const inVal = parseAmount(inRaw, decimal);
      const outVal = parseAmount(outRaw, decimal);
      if (inVal === null && outVal === null) {
        skipped++;
        issues.push({ line, severity: "error", message: "Mangler beløp." });
        continue;
      }
      amount = Math.round(((inVal ?? 0) - Math.abs(outVal ?? 0)) * 100) / 100;
    }

    if (amount === 0) {
      skipped++;
      issues.push({ line, severity: "info", message: "Hoppet over: beløp er 0." });
      continue;
    }
    if (Math.abs(amount) >= 1e11) {
      skipped++;
      issues.push({ line, severity: "error", message: "Beløpet er urimelig stort." });
      continue;
    }

    // Beskrivelse: slå sammen unike, ikke-tomme tekstfelt (hopp over rene kontonumre).
    const parts: string[] = [];
    for (const idx of mapping.descriptionCols) {
      const v = cell(cells, idx);
      if (!v || looksLikeAccountNumber(v)) continue;
      if (parts.some((p) => p.toLowerCase() === v.toLowerCase() || p.toLowerCase().includes(v.toLowerCase()))) continue;
      parts.push(v);
    }
    let description = parts.join(" – ").replace(/\s+/g, " ").trim();
    const bankType = cell(cells, mapping.typeCol) || null;
    if (!description) {
      description = bankType ?? "";
      if (!description) {
        skipped++;
        issues.push({ line, severity: "error", message: "Mangler beskrivelse." });
        continue;
      }
      issues.push({ line, severity: "warning", message: "Mangler beskrivelse – bruker transaksjonstype." });
    }
    description = truncate(description, 500);

    const curRaw = cell(cells, mapping.currencyCol).toUpperCase();
    const currency = /^[A-Z]{3}$/.test(curRaw) ? curRaw : defaultCurrency;
    if (currency !== defaultCurrency) {
      issues.push({ line, severity: "warning", message: `Beløpet er oppgitt i ${currency}.` });
    }

    const balanceRaw = cell(cells, mapping.balanceCol);
    const balance = balanceRaw ? parseAmount(balanceRaw, decimal) : null;

    const accountDigits = cell(cells, mapping.accountCol).replace(/\D/g, "");
    const accountLast4 = accountDigits.length >= 4 ? accountDigits.slice(-4) : null;

    const raw: Record<string, string> = {};
    cells.slice(0, 40).forEach((v, i) => {
      const key = truncate(headers[i] || `Kolonne ${i + 1}`, 60);
      raw[raw[key] !== undefined ? `${key} (${i + 1})` : key] = truncate(v, 300);
    });

    out.push({
      line,
      date,
      description,
      amount,
      currency,
      balance: balance !== null && Math.abs(balance) < 1e11 ? balance : null,
      accountLast4,
      bankType: bankType ? truncate(bankType, 80) : null,
      raw,
    });
  }

  return { rows: out, issues, skipped, dateOrder, decimal };
}
