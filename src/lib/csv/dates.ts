// Tolkning av datoer i CSV-filer fra norske (og andre) banker.

import { isValidISO, toISO } from "@/lib/dates";

export type DateOrder = "dmy" | "ymd" | "mdy";

const SEP = String.raw`[./\-\s]`;
const DATE_RE = new RegExp(String.raw`^(\d{1,4})${SEP}(\d{1,2})${SEP}(\d{1,4})(?:$|[T\s,])`);
const COMPACT_RE = /^(\d{8})(?:$|[T\s])/;

interface Parts {
  a: string;
  b: string;
  c: string;
}

function split(input: string): Parts | null {
  const s = input.trim();
  const m = DATE_RE.exec(s);
  if (m) return { a: m[1], b: m[2], c: m[3] };
  const c = COMPACT_RE.exec(s);
  if (c) {
    const d = c[1];
    // yyyymmdd eller ddmmyyyy
    if (/^(19|20)\d{2}/.test(d)) return { a: d.slice(0, 4), b: d.slice(4, 6), c: d.slice(6, 8) };
    return { a: d.slice(0, 2), b: d.slice(2, 4), c: d.slice(4, 8) };
  }
  return null;
}

function fullYear(y: string): number {
  const n = Number(y);
  if (y.length >= 4) return n;
  return n < 70 ? 2000 + n : 1900 + n;
}

/** Tolker datoen med gitt rekkefølge. Returnerer ISO-dato eller null. */
export function parseDate(input: string | null | undefined, order: DateOrder = "dmy"): string | null {
  if (!input) return null;
  const p = split(String(input));
  if (!p) return null;

  let y: number, m: number, d: number;
  if (p.a.length === 4) {
    // yyyy-mm-dd er entydig
    y = Number(p.a);
    m = Number(p.b);
    d = Number(p.c);
  } else if (order === "mdy") {
    m = Number(p.a);
    d = Number(p.b);
    y = fullYear(p.c);
  } else {
    d = Number(p.a);
    m = Number(p.b);
    y = fullYear(p.c);
  }

  if (!(y >= 1990 && y <= 2100)) return null;
  const iso = toISO(y, m, d);
  return isValidISO(iso) ? iso : null;
}

/** Finner datorekkefølge ut fra alle verdiene i kolonnen. Standard er dag-måned-år. */
export function detectDateOrder(values: Array<string | null | undefined>): DateOrder {
  let dmyOnly = 0;
  let mdyOnly = 0;
  for (const v of values) {
    if (!v) continue;
    const p = split(String(v));
    if (!p) continue;
    if (p.a.length === 4) return "ymd";
    const a = Number(p.a);
    const b = Number(p.b);
    if (a > 12 && b <= 12) dmyOnly++;
    if (b > 12 && a <= 12) mdyOnly++;
  }
  if (mdyOnly > dmyOnly) return "mdy";
  return "dmy";
}

/** Ser verdien ut som en dato? */
export function looksLikeDate(v: string): boolean {
  return parseDate(v, "dmy") !== null || parseDate(v, "mdy") !== null;
}
