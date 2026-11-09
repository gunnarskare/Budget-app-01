// Forslagsrader i budsjettbyggeren: hva man typisk må huske å regne med.
//
// Dette er sjekklister, ikke fasitsvar: ingen rader har ferdige beløp. Beløpene kommer fra
// brukeren (fakturaer, avtaler, erfaring) – vi hjelper bare med å huske hva som hører med
// og å regne om til riktig frekvens.

import type { Frequency, PlanKind, PlanNature } from "@/lib/types";

export interface PlanPrompt {
  /** Stabil nøkkel – lagres som `slot` på posten. Må ikke endres. */
  slot: string;
  kind: PlanKind;
  nature: PlanNature;
  label: string;
  /** Systemnøkkel for kategorien (se DEFAULT_TAXONOMY), f.eks. «bolig». */
  categoryKey: string;
  /** Del av underkategoriens systemnøkkel, f.eks. «husleie» → «bolig.husleie». Utelatt = hele kategorien. */
  subKey?: string;
  /** Frekvens regningen/avtalen vanligvis kommer med. */
  frequency: Frequency;
  hint?: string;
}

const prompt = (p: PlanPrompt): PlanPrompt => p;

export const INCOME_PROMPTS: PlanPrompt[] = [
  prompt({
    slot: "inntekter.lonn",
    kind: "income",
    nature: "fixed",
    label: "Lønn etter skatt",
    categoryKey: "inntekter",
    subKey: "lonn",
    frequency: "monthly",
    hint: "Det som faktisk kommer inn på kontoen. Varierer lønnen gjennom året (juni og desember)? Bruk et gjennomsnitt.",
  }),
  prompt({
    slot: "inntekter.stotte",
    kind: "income",
    nature: "fixed",
    label: "Barnetrygd, stønader og ytelser",
    categoryKey: "inntekter",
    subKey: "stotte",
    frequency: "monthly",
    hint: "For eksempel barnetrygd, bostøtte, dagpenger, uføretrygd eller pensjon.",
  }),
  prompt({
    slot: "inntekter.ekstrainntekt",
    kind: "income",
    nature: "fixed",
    label: "Ekstrainntekt",
    categoryKey: "inntekter",
    subKey: "ekstrainntekt",
    frequency: "monthly",
    hint: "Bijobb, honorarer eller andre inntekter du kan regne med.",
  }),
  prompt({
    slot: "inntekter.utleie",
    kind: "income",
    nature: "fixed",
    label: "Utleie",
    categoryKey: "inntekter",
    subKey: "utleie",
    frequency: "monthly",
  }),
];

export const FIXED_PROMPTS: PlanPrompt[] = [
  // Bolig
  prompt({ slot: "bolig.husleie", kind: "expense", nature: "fixed", label: "Husleie", categoryKey: "bolig", subKey: "husleie", frequency: "monthly" }),
  prompt({ slot: "bolig.boliglan", kind: "expense", nature: "fixed", label: "Boliglån (renter og avdrag)", categoryKey: "bolig", subKey: "boliglan", frequency: "monthly" }),
  prompt({ slot: "bolig.felleskostnader", kind: "expense", nature: "fixed", label: "Felleskostnader", categoryKey: "bolig", subKey: "felleskostnader", frequency: "monthly" }),
  prompt({
    slot: "bolig.strom",
    kind: "expense",
    nature: "fixed",
    label: "Strøm og nettleie",
    categoryKey: "bolig",
    subKey: "strom",
    frequency: "monthly",
    hint: "Strømregningen varierer med årstiden – bruk et gjennomsnitt over året.",
  }),
  prompt({ slot: "bolig.internett", kind: "expense", nature: "fixed", label: "Internett og TV", categoryKey: "bolig", subKey: "internett", frequency: "monthly" }),
  prompt({
    slot: "bolig.kommunale-avgifter",
    kind: "expense",
    nature: "fixed",
    label: "Kommunale avgifter",
    categoryKey: "bolig",
    subKey: "kommunale-avgifter",
    frequency: "quarterly",
    hint: "Se på fakturaen hvor ofte den kommer, og velg frekvens etter det.",
  }),
  prompt({
    slot: "bolig.forsikring",
    kind: "expense",
    nature: "fixed",
    label: "Innbo- og husforsikring",
    categoryKey: "bolig",
    subKey: "forsikring",
    frequency: "yearly",
    hint: "Betaler du årlig? Legg inn årsbeløpet, så regner vi det om til måned.",
  }),
  // Transport
  prompt({ slot: "transport.billan", kind: "expense", nature: "fixed", label: "Billån eller leasing", categoryKey: "transport", subKey: "billan", frequency: "monthly" }),
  prompt({ slot: "transport.bilforsikring", kind: "expense", nature: "fixed", label: "Bilforsikring", categoryKey: "transport", subKey: "bilforsikring", frequency: "yearly" }),
  prompt({ slot: "transport.kollektivtransport", kind: "expense", nature: "fixed", label: "Månedskort kollektiv", categoryKey: "transport", subKey: "kollektivtransport", frequency: "monthly" }),
  // Familie
  prompt({ slot: "familie.barnehage", kind: "expense", nature: "fixed", label: "Barnehage og SFO", categoryKey: "familie", subKey: "barnehage", frequency: "monthly" }),
  // Abonnementer
  prompt({ slot: "abonnementer.mobil", kind: "expense", nature: "fixed", label: "Mobilabonnement", categoryKey: "abonnementer", subKey: "mobil", frequency: "monthly" }),
  prompt({
    slot: "abonnementer.streaming",
    kind: "expense",
    nature: "fixed",
    label: "Streaming og apper",
    categoryKey: "abonnementer",
    subKey: "streaming",
    frequency: "monthly",
    hint: "Netflix, Spotify, HBO og andre tjenester du betaler for.",
  }),
  prompt({
    slot: "abonnementer.medlemskap",
    kind: "expense",
    nature: "fixed",
    label: "Medlemskap og treningssenter",
    categoryKey: "abonnementer",
    subKey: "medlemskap",
    frequency: "monthly",
    hint: "Treningssenter, fagforening og foreninger.",
  }),
  // Lån
  prompt({
    slot: "okonomi.gjeldsnedbetaling",
    kind: "expense",
    nature: "fixed",
    label: "Andre lån og kreditt",
    categoryKey: "okonomi",
    subKey: "gjeldsnedbetaling",
    frequency: "monthly",
    hint: "Studielån, forbrukslån og kredittkort du betaler ned.",
  }),
];

/** Variable utgifter planlegges som en ramme per kategori. */
export const VARIABLE_PROMPTS: PlanPrompt[] = [
  prompt({
    slot: "var.dagligvarer",
    kind: "expense",
    nature: "variable",
    label: "Mat og dagligvarer",
    categoryKey: "dagligvarer",
    frequency: "monthly",
    hint: "Tenker du ukentlig? Velg «per uke» – vi regner om til måned.",
  }),
  prompt({ slot: "var.transport", kind: "expense", nature: "variable", label: "Drivstoff, parkering, bom og taxi", categoryKey: "transport", frequency: "monthly" }),
  prompt({ slot: "var.restaurant", kind: "expense", nature: "variable", label: "Restaurant, kafé og takeaway", categoryKey: "restaurant", frequency: "monthly" }),
  prompt({ slot: "var.shopping", kind: "expense", nature: "variable", label: "Klær, elektronikk og annen shopping", categoryKey: "shopping", frequency: "monthly" }),
  prompt({ slot: "var.fritid", kind: "expense", nature: "variable", label: "Fritid, reiser og opplevelser", categoryKey: "fritid", frequency: "monthly", hint: "Ferie kan du legge inn som årsbeløp – «per år» regnes om til måned." }),
  prompt({ slot: "var.helse", kind: "expense", nature: "variable", label: "Helse: lege, tannlege og medisiner", categoryKey: "helse", frequency: "monthly" }),
  prompt({ slot: "var.familie", kind: "expense", nature: "variable", label: "Barn og familie (utenom barnehage)", categoryKey: "familie", frequency: "monthly" }),
  prompt({
    slot: "var.diverse",
    kind: "expense",
    nature: "variable",
    label: "Gaver og uforutsett",
    categoryKey: "diverse",
    frequency: "monthly",
    hint: "Sett gjerne av litt til det uventede – det gjør budsjettet mer robust.",
  }),
];

export const SAVING_PROMPTS: PlanPrompt[] = [
  prompt({
    slot: "okonomi.sparing",
    kind: "saving",
    nature: "fixed",
    label: "Sparing og buffer",
    categoryKey: "okonomi",
    subKey: "sparing",
    frequency: "monthly",
    hint: "Nødfond, sparekonto eller BSU.",
  }),
  prompt({ slot: "okonomi.investeringer", kind: "saving", nature: "fixed", label: "Fond og investering", categoryKey: "okonomi", subKey: "investeringer", frequency: "monthly" }),
];

export const ALL_PROMPTS: PlanPrompt[] = [...INCOME_PROMPTS, ...FIXED_PROMPTS, ...VARIABLE_PROMPTS, ...SAVING_PROMPTS];

export const PROMPT_BY_SLOT: ReadonlyMap<string, PlanPrompt> = new Map(ALL_PROMPTS.map((p) => [p.slot, p]));

/** Slot for sparelinjen som «sett av resten»-knappen fyller. */
export const MAIN_SAVING_SLOT = "okonomi.sparing";
