// Lesing av CSV-filer: tegnsett, skilletegn, overskriftsrad.

import Papa from "papaparse";
import { roleOfHeader } from "./columns";
import { looksLikeDate } from "./dates";
import { parseAmount } from "./numbers";

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS = 5000;
export const ALLOWED_EXTENSIONS = [".csv", ".txt", ".tsv"];

export class ImportError extends Error {
  constructor(
    public code: "too_large" | "bad_type" | "empty" | "too_many_rows" | "binary" | "no_table",
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export interface ParsedCsv {
  encoding: "utf-8" | "windows-1252";
  delimiter: string;
  /** Finnes det en overskriftsrad i fila? */
  hasHeader: boolean;
  headers: string[];
  /** Datarader, med linjenummer (1-basert) i originalfila. */
  rows: Array<{ line: number; cells: string[] }>;
  /** Antall linjer før overskriften (metadata). */
  preambleLines: number;
}

/** Validerer filnavn/størrelse før noe leses. */
export function validateFileMeta(name: string, size: number): void {
  const lower = name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new ImportError("bad_type", "Filen må være en CSV-fil (.csv, .tsv eller .txt).");
  }
  if (size === 0) throw new ImportError("empty", "Filen er tom.");
  if (size > MAX_FILE_BYTES) {
    throw new ImportError("too_large", `Filen er for stor (maks ${MAX_FILE_BYTES / 1024 / 1024} MB).`);
  }
}

/** Dekoder bytes: UTF-8 først (med BOM-håndtering), ellers Windows-1252 (vanlig i norske banker). */
export function decodeBytes(buf: ArrayBuffer): { text: string; encoding: ParsedCsv["encoding"] } {
  const bytes = new Uint8Array(buf);
  // Binærfiler (Excel/zip/pdf) har ofte NUL-bytes
  const probe = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (probe.includes(0)) {
    throw new ImportError("binary", "Dette ser ikke ut som en tekstfil. Eksporter som CSV, ikke Excel.");
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ""), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

const DELIMITERS = [";", ",", "\t", "|"] as const;

/** Velger skilletegnet som gir mest konsistent antall felt per rad. */
export function detectDelimiter(text: string): string {
  let best: { d: string; score: number } = { d: ";", score: -1 };
  for (const d of DELIMITERS) {
    const res = Papa.parse<string[]>(text, { delimiter: d, preview: 40, skipEmptyLines: true });
    const counts = res.data.map((r) => r.length).filter((n) => n > 0);
    if (counts.length === 0) continue;
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    let modal = 0;
    let modalN = 0;
    for (const [c, n] of freq) {
      if (n > modalN || (n === modalN && c > modal)) {
        modal = c;
        modalN = n;
      }
    }
    if (modal < 2) continue;
    const consistency = modalN / counts.length;
    const score = consistency * 100 + Math.min(modal, 20) / 10;
    if (score > best.score) best = { d, score };
  }
  return best.d;
}

function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => c.trim() === "");
}

/** Ser raden ut som en overskriftsrad? (gjenkjente roller, ingen tall/datoer) */
function headerScore(cells: string[]): number {
  const trimmed = cells.map((c) => c.trim());
  if (trimmed.filter(Boolean).length < 2) return 0;
  if (trimmed.some((c) => c && (looksLikeDate(c) || (/^[-+]?\d[\d\s.,]*$/.test(c) && parseAmount(c) !== null)))) return 0;
  const roles = new Set(trimmed.map((c) => roleOfHeader(c)).filter(Boolean));
  return roles.size;
}

export function parseCsvText(text: string, encoding: ParsedCsv["encoding"] = "utf-8"): ParsedCsv {
  const delimiter = detectDelimiter(text);
  const res = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: false });
  const all = res.data.map((r) => r.map((c) => (c ?? "").trim()));

  if (all.filter((r) => !isBlankRow(r)).length < 1) {
    throw new ImportError("empty", "Fant ingen rader i filen.");
  }

  // Finn overskriftsrad blant de første 25 radene.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(all.length, 25); i++) {
    if (headerScore(all[i]) >= 2) {
      headerIdx = i;
      break;
    }
  }

  let hasHeader = true;
  let headers: string[];
  let startIdx: number;

  if (headerIdx >= 0) {
    headers = all[headerIdx];
    startIdx = headerIdx + 1;
  } else {
    // Ingen gjenkjent overskrift. Ser første ikke-tomme rad ut som data?
    const firstIdx = all.findIndex((r) => !isBlankRow(r));
    const first = all[firstIdx];
    const looksLikeData = first.some((c) => looksLikeDate(c)) && first.some((c) => parseAmount(c) !== null);
    if (looksLikeData) {
      hasHeader = false;
      headers = first.map((_, i) => `Kolonne ${i + 1}`);
      startIdx = firstIdx;
    } else {
      headers = first.map((c, i) => c || `Kolonne ${i + 1}`);
      startIdx = firstIdx + 1;
    }
    headerIdx = firstIdx;
  }

  const width = headers.length;
  const rows: ParsedCsv["rows"] = [];
  for (let i = startIdx; i < all.length; i++) {
    const cells = all[i];
    if (isBlankRow(cells)) continue;
    // Sammendragslinjer («Sum;12345») har bare ett utfylt felt
    if (cells.filter((c) => c !== "").length < 2 && width > 2) continue;
    rows.push({ line: i + 1, cells });
  }

  if (rows.length === 0) throw new ImportError("empty", "Fant ingen transaksjoner i filen.");
  if (rows.length > MAX_ROWS) {
    throw new ImportError(
      "too_many_rows",
      `Filen har ${rows.length.toLocaleString("nb-NO")} rader. Maks ${MAX_ROWS.toLocaleString("nb-NO")} per import – del opp filen i perioder.`,
    );
  }

  return { encoding, delimiter, hasHeader, headers, rows, preambleLines: Math.max(0, headerIdx) };
}

/** Leser en hel fil (bytes) til tolket CSV. */
export function parseCsvBuffer(buf: ArrayBuffer): ParsedCsv {
  const { text, encoding } = decodeBytes(buf);
  return parseCsvText(text, encoding);
}
