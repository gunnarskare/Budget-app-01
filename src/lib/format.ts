// Norsk formatering av beløp, prosent og datoer.

const MINUS = "−";

const nf0 = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function currencySuffix(currency: string): string {
  return currency === "NOK" ? "kr" : currency;
}

export interface MoneyOptions {
  currency?: string;
  /** Antall desimaler. Standard 0 (kroner). */
  decimals?: 0 | 2;
  /** Vis +/− foran alle beløp (ellers kun − på negative). */
  signed?: boolean;
  /** Utelat valutasuffiks. */
  bare?: boolean;
}

export function formatMoney(value: number, opts: MoneyOptions = {}): string {
  const { currency = "NOK", decimals = 0, signed = false, bare = false } = opts;
  const rounded = decimals === 0 ? Math.round(value) : Math.round(value * 100) / 100;
  const abs = Math.abs(rounded);
  const body = (decimals === 0 ? nf0 : nf2).format(abs);
  const sign = rounded < 0 ? MINUS : signed && rounded > 0 ? "+" : "";
  return bare ? `${sign}${body}` : `${sign}${body} ${currencySuffix(currency)}`;
}

/** Kompakt tall for akser: 1 200 → «1,2k», 3 400 000 → «3,4M». */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString("nb-NO", { maximumFractionDigits: 1 })}M`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1000)}k`;
  if (abs >= 1_000) return `${sign}${(abs / 1000).toLocaleString("nb-NO", { maximumFractionDigits: 1 })}k`;
  return `${sign}${Math.round(abs)}`;
}

/** 0.183 → «18 %» */
export function formatPercent(ratio: number, digits = 0): string {
  const v = ratio * 100;
  const s = v.toLocaleString("nb-NO", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return `${s} %`;
}

const dateFmt = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateShortFmt = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", timeZone: "UTC" });
const dateLongFmt = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const monthLongFmt = new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric", timeZone: "UTC" });
const monthNameFmt = new Intl.DateTimeFormat("nb-NO", { month: "long", timeZone: "UTC" });
const monthShortFmt = new Intl.DateTimeFormat("nb-NO", { month: "short", timeZone: "UTC" });

function utc(iso: string): Date {
  return new Date(`${iso.length === 7 ? iso + "-01" : iso}T00:00:00Z`);
}

export const formatDate = (iso: string) => dateFmt.format(utc(iso));
export const formatDateShort = (iso: string) => dateShortFmt.format(utc(iso));
export const formatDateLong = (iso: string) => dateLongFmt.format(utc(iso));
/** «2026-11» → «november 2026» */
export const monthLabel = (key: string) => monthLongFmt.format(utc(key));
/** «2026-11» → «november» */
export const monthName = (key: string) => monthNameFmt.format(utc(key));
/** «2026-11» → «nov.» */
export const monthShort = (key: string) => monthShortFmt.format(utc(key)).replace(/\.$/, "");

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «1 transaksjon» / «3 transaksjoner» */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("nb-NO")} ${n === 1 ? one : many}`;
}

/** Runder til nærmeste «pene» beløp (50 under 1 000, 100 under 20 000, ellers 500). */
export function roundNice(value: number): number {
  const step = value < 1_000 ? 50 : value < 20_000 ? 100 : 500;
  return Math.round(value / step) * step;
}
