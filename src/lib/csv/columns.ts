// Gjenkjenning av kolonner og bank ut fra overskrifter (og innhold om overskrifter mangler).

import { detectDateOrder, looksLikeDate, parseDate, type DateOrder } from "./dates";
import { detectDecimalSeparator, looksLikeAccountNumber, parseAmount, type DecimalSep } from "./numbers";

export type ColumnRole =
  | "date"
  | "valueDate"
  | "description"
  | "amount"
  | "in"
  | "out"
  | "currency"
  | "balance"
  | "account"
  | "type"
  | "status";

export interface ColumnMapping {
  dateCol: number | null;
  descriptionCols: number[];
  amountCol: number | null;
  inCol: number | null;
  outCol: number | null;
  currencyCol: number | null;
  balanceCol: number | null;
  accountCol: number | null;
  typeCol: number | null;
  statusCol: number | null;
  dateOrder: DateOrder | "auto";
  decimal: DecimalSep | "auto";
}

export const EMPTY_MAPPING: ColumnMapping = {
  dateCol: null,
  descriptionCols: [],
  amountCol: null,
  inCol: null,
  outCol: null,
  currencyCol: null,
  balanceCol: null,
  accountCol: null,
  typeCol: null,
  statusCol: null,
  dateOrder: "auto",
  decimal: "auto",
};

/** Små bokstaver, uten tegnsetting, æøå beholdes. */
export function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^a-z0-9æøå+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EXACT: Record<string, ColumnRole> = {
  // dato
  dato: "date",
  bokforingsdato: "date",
  bokføringsdato: "date",
  "bokført dato": "date",
  "bokfort dato": "date",
  bokført: "date",
  transaksjonsdato: "date",
  posteringsdato: "date",
  regnskapsdato: "date",
  date: "date",
  "booking date": "date",
  "transaction date": "date",
  "posting date": "date",
  accountingdate: "date",
  "accounting date": "date",
  rentedato: "valueDate",
  valuteringsdato: "valueDate",
  valutadato: "valueDate",
  "value date": "valueDate",
  interestdate: "valueDate",
  "interest date": "valueDate",
  // beskrivelse
  beskrivelse: "description",
  forklaring: "description",
  tekst: "description",
  text: "description",
  transaksjonstekst: "description",
  description: "description",
  details: "description",
  melding: "description",
  navn: "description",
  tittel: "description",
  mottaker: "description",
  betalingsmottaker: "description",
  avsender: "description",
  merchant: "description",
  payee: "description",
  narrative: "description",
  // beløp
  beløp: "amount",
  belop: "amount",
  amount: "amount",
  sum: "amount",
  inn: "in",
  "inn på konto": "in",
  "inn pa konto": "in",
  innskudd: "in",
  "beløp inn": "in",
  "belop inn": "in",
  kredit: "in",
  credit: "in",
  deposit: "in",
  "money in": "in",
  ut: "out",
  "ut fra konto": "out",
  "ut av konto": "out",
  uttak: "out",
  "beløp ut": "out",
  "belop ut": "out",
  debet: "out",
  debit: "out",
  withdrawal: "out",
  "money out": "out",
  // valuta, saldo, konto, type, status
  valuta: "currency",
  currency: "currency",
  valutakode: "currency",
  saldo: "balance",
  balance: "balance",
  "løpende saldo": "balance",
  "lopende saldo": "balance",
  kontonummer: "account",
  kontonr: "account",
  "account number": "account",
  accountnumber: "account",
  iban: "account",
  konto: "account",
  account: "account",
  type: "type",
  transaksjonstype: "type",
  betalingstype: "type",
  "transaction type": "type",
  status: "status",
};

/** Hvilken rolle har denne overskriften? */
export function roleOfHeader(header: string): ColumnRole | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  if (EXACT[h]) return EXACT[h];

  if (/saldo|balance/.test(h)) return "balance";
  if (/rentedato|valut(er|a)ingsdato|valutadato|value date|interest ?date/.test(h)) return "valueDate";
  if (/dato|date/.test(h)) return "date";
  if (/^valuta\b|currency/.test(h)) return "currency";
  if (/(bel[øo]p|amount).*\binn\b|\binn\b.*(bel[øo]p|amount)/.test(h)) return "in";
  if (/(bel[øo]p|amount).*\but\b|\but\b.*(bel[øo]p|amount)/.test(h)) return "out";
  if (/bel[øo]p|amount/.test(h)) return "amount";
  if (/^inn\b|innskudd|^credit/.test(h)) return "in";
  if (/^ut\b|uttak|^debet|^debit/.test(h)) return "out";
  if (/beskriv|forklar|tekst|^text|descr|melding|mottaker|avsender|^navn|tittel|payee|detaljer|details/.test(h)) {
    return "description";
  }
  if (/kontonummer|kontonr|account ?n|iban/.test(h)) return "account";
  if (/\btype\b/.test(h)) return "type";
  if (/\bstatus\b/.test(h)) return "status";
  return null;
}

export type BankProfile =
  | "DNB"
  | "SpareBank 1"
  | "Nordea"
  | "Sbanken"
  | "Handelsbanken"
  | "Danske Bank"
  | null;

/**
 * Gjetter bank ut fra overskriftene. Dette er kun en merkelapp for brukeren –
 * selve tolkingen styres av kolonnemappingen, så ukjente/endrede formater fungerer også.
 */
export function identifyBank(headers: string[]): BankProfile {
  const h = new Set(headers.map(normalizeHeader));
  const has = (...names: string[]) => names.every((n) => h.has(n));
  const any = (...names: string[]) => names.some((n) => h.has(n));

  if (has("forklaring") && any("ut fra konto", "inn på konto", "inn pa konto")) return "DNB";
  if (has("beskrivelse", "inn", "ut") && any("til konto", "fra konto")) return "SpareBank 1";
  if (any("bokføringsdato", "bokforingsdato") && any("betalingstype") && any("tittel", "navn")) return "Nordea";
  if (has("avsender", "mottaker", "tittel")) return "Nordea";
  if (has("tekst", "saldo") && any("status", "avstemt") && any("beløp", "belop")) return "Danske Bank";
  if (any("accountingdate", "regnskapsdato") && any("interestdate", "rentedato", "transaksjonstype")) return "Sbanken";
  if (any("bokføringsdato", "bokforingsdato") && any("valutadato") && has("tekst")) return "Handelsbanken";
  return null;
}

export interface Detection {
  mapping: ColumnMapping;
  bank: BankProfile;
  /** true når dato, beløp og beskrivelse er funnet. */
  complete: boolean;
  /** Hva som mangler (for forklaring til brukeren). */
  missing: Array<"dato" | "beløp" | "beskrivelse">;
  /** 0–1: hvor sikker vi er. Lavere når vi har måttet gjette ut fra innhold. */
  confidence: number;
}

function column(rows: string[][], idx: number): string[] {
  return rows.map((r) => r[idx] ?? "");
}

function share(values: string[], pred: (v: string) => boolean): number {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return 0;
  return nonEmpty.filter(pred).length / nonEmpty.length;
}

/** Foreslår kolonnemapping. `rows` er datarader (uten overskrift). */
export function detectMapping(headers: string[], rows: string[][]): Detection {
  const sample = rows.slice(0, 200);
  const mapping: ColumnMapping = { ...EMPTY_MAPPING, descriptionCols: [] };
  const roles = headers.map((h) => roleOfHeader(h));

  const first = (role: ColumnRole) => {
    const i = roles.indexOf(role);
    return i >= 0 ? i : null;
  };

  mapping.dateCol = first("date") ?? first("valueDate");
  mapping.amountCol = first("amount");
  mapping.inCol = first("in");
  mapping.outCol = first("out");
  mapping.currencyCol = first("currency");
  mapping.balanceCol = first("balance");
  mapping.accountCol = first("account");
  mapping.typeCol = first("type");
  mapping.statusCol = first("status");

  // Beskrivelse: alle tekstkolonner, men ikke kolonner som bare inneholder kontonumre.
  roles.forEach((r, i) => {
    if (r !== "description") return;
    const vals = column(sample, i);
    if (share(vals, looksLikeAccountNumber) > 0.8) return;
    mapping.descriptionCols.push(i);
  });
  mapping.descriptionCols = mapping.descriptionCols.slice(0, 3);

  let confidence = 1;

  // --- fyll hull ut fra innhold ---
  const used = new Set<number>(
    [mapping.dateCol, mapping.amountCol, mapping.inCol, mapping.outCol, mapping.balanceCol, mapping.currencyCol].filter(
      (x): x is number => x != null,
    ),
  );
  const width = Math.max(headers.length, ...sample.map((r) => r.length));

  if (mapping.dateCol == null) {
    for (let i = 0; i < width; i++) {
      if (used.has(i)) continue;
      if (share(column(sample, i), looksLikeDate) >= 0.8) {
        mapping.dateCol = i;
        used.add(i);
        confidence = Math.min(confidence, 0.6);
        break;
      }
    }
  }
  if (mapping.amountCol == null && mapping.inCol == null && mapping.outCol == null) {
    let best: { i: number; score: number } | null = null;
    for (let i = 0; i < width; i++) {
      if (used.has(i) || mapping.descriptionCols.includes(i)) continue;
      const vals = column(sample, i);
      const numeric = share(vals, (v) => parseAmount(v) !== null && !looksLikeDate(v));
      if (numeric < 0.8) continue;
      const parsed = vals.map((v) => parseAmount(v)).filter((v): v is number => v !== null);
      const hasNegatives = parsed.some((v) => v < 0);
      const hasDecimals = parsed.some((v) => !Number.isInteger(v));
      const score = numeric + (hasNegatives ? 0.3 : 0) + (hasDecimals ? 0.1 : 0);
      if (!best || score > best.score) best = { i, score };
    }
    if (best) {
      mapping.amountCol = best.i;
      used.add(best.i);
      confidence = Math.min(confidence, 0.6);
    }
  }
  if (mapping.descriptionCols.length === 0) {
    let best: { i: number; len: number } | null = null;
    for (let i = 0; i < width; i++) {
      if (used.has(i)) continue;
      const vals = column(sample, i).filter((v) => v.trim() !== "");
      if (vals.length === 0) continue;
      if (share(vals, (v) => /[a-zæøåA-ZÆØÅ]{3,}/.test(v)) < 0.7) continue;
      if (share(vals, looksLikeAccountNumber) > 0.5) continue;
      const len = vals.reduce((n, v) => n + v.length, 0) / vals.length;
      if (!best || len > best.len) best = { i, len };
    }
    if (best) {
      mapping.descriptionCols = [best.i];
      confidence = Math.min(confidence, 0.6);
    }
  }

  const missing: Detection["missing"] = [];
  if (mapping.dateCol == null) missing.push("dato");
  if (mapping.amountCol == null && mapping.inCol == null && mapping.outCol == null) missing.push("beløp");
  if (mapping.descriptionCols.length === 0) missing.push("beskrivelse");

  return {
    mapping,
    bank: identifyBank(headers),
    complete: missing.length === 0,
    missing,
    confidence: missing.length === 0 ? confidence : Math.min(confidence, 0.3),
  };
}

/** Lett «tørrkjøring» for å vise brukeren hva som ble gjenkjent. */
export function describeFormat(mapping: ColumnMapping, rows: string[][]) {
  const dates = mapping.dateCol != null ? column(rows, mapping.dateCol) : [];
  const amounts = [mapping.amountCol, mapping.inCol, mapping.outCol, mapping.balanceCol]
    .filter((x): x is number => x != null)
    .flatMap((i) => column(rows, i));
  const order = mapping.dateOrder === "auto" ? detectDateOrder(dates) : mapping.dateOrder;
  const decimal = mapping.decimal === "auto" ? detectDecimalSeparator(amounts) : mapping.decimal;
  const sample = dates.find((d) => parseDate(d, order));
  return { dateOrder: order, decimal, sampleDate: sample ? parseDate(sample, order) : null };
}
