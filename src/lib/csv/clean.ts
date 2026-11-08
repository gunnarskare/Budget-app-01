// Rensing av bankbeskrivelser til lesbare navn og stabile «merchant keys».
// Originalbeskrivelsen røres aldri – dette er kun for visning, læring og matching.

const BANK_PREFIXES = [
  "varekjøp",
  "varekjop",
  "kortkjøp",
  "kortkjop",
  "kjøp",
  "kjop",
  "visa",
  "mastercard",
  "debit",
  "betalt",
  "betaling",
  "avtalegiro",
  "e-faktura",
  "efaktura",
  "nettgiro til",
  "nettgiro",
  "nettbetaling",
  "giro",
  "reservasjon",
  "kontantuttak",
  "minibank",
  "ocr",
  "kid",
  "vipps\\*",
  "vipps",
];
const PREFIX_RE = new RegExp(`^(?:${BANK_PREFIXES.join("|")})(?:[\\s:*\\-]+|$)`, "i");

const NOISE: RegExp[] = [
  /\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/g, // datoer 12.10 / 12.10.2026
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g, // klokkeslett
  /\*{2,}\s*\d*/g, // kortmaske ****1234
  /\b\d{4}\s*\*{2,}\s*\d{2,4}\b/g, // 1234 **** 5678
  /\*\d{3,4}\b/g, // *1234
  /\bx{4}\d{4}\b/gi,
  /\b(?:nok|eur|usd|sek|dkk|gbp|chf)\s*[\d.,]+\b/gi, // «NOK 120,00»
  /\b[\d.,]+\s*(?:nok|eur|usd|sek|dkk|gbp|chf)\b/gi,
  /\bvalutakurs\b.*$/gi,
  /\bkurs[:\s]+[\d.,]+/gi,
  /\b(?:ref|referanse|id|trans|txn|nr|kid|ocr)[.:\s#-]*[a-z0-9-]{4,}\b/gi,
  /\b\d{5,}\b/g, // lange tallrekker (KID, referanser, kontonumre)
  /\b(?:dato|tid)\b/gi,
];

const UPPER_ACRONYMS = new Set(["as", "asa", "ab", "ltd", "ikea", "nrk", "nav", "sas", "kfc", "dnb", "sats", "evo", "uno-x", "yx"]);

export interface CleanedDescription {
  /** Pent visningsnavn, f.eks. «Rema 1000 Grønland». */
  display: string;
  /** Små bokstaver, uten støy – brukes til matching. */
  normalized: string;
  /** Stabil nøkkel (to første ord) for læring/historikk. */
  key: string;
}

function titleCase(s: string): string {
  const letters = s.replace(/[^A-Za-zÆØÅæøå]/g, "");
  if (!letters) return s;
  const upper = letters.replace(/[^A-ZÆØÅ]/g, "").length;
  const mostlyUpper = upper / letters.length >= 0.7;
  const mostlyLower = upper / letters.length <= 0.05;
  if (!mostlyUpper && !mostlyLower) return s; // blandet – la stå
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => {
      if (!w) return w;
      if (UPPER_ACRONYMS.has(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export function cleanDescription(raw: string): CleanedDescription {
  let s = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  const original = s;

  // Fjern bankprefikser (kan stå flere på rad: «Visa varekjøp ...»)
  for (let i = 0; i < 3; i++) {
    const next = s.replace(PREFIX_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  // Fire siffer rett etter prefikset er som regel kortets siste sifre («Visa varekjøp 4567 Rema 1000»)
  s = s.replace(/^\d{4}\s+(?=\D)/, "");
  for (const re of NOISE) s = s.replace(re, " ");

  s = s
    .replace(/[^\p{L}\p{N}&'’+\-.@ ]/gu, " ") // behold bokstaver/tall og noen tegn
    .replace(/(^|\s)[-.]+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) s = original.replace(/\s+/g, " ").trim();
  s = s.slice(0, 120);

  const normalized = s.toLowerCase();
  const tokens = normalized.split(" ").filter((t) => t.length > 0);
  const key = (tokens.slice(0, 2).join(" ") || normalized).slice(0, 120);

  return { display: titleCase(s), normalized, key };
}

/** Normaliserer en tekst til sammenligning (små bokstaver, kollapset mellomrom). */
export function normalizeText(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Ser dette ut som en overføring til/fra en privatperson (Vipps, giro)? */
export function looksLikePersonalTransfer(raw: string): boolean {
  return /^\s*(vipps(?!\*)|overføring|overforing|nettgiro|betaling fra|innbetaling fra|fra\b|til\b)/i.test(raw);
}
