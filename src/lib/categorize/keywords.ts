// Nøkkelordregler (steg 4 i kategoriseringen). Svakere enn butikkregisteret.
// `stems` matches som ord-prefiks i renset, liten-bokstav-beskrivelse.

export interface KeywordRule {
  stems: string[];
  category: string;
  confidence: number;
  direction?: "in" | "out";
  subscription?: boolean;
  /** Intern overføring mellom egne kontoer (sikker nok til å bekrefte automatisk). */
  transfer?: boolean;
  label: string;
}

const k = (
  label: string,
  stems: string[],
  category: string,
  confidence: number,
  extra: Partial<Omit<KeywordRule, "label" | "stems" | "category" | "confidence">> = {},
): KeywordRule => ({ label, stems, category, confidence, ...extra });

export const KEYWORD_RULES: KeywordRule[] = [
  // Interne overføringer – eksplisitte formuleringer
  k("intern overføring", ["mellom egne", "egen konto", "egne kontoer", "intern overføring", "intern overforing", "overføring egen", "overforing egen"], "", 0.92, { transfer: true }),

  // Inntekter
  k("lønn", ["lønn", "lonn", "salary", "lønnsutbetaling", "payroll"], "inntekter.lonn", 0.93, { direction: "in" }),
  k("ytelse", ["barnetrygd", "kontantstøtte", "kontantstotte", "dagpenger", "sykepenger", "foreldrepenger", "bostøtte", "bostotte", "stipend", "uføre", "ufore", "pensjon"], "inntekter.stotte", 0.88, { direction: "in" }),
  k("utleie", ["utleie", "husleie inn", "leieinntekt"], "inntekter.utleie", 0.8, { direction: "in" }),
  k("refusjon", ["refusjon", "refundert", "tilbakebetaling", "tilbakebetalt"], "inntekter.refusjoner", 0.62, { direction: "in" }),
  k("renter inn", ["rente", "renter", "innskuddsrente"], "inntekter.andre", 0.7, { direction: "in" }),

  // Bolig
  k("husleie", ["husleie", "leie bolig"], "bolig.husleie", 0.9, { direction: "out" }),
  k("boliglån", ["boliglån", "boliglan", "terminbeløp", "terminbelop", "husbanken"], "bolig.boliglan", 0.8, { direction: "out" }),
  k("felleskostnader", ["felleskostnad", "fellesutgift", "fellesgjeld"], "bolig.felleskostnader", 0.85, { direction: "out" }),
  k("strøm", ["strøm", "strom", "kraft", "nettleie"], "bolig.strom", 0.82, { direction: "out" }),
  k("internett", ["internett", "bredbånd", "bredband", "fiber"], "bolig.internett", 0.75, { direction: "out" }),
  k("kommunale avgifter", ["kommunale", "renovasjon", "eiendomsskatt"], "bolig.kommunale-avgifter", 0.8, { direction: "out" }),
  k("forsikring bil", ["bilforsikring", "forsikring bil", "kasko", "ansvarsforsikring"], "transport.bilforsikring", 0.82, { direction: "out" }),
  k("forsikring", ["forsikring"], "bolig.forsikring", 0.62, { direction: "out" }),

  // Transport
  k("drivstoff", ["bensin", "diesel", "drivstoff", "ladestasjon", "lading"], "transport.drivstoff", 0.78, { direction: "out" }),
  k("parkering", ["parkering", "parking", "p-hus", "p-plass"], "transport.parkering", 0.85, { direction: "out" }),
  k("bom", ["bompeng", "bomstasjon"], "transport.bom", 0.85, { direction: "out" }),
  k("billån", ["billån", "bilan", "billan", "bilfinans"], "transport.billan", 0.8, { direction: "out" }),
  k("kollektiv", ["månedskort", "manedskort", "reisekort", "enkeltbillett", "periodekort"], "transport.kollektivtransport", 0.8, { direction: "out" }),
  k("taxi", ["taxi", "drosje"], "transport.taxi", 0.82, { direction: "out" }),

  // Mat og restaurant
  k("apotek", ["apotek", "pharmacy"], "dagligvarer.apotek", 0.85, { direction: "out" }),
  k("dagligvare", ["dagligvare", "matbutikk", "supermarked", "kolonial"], "dagligvarer.matbutikk", 0.75, { direction: "out" }),
  k("bakeri", ["bakeri", "bakery", "konditori"], "restaurant.kafe", 0.7, { direction: "out" }),
  k("kafé", ["kafe", "kafé", "cafe", "coffee", "kaffe", "espresso"], "restaurant.kafe", 0.72, { direction: "out" }),
  k("restaurant", ["restaurant", "bistro", "bar &", "pub", "grill", "steakhouse", "sushi", "ramen", "thai", "indian", "pizzeria", "kebab"], "restaurant.restaurant", 0.72, { direction: "out" }),
  k("takeaway", ["takeaway", "take away", "pizza"], "restaurant.takeaway", 0.72, { direction: "out" }),

  // Familie, helse, fritid
  k("barnehage", ["barnehage", "bhg", "sfo", "skolefritid"], "familie.barnehage", 0.88, { direction: "out" }),
  k("helse", ["lege", "tannlege", "fysio", "psykolog", "optiker", "synsam", "brilleland"], "helse.lege", 0.75, { direction: "out" }),
  k("trening", ["trening", "gym", "fitness", "yoga", "svømme"], "helse.trening", 0.75, { direction: "out" }),
  k("kino", ["kino", "cinema", "teater", "konsert", "museum"], "fritid.aktiviteter", 0.72, { direction: "out" }),
  k("reise", ["flybillett", "hotel", "hotell", "ferie", "reisebyrå", "reisebyra", "overnatting"], "fritid.reiser", 0.72, { direction: "out" }),
  k("gave", ["gave", "gift", "bursdag"], "diverse.gaver", 0.6, { direction: "out" }),
  k("donasjon", ["donasjon", "gave til", "røde kors", "rode kors", "redd barna", "unicef", "kreftforeningen", "amnesty"], "diverse.donasjoner", 0.8, { direction: "out" }),
  k("abonnement", ["abonnement", "subscription", "månedlig", "medlemskap", "kontingent"], "abonnementer.andre", 0.7, { direction: "out", subscription: true }),

  // Økonomi
  k("sparing", ["sparing", "sparekonto", "bsu", "sparebeløp", "sparekonto"], "okonomi.sparing", 0.85, { direction: "out" }),
  k("investering", ["fond", "aksje", "verdipapir", "kryptovaluta", "bitcoin"], "okonomi.investeringer", 0.8, { direction: "out" }),
  k("renter", ["rente", "renter", "rentekostnad", "kredittrente"], "okonomi.renter", 0.8, { direction: "out" }),
  k("gebyr", ["gebyr", "årsgebyr", "arsgebyr", "kortgebyr", "månedsgebyr", "purregebyr", "faktureringsgebyr", "etableringsgebyr"], "okonomi.gebyrer", 0.85, { direction: "out" }),
  k("avdrag", ["avdrag", "nedbetaling", "forbrukslån", "forbrukslan"], "okonomi.avdrag", 0.78, { direction: "out" }),
];

export interface CompiledKeyword {
  rule: KeywordRule;
  regex: RegExp;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compileKeywords(rules: KeywordRule[] = KEYWORD_RULES): CompiledKeyword[] {
  return rules.map((rule) => ({
    rule,
    regex: new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${rule.stems.map(escapeRegex).join("|")})`, "u"),
  }));
}

const COMPILED = compileKeywords();

/** Første treff vinner; rekkefølgen i KEYWORD_RULES styrer prioritet. */
export function findKeyword(normalized: string, direction: "in" | "out"): { rule: KeywordRule; stem: string } | null {
  for (const c of COMPILED) {
    if (c.rule.direction && c.rule.direction !== direction) continue;
    const match = c.regex.exec(normalized);
    if (match) {
      const stem = c.rule.stems.find((s) => normalized.includes(s.toLowerCase())) ?? c.rule.label;
      return { rule: c.rule, stem };
    }
  }
  return null;
}
