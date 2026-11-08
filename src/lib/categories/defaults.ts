// Standard kategorisystem for norske husholdninger.
// `key` er stabil og brukes av butikkregister/nøkkelord – navn og farger kan brukeren endre fritt.
//
// Farger: de åtte første er den validerte kategoripaletten (se docs/03-designsystem.md);
// «Fritid» og «Økonomi» har egne dempede toner, «Diverse» er nøytral grå.

export interface SubcategoryDef {
  key: string;
  name: string;
  /** Sparing/investering – regnes som sparing, ikke forbruk. */
  saving?: boolean;
}

export interface CategoryDef {
  key: string;
  name: string;
  icon: string;
  color: string;
  kind: "expense" | "income";
  subs: SubcategoryDef[];
}

export const DEFAULT_TAXONOMY: CategoryDef[] = [
  {
    key: "bolig",
    name: "Bolig",
    icon: "house",
    color: "#2a78d6",
    kind: "expense",
    subs: [
      { key: "husleie", name: "Husleie" },
      { key: "boliglan", name: "Boliglån" },
      { key: "felleskostnader", name: "Felleskostnader" },
      { key: "strom", name: "Strøm" },
      { key: "internett", name: "Internett" },
      { key: "kommunale-avgifter", name: "Kommunale avgifter" },
      { key: "vedlikehold", name: "Vedlikehold" },
      { key: "forsikring", name: "Forsikring" },
    ],
  },
  {
    key: "dagligvarer",
    name: "Dagligvarer",
    icon: "shopping-basket",
    color: "#1baf7a",
    kind: "expense",
    subs: [
      { key: "matbutikk", name: "Matbutikk" },
      { key: "husholdningsartikler", name: "Husholdningsartikler" },
      { key: "apotek", name: "Apotek" },
      { key: "hygiene", name: "Hygiene" },
      { key: "hjemmeartikler", name: "Hjemmeartikler" },
    ],
  },
  {
    key: "transport",
    name: "Transport",
    icon: "car",
    color: "#eb6834",
    kind: "expense",
    subs: [
      { key: "drivstoff", name: "Drivstoff" },
      { key: "bilforsikring", name: "Bilforsikring" },
      { key: "billan", name: "Billån" },
      { key: "vedlikehold", name: "Vedlikehold" },
      { key: "parkering", name: "Parkering" },
      { key: "bom", name: "Bom" },
      { key: "kollektivtransport", name: "Kollektivtransport" },
      { key: "taxi", name: "Taxi" },
    ],
  },
  {
    key: "restaurant",
    name: "Restaurant og kafé",
    icon: "utensils",
    color: "#e87ba4",
    kind: "expense",
    subs: [
      { key: "restaurant", name: "Restaurant" },
      { key: "takeaway", name: "Takeaway" },
      { key: "kafe", name: "Kafé" },
      { key: "fastfood", name: "Fastfood" },
      { key: "leveringstjenester", name: "Leveringstjenester" },
    ],
  },
  {
    key: "shopping",
    name: "Shopping",
    icon: "shopping-bag",
    color: "#6250d6",
    kind: "expense",
    subs: [
      { key: "klaer", name: "Klær" },
      { key: "elektronikk", name: "Elektronikk" },
      { key: "mobler", name: "Møbler" },
      { key: "interior", name: "Interiør" },
      { key: "hobby", name: "Hobby" },
      { key: "diverse", name: "Diverse" },
    ],
  },
  {
    key: "abonnementer",
    name: "Abonnementer",
    icon: "repeat",
    color: "#eda100",
    kind: "expense",
    subs: [
      { key: "streaming", name: "Streaming" },
      { key: "programvare", name: "Programvare" },
      { key: "mobil", name: "Mobil" },
      { key: "medlemskap", name: "Medlemskap" },
      { key: "andre", name: "Andre abonnementer" },
    ],
  },
  {
    key: "familie",
    name: "Familie og barn",
    icon: "baby",
    color: "#e34948",
    kind: "expense",
    subs: [
      { key: "barneutstyr", name: "Barneutstyr" },
      { key: "klaer", name: "Klær" },
      { key: "barnehage", name: "Barnehage" },
      { key: "aktiviteter", name: "Aktiviteter" },
      { key: "leker", name: "Leker" },
      { key: "andre", name: "Andre barneutgifter" },
    ],
  },
  {
    key: "helse",
    name: "Helse",
    icon: "heart-pulse",
    color: "#008300",
    kind: "expense",
    subs: [
      { key: "lege", name: "Lege" },
      { key: "tannlege", name: "Tannlege" },
      { key: "medisiner", name: "Medisiner" },
      { key: "trening", name: "Trening" },
      { key: "helseprodukter", name: "Helseprodukter" },
    ],
  },
  {
    key: "fritid",
    name: "Fritid og underholdning",
    icon: "ticket",
    color: "#0e8fa8",
    kind: "expense",
    subs: [
      { key: "spill", name: "Spill" },
      { key: "kino", name: "Kino" },
      { key: "reiser", name: "Reiser" },
      { key: "aktiviteter", name: "Aktiviteter" },
      { key: "hobbyer", name: "Hobbyer" },
    ],
  },
  {
    key: "okonomi",
    name: "Økonomi",
    icon: "landmark",
    color: "#5f6b85",
    kind: "expense",
    subs: [
      { key: "sparing", name: "Sparing", saving: true },
      { key: "investeringer", name: "Investeringer", saving: true },
      { key: "renter", name: "Renter" },
      { key: "gebyrer", name: "Gebyrer" },
      { key: "avdrag", name: "Avdrag" },
      { key: "gjeldsnedbetaling", name: "Gjeldsnedbetaling" },
    ],
  },
  {
    key: "inntekter",
    name: "Inntekter",
    icon: "wallet",
    color: "#2f9e6b",
    kind: "income",
    subs: [
      { key: "lonn", name: "Lønn" },
      { key: "ekstrainntekt", name: "Ekstrainntekt" },
      { key: "stotte", name: "Støtte og ytelser" },
      { key: "utleie", name: "Utleieinntekter" },
      { key: "refusjoner", name: "Refusjoner" },
      { key: "andre", name: "Andre inntekter" },
    ],
  },
  {
    key: "diverse",
    name: "Diverse",
    icon: "package",
    color: "#898781",
    kind: "expense",
    subs: [
      { key: "gaver", name: "Gaver" },
      { key: "donasjoner", name: "Donasjoner" },
      { key: "ukategorisert", name: "Ukategorisert" },
    ],
  },
];

/** Systemnøkkel for en underkategori: «transport.drivstoff». */
export const subKey = (categoryKey: string, subKeyPart: string) => `${categoryKey}.${subKeyPart}`;

/** Fallback når ingenting passer. */
export const UNCATEGORIZED_EXPENSE = "diverse.ukategorisert";
export const UNCATEGORIZED_INCOME = "inntekter.andre";

/** Fargevalg i kategoriredigering (validerte kategorifarger + dempede toner). */
export const COLOR_CHOICES = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#6250d6",
  "#e34948",
  "#0e8fa8",
  "#5f6b85",
  "#898781",
  "#2f9e6b",
] as const;
