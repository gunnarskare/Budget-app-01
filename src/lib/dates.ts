// Datohjelpere. Alle datoer er ISO-strenger («YYYY-MM-DD») og månedsnøkler
// er «YYYY-MM». Vi bruker UTC-aritmetikk internt for å slippe tidssone-feil.

export const APP_TIMEZONE = "Europe/Oslo";

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isValidISO(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidMonthKey(s: string): boolean {
  const m = MONTH_RE.exec(s);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

export function toISO(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function fromISO(iso: string): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Ugyldig dato: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function dateToISO(d: Date): string {
  return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Dagens dato i norsk tidssone. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToISO(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86_400_000);
}

export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(key: string): string {
  return `${key}-01`;
}

export function daysInMonth(key: string): number {
  const m = MONTH_RE.exec(key);
  if (!m) throw new Error(`Ugyldig måned: ${key}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
}

export function monthEnd(key: string): string {
  return `${key}-${String(daysInMonth(key)).padStart(2, "0")}`;
}

export function addMonths(key: string, n: number): string {
  const m = MONTH_RE.exec(key);
  if (!m) throw new Error(`Ugyldig måned: ${key}`);
  const idx = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Alle månedsnøkler fra og med `from` til og med `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
  return out;
}

/** De siste n månedene til og med `endKey`, eldst først. */
export function lastMonths(endKey: string, n: number): string[] {
  return monthsBetween(addMonths(endKey, -(n - 1)), endKey);
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Mandag i uken datoen tilhører. */
export function weekStart(iso: string): string {
  const d = fromISO(iso);
  const dow = (d.getUTCDay() + 6) % 7; // man=0 … søn=6
  d.setUTCDate(d.getUTCDate() - dow);
  return dateToISO(d);
}

export function weekEnd(startIso: string): string {
  return addDays(startIso, 6);
}

/** ISO-ukenummer. */
export function isoWeekNumber(iso: string): number {
  const d = fromISO(iso);
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d.getTime() - firstThursday.getTime()) / 86_400_000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export function clampDay(key: string, day: number): string {
  return `${key}-${String(Math.min(Math.max(1, day), daysInMonth(key))).padStart(2, "0")}`;
}
