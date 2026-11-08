// Register over kjente norske butikker, leverandører og betalingsmottakere.
// Mønstre er små bokstaver og matches mot renset beskrivelse på ord-grenser.
// `category` er en systemnøkkel: «dagligvarer.matbutikk» (underkategori) eller «dagligvarer».

export interface MerchantDef {
  name: string;
  patterns: string[];
  category: string;
  /** Standard 0.92. Lavere for kjeder med blandet sortiment. */
  confidence?: number;
  /** Gjentakende tjeneste/abonnement. */
  subscription?: boolean;
  /** Gjelder kun penger inn/ut. */
  direction?: "in" | "out";
}

const m = (
  name: string,
  patterns: string[],
  category: string,
  extra: Partial<Omit<MerchantDef, "name" | "patterns" | "category">> = {},
): MerchantDef => ({ name, patterns, category, ...extra });

export const MERCHANTS: MerchantDef[] = [
  // ---------- Dagligvarer ----------
  m("REMA 1000", ["rema 1000", "rema1000", "rema"], "dagligvarer.matbutikk", { confidence: 0.95 }),
  m("KIWI", ["kiwi"], "dagligvarer.matbutikk", { confidence: 0.95 }),
  m("Coop", ["coop extra", "coop prix", "coop mega", "coop marked", "coop obs", "coop"], "dagligvarer.matbutikk", { confidence: 0.9 }),
  m("Meny", ["meny"], "dagligvarer.matbutikk", { confidence: 0.92 }),
  m("Spar", ["spar kjøpmann", "spar"], "dagligvarer.matbutikk", { confidence: 0.85 }),
  m("Joker", ["joker"], "dagligvarer.matbutikk", { confidence: 0.9 }),
  m("Bunnpris", ["bunnpris"], "dagligvarer.matbutikk", { confidence: 0.95 }),
  m("Nærbutikken", ["nærbutikken", "narbutikken"], "dagligvarer.matbutikk"),
  m("Oda", ["oda.com", "oda no"], "dagligvarer.matbutikk"),
  m("Lidl", ["lidl"], "dagligvarer.matbutikk"),
  m("Europris", ["europris"], "dagligvarer.husholdningsartikler", { confidence: 0.8 }),
  m("Vinmonopolet", ["vinmonopolet"], "dagligvarer.matbutikk", { confidence: 0.75 }),
  m("Apotek 1", ["apotek 1", "apotek1"], "dagligvarer.apotek", { confidence: 0.95 }),
  m("Vitus Apotek", ["vitus apotek", "vitus"], "dagligvarer.apotek", { confidence: 0.95 }),
  m("Boots Apotek", ["boots apotek", "boots"], "dagligvarer.apotek"),
  m("Ditt Apotek", ["ditt apotek"], "dagligvarer.apotek", { confidence: 0.95 }),
  m("Kicks", ["kicks"], "dagligvarer.hygiene", { confidence: 0.88 }),
  m("Lyko", ["lyko"], "dagligvarer.hygiene", { confidence: 0.88 }),
  m("Normal", ["normal as", "normal oslo", "normal norge"], "dagligvarer.hygiene", { confidence: 0.8 }),

  // ---------- Transport ----------
  m("Circle K", ["circle k", "circlek"], "transport.drivstoff", { confidence: 0.85 }),
  m("Esso", ["esso"], "transport.drivstoff", { confidence: 0.88 }),
  m("Shell", ["shell"], "transport.drivstoff", { confidence: 0.88 }),
  m("Uno-X", ["uno-x", "uno x", "unox"], "transport.drivstoff", { confidence: 0.9 }),
  m("YX", ["yx"], "transport.drivstoff", { confidence: 0.88 }),
  m("St1", ["st1"], "transport.drivstoff", { confidence: 0.9 }),
  m("Best", ["best bensin", "best tank"], "transport.drivstoff"),
  m("Ruter", ["ruter"], "transport.kollektivtransport", { confidence: 0.95 }),
  m("Entur", ["entur"], "transport.kollektivtransport", { confidence: 0.95 }),
  m("Vy", ["vy.no", "vy app", "vy"], "transport.kollektivtransport", { confidence: 0.85 }),
  m("Flytoget", ["flytoget"], "transport.kollektivtransport", { confidence: 0.95 }),
  m("AtB", ["atb"], "transport.kollektivtransport", { confidence: 0.92 }),
  m("Skyss", ["skyss"], "transport.kollektivtransport", { confidence: 0.92 }),
  m("Kolumbus", ["kolumbus"], "transport.kollektivtransport", { confidence: 0.92 }),
  m("Brakar", ["brakar"], "transport.kollektivtransport", { confidence: 0.92 }),
  m("Uber", ["uber"], "transport.taxi", { confidence: 0.85 }),
  m("Bolt", ["bolt"], "transport.taxi", { confidence: 0.8 }),
  m("Taxi", ["oslo taxi", "norgestaxi", "taxi"], "transport.taxi", { confidence: 0.9 }),
  m("AutoPASS", ["autopass", "fjellinjen", "ferde", "bompenger", "bompengeselskapet", "bompenge"], "transport.bom", { confidence: 0.93 }),
  m("EasyPark", ["easypark", "easy park"], "transport.parkering", { confidence: 0.95 }),
  m("Apcoa", ["apcoa"], "transport.parkering", { confidence: 0.95 }),
  m("Aimo Park", ["aimo park", "aimo"], "transport.parkering", { confidence: 0.95 }),
  m("Q-Park", ["q-park", "qpark", "onepark", "europark", "park24"], "transport.parkering", { confidence: 0.93 }),
  m("Mekonomen", ["mekonomen", "autoexperten", "bilia", "møller bil", "moller bil"], "transport.vedlikehold", { confidence: 0.85 }),
  m("Biltema", ["biltema"], "transport.vedlikehold", { confidence: 0.72 }),

  // ---------- Restaurant og kafé ----------
  m("Foodora", ["foodora"], "restaurant.leveringstjenester", { confidence: 0.95 }),
  m("Wolt", ["wolt"], "restaurant.leveringstjenester", { confidence: 0.95 }),
  m("Just Eat", ["just eat", "justeat"], "restaurant.leveringstjenester", { confidence: 0.95 }),
  m("Uber Eats", ["uber eats", "ubereats"], "restaurant.leveringstjenester", { confidence: 0.95 }),
  m("Bolt Food", ["bolt food"], "restaurant.leveringstjenester", { confidence: 0.95 }),
  m("McDonald's", ["mcdonald", "mcdonalds", "mc donalds"], "restaurant.fastfood", { confidence: 0.95 }),
  m("Burger King", ["burger king"], "restaurant.fastfood", { confidence: 0.95 }),
  m("Max Burgers", ["max burger", "max hamburger"], "restaurant.fastfood", { confidence: 0.95 }),
  m("Subway", ["subway"], "restaurant.fastfood", { confidence: 0.93 }),
  m("KFC", ["kfc"], "restaurant.fastfood", { confidence: 0.95 }),
  m("Taco Bell", ["taco bell"], "restaurant.fastfood", { confidence: 0.95 }),
  m("Narvesen", ["narvesen"], "restaurant.fastfood", { confidence: 0.72 }),
  m("7-Eleven", ["7-eleven", "7 eleven", "seven eleven"], "restaurant.fastfood", { confidence: 0.72 }),
  m("Domino's", ["dominos", "domino's", "domino"], "restaurant.takeaway", { confidence: 0.93 }),
  m("Peppes Pizza", ["peppes"], "restaurant.takeaway", { confidence: 0.85 }),
  m("Pizzabakeren", ["pizzabakeren", "pizza grande"], "restaurant.takeaway", { confidence: 0.9 }),
  m("Starbucks", ["starbucks"], "restaurant.kafe", { confidence: 0.95 }),
  m("Espresso House", ["espresso house"], "restaurant.kafe", { confidence: 0.95 }),
  m("Kaffebrenneriet", ["kaffebrenneriet"], "restaurant.kafe", { confidence: 0.95 }),
  m("Joe & The Juice", ["joe & the juice", "joe and the juice"], "restaurant.kafe", { confidence: 0.93 }),
  m("Baker Hansen", ["baker hansen", "åpent bakeri", "apent bakeri"], "restaurant.kafe", { confidence: 0.88 }),
  m("Egon", ["egon"], "restaurant.restaurant", { confidence: 0.88 }),
  m("Olivia", ["olivia"], "restaurant.restaurant", { confidence: 0.8 }),

  // ---------- Shopping ----------
  m("IKEA", ["ikea"], "shopping.mobler", { confidence: 0.93 }),
  m("JYSK", ["jysk"], "shopping.mobler", { confidence: 0.92 }),
  m("Bohus", ["bohus"], "shopping.mobler", { confidence: 0.92 }),
  m("Skeidar", ["skeidar"], "shopping.mobler", { confidence: 0.93 }),
  m("ILVA", ["ilva"], "shopping.mobler", { confidence: 0.92 }),
  m("Kid Interiør", ["kid interiør", "kid interior"], "shopping.interior", { confidence: 0.92 }),
  m("Søstrene Grene", ["søstrene grene", "sostrene grene"], "shopping.interior", { confidence: 0.9 }),
  m("Elkjøp", ["elkjøp", "elkjop"], "shopping.elektronikk", { confidence: 0.95 }),
  m("Power", ["power.no", "power norge", "power elektro"], "shopping.elektronikk", { confidence: 0.9 }),
  m("Komplett", ["komplett"], "shopping.elektronikk", { confidence: 0.93 }),
  m("NetOnNet", ["netonnet"], "shopping.elektronikk", { confidence: 0.93 }),
  m("Proshop", ["proshop"], "shopping.elektronikk", { confidence: 0.93 }),
  m("Kjell & Company", ["kjell & company", "kjell.com", "kjell og company"], "shopping.elektronikk", { confidence: 0.92 }),
  m("Apple Store", ["apple store"], "shopping.elektronikk", { confidence: 0.88 }),
  m("H&M", ["h&m", "h & m"], "shopping.klaer", { confidence: 0.93 }),
  m("Zara", ["zara"], "shopping.klaer", { confidence: 0.93 }),
  m("Cubus", ["cubus"], "shopping.klaer", { confidence: 0.93 }),
  m("Dressmann", ["dressmann"], "shopping.klaer", { confidence: 0.93 }),
  m("Lindex", ["lindex"], "shopping.klaer", { confidence: 0.92 }),
  m("KappAhl", ["kappahl"], "shopping.klaer", { confidence: 0.92 }),
  m("Match", ["match as", "match oslo"], "shopping.klaer", { confidence: 0.8 }),
  m("Bik Bok", ["bik bok", "bikbok"], "shopping.klaer", { confidence: 0.92 }),
  m("Zalando", ["zalando"], "shopping.klaer", { confidence: 0.93 }),
  m("Boozt", ["boozt"], "shopping.klaer", { confidence: 0.93 }),
  m("Gina Tricot", ["gina tricot"], "shopping.klaer", { confidence: 0.93 }),
  m("Stadium", ["stadium"], "shopping.klaer", { confidence: 0.78 }),
  m("XXL", ["xxl"], "shopping.hobby", { confidence: 0.75 }),
  m("Intersport", ["intersport", "sportsmaster"], "shopping.hobby", { confidence: 0.78 }),
  m("Clas Ohlson", ["clas ohlson"], "shopping.diverse", { confidence: 0.85 }),
  m("Amazon", ["amazon", "amzn"], "shopping.diverse", { confidence: 0.85 }),
  m("AliExpress", ["aliexpress"], "shopping.diverse", { confidence: 0.9 }),
  m("Temu", ["temu"], "shopping.diverse", { confidence: 0.9 }),
  m("eBay", ["ebay"], "shopping.diverse", { confidence: 0.9 }),
  m("Finn.no", ["finn.no"], "shopping.diverse", { confidence: 0.78 }),
  m("Tiger", ["flying tiger", "tiger store"], "shopping.diverse", { confidence: 0.85 }),
  m("Panduro", ["panduro", "hobbyhuset"], "shopping.hobby", { confidence: 0.92 }),
  m("Plantasjen", ["plantasjen"], "shopping.interior", { confidence: 0.85 }),
  m("Jernia", ["jernia", "maxbo", "byggmax", "monter", "byggmakker", "obs bygg", "coop obs bygg"], "bolig.vedlikehold", { confidence: 0.82 }),

  // ---------- Abonnementer ----------
  m("Netflix", ["netflix"], "abonnementer.streaming", { confidence: 0.97, subscription: true }),
  m("HBO Max", ["hbo max", "hbomax", "max.com"], "abonnementer.streaming", { confidence: 0.95, subscription: true }),
  m("Disney+", ["disney+", "disney plus", "disneyplus"], "abonnementer.streaming", { confidence: 0.97, subscription: true }),
  m("Viaplay", ["viaplay"], "abonnementer.streaming", { confidence: 0.97, subscription: true }),
  m("Spotify", ["spotify"], "abonnementer.streaming", { confidence: 0.97, subscription: true }),
  m("YouTube Premium", ["youtube premium", "youtubepremium", "youtube"], "abonnementer.streaming", { confidence: 0.93, subscription: true }),
  m("Apple Music / TV", ["apple music", "apple tv"], "abonnementer.streaming", { confidence: 0.95, subscription: true }),
  m("Amazon Prime", ["amazon prime", "prime video", "primevideo"], "abonnementer.streaming", { confidence: 0.95, subscription: true }),
  m("TV 2 Play", ["tv 2 play", "tv2 play", "tv 2 sumo", "tv2 sumo"], "abonnementer.streaming", { confidence: 0.95, subscription: true }),
  m("Discovery+", ["discovery+", "discoveryplus"], "abonnementer.streaming", { confidence: 0.95, subscription: true }),
  m("Storytel", ["storytel", "audible", "bookbeat", "nextory"], "abonnementer.streaming", { confidence: 0.95, subscription: true }),
  m("Tidal / Deezer", ["tidal", "deezer"], "abonnementer.streaming", { confidence: 0.95, subscription: true }),
  m("DAZN / SkyShowtime", ["dazn", "skyshowtime", "paramount+"], "abonnementer.streaming", { confidence: 0.95, subscription: true }),
  m("Avis", ["vg+", "dagbladet pluss", "aftenposten", "e24", "dn.no", "bergens tidende"], "abonnementer.andre", { confidence: 0.82, subscription: true }),
  m("Microsoft", ["microsoft", "office 365", "microsoft 365", "xbox game pass"], "abonnementer.programvare", { confidence: 0.85, subscription: true }),
  m("Adobe", ["adobe"], "abonnementer.programvare", { confidence: 0.95, subscription: true }),
  m("Dropbox", ["dropbox"], "abonnementer.programvare", { confidence: 0.95, subscription: true }),
  m("iCloud / Apple", ["icloud", "apple.com/bill", "apple.com bill", "itunes"], "abonnementer.programvare", { confidence: 0.9, subscription: true }),
  m("Google", ["google one", "google storage", "google play", "google youtube"], "abonnementer.programvare", { confidence: 0.82, subscription: true }),
  m("OpenAI / ChatGPT", ["openai", "chatgpt", "anthropic", "claude.ai"], "abonnementer.programvare", { confidence: 0.95, subscription: true }),
  m("GitHub", ["github", "notion", "figma", "canva", "1password", "nordvpn", "expressvpn", "zoom"], "abonnementer.programvare", { confidence: 0.9, subscription: true }),
  m("Telenor", ["telenor"], "abonnementer.mobil", { confidence: 0.82, subscription: true }),
  m("Telia", ["telia"], "abonnementer.mobil", { confidence: 0.8, subscription: true }),
  m("Ice", ["ice.no", "ice mobil", "ice norge"], "abonnementer.mobil", { confidence: 0.9, subscription: true }),
  m("Talkmore / Chilimobil", ["talkmore", "chilimobil", "happybytes", "onecall", "fello", "lyca"], "abonnementer.mobil", { confidence: 0.93, subscription: true }),
  m("DNT", ["dnt", "den norske turistforening"], "abonnementer.medlemskap", { confidence: 0.82 }),
  m("NAF", ["naf", "norges automobil"], "abonnementer.medlemskap", { confidence: 0.82 }),
  m("Fagforening", ["fellesforbundet", "nito", "utdanningsforbundet", "fagforbundet", "lo favør", "lo favor"], "abonnementer.medlemskap", { confidence: 0.85, subscription: true }),

  // ---------- Bolig ----------
  m("Fjordkraft", ["fjordkraft", "tibber", "hafslund", "ishavskraft", "fortum", "nordkraft", "kraftriket", "norgesenergi", "fri energi", "entelios", "lyse energi", "agder energi"], "bolig.strom", { confidence: 0.93 }),
  m("Nettselskap", ["elvia", "tensio", "glitre", "linja as", "mørenett", "morenett", "bkk nett", "nettleie"], "bolig.strom", { confidence: 0.88 }),
  m("Altibox", ["altibox", "canal digital"], "bolig.internett", { confidence: 0.93, subscription: true }),
  m("Get", ["get as", "get internett"], "bolig.internett", { confidence: 0.88, subscription: true }),
  m("OBOS", ["obos", "sameiet", "borettslag"], "bolig.felleskostnader", { confidence: 0.75 }),
  m("Renovasjon", ["renovasjon", "vann og avløp", "vann og avlop", "eiendomsskatt", "kommunale avgifter"], "bolig.kommunale-avgifter", { confidence: 0.9 }),
  m("Gjensidige", ["gjensidige"], "bolig.forsikring", { confidence: 0.7 }),
  m("Tryg / If / Fremtind", ["tryg forsikring", "tryg", "if skadeforsikring", "fremtind", "storebrand forsikring", "codan", "frende"], "bolig.forsikring", { confidence: 0.72 }),

  // ---------- Familie og barn ----------
  m("Babysam", ["babysam"], "familie.barneutstyr", { confidence: 0.93 }),
  m("Jollyroom", ["jollyroom"], "familie.barneutstyr", { confidence: 0.93 }),
  m("Lekia / Lego", ["lekia", "legobutikken", "lego store", "toys r us", "leketøysbutikken"], "familie.leker", { confidence: 0.88 }),

  // ---------- Helse ----------
  m("SATS", ["sats elixia", "sats", "evo fitness", "fresh fitness", "3t", "actic", "ntnui", "treningssenter"], "helse.trening", { confidence: 0.9, subscription: true }),
  m("Volvat / Aleris", ["volvat", "aleris", "unilabs", "legevakt", "legesenter", "fysioterapi", "kiropraktor"], "helse.lege", { confidence: 0.9 }),
  m("Tannlege", ["tannlege", "tannklinikk", "tannhelse"], "helse.tannlege", { confidence: 0.93 }),

  // ---------- Fritid og underholdning ----------
  m("Kino", ["sf kino", "filmweb", "odeon kino", "oslo kino", "kino"], "fritid.kino", { confidence: 0.9 }),
  m("Spill", ["steam", "playstation", "xbox", "nintendo", "epic games", "blizzard", "riot games", "norsk tipping", "norsk rikstoto"], "fritid.spill", { confidence: 0.85 }),
  m("Norwegian", ["norwegian air", "norwegian.com", "norwegian"], "fritid.reiser", { confidence: 0.88 }),
  m("SAS / Widerøe", ["sas.no", "scandinavian airlines", "widerøe", "wideroe", "ryanair", "easyjet", "lufthansa", "klm", "finnair", "wizz air"], "fritid.reiser", { confidence: 0.92 }),
  m("Overnatting", ["booking.com", "airbnb", "hotels.com", "expedia", "momondo", "kiwi.com", "thon hotel", "scandic", "clarion", "radisson", "nordic choice", "hotell"], "fritid.reiser", { confidence: 0.9 }),
  m("Billetter", ["ticketmaster", "billettservice", "ticketco", "eventbrite", "tusenfryd", "dyreparken", "bowling"], "fritid.aktiviteter", { confidence: 0.88 }),

  // ---------- Økonomi ----------
  m("Nordnet", ["nordnet", "firi", "dnb verdipapir", "storebrand fond", "aksjesparekonto"], "okonomi.investeringer", { confidence: 0.9 }),
  m("Lånekassen (utbetaling)", ["lånekassen", "lanekassen"], "inntekter.stotte", { confidence: 0.85, direction: "in" }),
  m("Lånekassen (betaling)", ["lånekassen", "lanekassen"], "okonomi.gjeldsnedbetaling", { confidence: 0.88, direction: "out" }),

  // ---------- Inntekter ----------
  m("NAV", ["nav", "arbeids- og velferdsetaten", "arbeids og velferdsetaten"], "inntekter.stotte", { confidence: 0.9, direction: "in" }),
  m("Skatteetaten", ["skatteetaten", "skattekontoret", "skatt tilbakebetaling"], "inntekter.andre", { confidence: 0.85, direction: "in" }),
];

export interface CompiledMerchant {
  def: MerchantDef;
  pattern: string;
  regex: RegExp;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mønstre sortert lengst først, slik at «uber eats» vinner over «uber». */
export function compileMerchants(defs: MerchantDef[] = MERCHANTS): CompiledMerchant[] {
  const out: CompiledMerchant[] = [];
  for (const def of defs) {
    for (const raw of def.patterns) {
      const pattern = raw.trim().toLowerCase();
      if (!pattern) continue;
      out.push({
        def,
        pattern,
        regex: new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegex(pattern)}(?:$|[^\\p{L}\\p{N}])`, "u"),
      });
    }
  }
  return out.sort((a, b) => b.pattern.length - a.pattern.length);
}

const COMPILED = compileMerchants();

export function findMerchant(normalized: string, direction: "in" | "out"): CompiledMerchant | null {
  for (const c of COMPILED) {
    if (c.def.direction && c.def.direction !== direction) continue;
    if (c.regex.test(normalized)) return c;
  }
  return null;
}
