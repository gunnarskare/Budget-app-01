// Realistiske eksempeldata: seks hele måneder + inneværende måned for en norsk husholdning.
// Deterministisk (seedet) – og beskrivelsene er skrevet slik banker faktisk skriver dem,
// slik at de går gjennom nøyaktig samme import- og kategoriseringsløype som ekte CSV-filer.

import { addMonths, daysInMonth, monthKeyOf, monthsBetween } from "@/lib/dates";

export interface DemoRow {
  account: "checking" | "savings";
  date: string;
  description: string;
  amount: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemoRows(today: string, seed = 1337): DemoRow[] {
  const rnd = mulberry32(seed);
  const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
  const amt = (min: number, max: number, step = 1) => Math.round(int(min, max) / step) * step;
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

  const currentKey = monthKeyOf(today);
  const months = monthsBetween(addMonths(currentKey, -6), currentKey);
  const rows: DemoRow[] = [];

  const add = (account: DemoRow["account"], monthKey: string, day: number, description: string, amount: number) => {
    const d = Math.min(day, daysInMonth(monthKey));
    const date = `${monthKey}-${String(d).padStart(2, "0")}`;
    if (date > today) return;
    rows.push({ account, date, description, amount: Math.round(amount * 100) / 100 });
  };

  months.forEach((m, mi) => {
    const monthNum = Number(m.slice(5, 7));
    const winter = monthNum >= 11 || monthNum <= 3;

    // ---- faste poster ----
    add("checking", m, 1, "Husleie Skøyen Utleie AS", -12500);
    add("checking", m, 1, "Overføring til sparekonto", -3000);
    add("savings", m, 1, "Overføring fra brukskonto", 3000);
    add("checking", m, 2, "Ruter AS Månedskort", -890);
    add("checking", m, 3, "Fjordkraft AS", -(winter ? amt(1100, 1650, 10) : amt(480, 820, 10)));
    add("checking", m, 4, "SATS Elixia", -599);
    add("checking", m, 5, "Avtalegiro Telia Norge AS", -449);
    add("checking", m, 6, "Altibox AS", -599);
    add("checking", m, 8, "Netflix.com", -169);
    add("checking", m, 10, "Spotify Premium", -189);
    add("checking", m, 14, "HBO Max", -129);
    add("checking", m, 20, "Apple.com/bill iCloud", -39);
    add("checking", m, 25, "Lønn Acme AS", 38500);

    // ---- dagligvarer ----
    const groceryShops: Array<[string, number, number]> = [
      ["Varekjøp REMA 1000 GRØNLAND", 120, 780],
      ["Kiwi 505 Barcode", 90, 650],
      ["Coop Extra Torshov", 100, 700],
      ["Meny Majorstuen", 150, 900],
      ["Bunnpris Grünerløkka", 60, 300],
    ];
    for (let i = 0, n = int(11, 15); i < n; i++) {
      const [name, lo, hi] = pick(groceryShops);
      add("checking", m, int(1, 28), name, -amt(lo, hi));
    }

    // ---- transport ----
    for (let i = 0, n = int(1, 2); i < n; i++) add("checking", m, int(2, 27), "Circle K Ullevål", -amt(450, 850));
    for (let i = 0, n = int(1, 3); i < n; i++) add("checking", m, int(2, 27), "EasyPark Parkering", -amt(35, 140));
    for (let i = 0, n = int(1, 2); i < n; i++) add("checking", m, int(2, 27), "Fjellinjen AS", -amt(42, 85));

    // ---- restaurant og kafé ----
    if (rnd() < 0.7) add("checking", m, int(3, 28), "Peppes Pizza Majorstuen", -amt(250, 520));
    for (let i = 0, n = int(1, 2); i < n; i++) add("checking", m, int(2, 28), "Foodora", -amt(240, 420));
    if (rnd() < 0.6) add("checking", m, int(2, 28), "Wolt", -amt(210, 380));
    for (let i = 0, n = int(1, 3); i < n; i++) add("checking", m, int(2, 28), "Starbucks Aker Brygge", -amt(49, 95));
    for (let i = 0, n = int(0, 2); i < n; i++) add("checking", m, int(2, 28), "McDonalds Majorstuen", -amt(110, 230));
    if (rnd() < 0.5) add("checking", m, int(5, 28), "Restaurant Brasserie France", -amt(480, 1200, 10));
    for (let i = 0, n = int(1, 2); i < n; i++) add("checking", m, int(2, 28), "Bakeriet Frogner", -amt(45, 120));

    // ---- shopping ----
    if (rnd() < 0.55) add("checking", m, int(3, 27), "H&M Storo", -amt(300, 900));
    if (rnd() < 0.4) add("checking", m, int(3, 27), "IKEA Furuset", -amt(299, 1800));
    if (rnd() < 0.25) add("checking", m, int(3, 27), "Elkjøp Oslo City", -amt(1500, 4500, 10));
    if (rnd() < 0.5) add("checking", m, int(3, 27), "Clas Ohlson", -amt(120, 600));

    // ---- helse, fritid, familie ----
    for (let i = 0, n = int(1, 2); i < n; i++) add("checking", m, int(2, 28), "Apotek 1 Majorstuen", -amt(79, 450));
    if (mi === 2) add("checking", m, 12, "Oslo Tannlegesenter", -1300);
    for (let i = 0, n = int(0, 2); i < n; i++) add("checking", m, int(2, 28), "SF Kino Oslo", -amt(180, 420));
    if (rnd() < 0.4) add("checking", m, int(2, 28), "Steam Purchase", -amt(100, 400));
    if (mi === 3) add("checking", m, 17, "Norwegian Air Shuttle", -2870);
    if (mi === 4) add("checking", m, 9, "Babysam Storo", -amt(300, 900));

    // ---- Vipps og diverse (ukjent for motoren → til godkjenning) ----
    for (let i = 0, n = int(1, 3); i < n; i++) add("checking", m, int(2, 28), "Vipps Kari Hansen", -amt(100, 600, 10));
    if (rnd() < 0.5) add("checking", m, int(2, 28), "Vipps Ola Nordmann", amt(100, 500, 10));
  });

  // Én tilbakebetaling og ett uvanlig stort kjøp i nyere tid
  const prevKey = addMonths(currentKey, -1);
  rows.push({ account: "checking", date: `${prevKey}-14`, description: "REMA 1000 GRØNLAND retur", amount: 129 });
  const bigDay = Math.max(2, Number(today.slice(8, 10)) - 2);
  const bigDate = `${currentKey}-${String(bigDay).padStart(2, "0")}`;
  if (bigDate <= today && Number(today.slice(8, 10)) >= 3) {
    rows.push({ account: "checking", date: bigDate, description: "IKEA Slependen", amount: -3490 });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
}

export interface DemoGoal {
  name: string;
  icon: string;
  color: string;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number;
  /** Antall måneder frem i tid fra i dag (null = ingen måldato) */
  months_ahead: number | null;
}

export const DEMO_GOALS: DemoGoal[] = [
  { name: "Bufferkonto", icon: "umbrella", color: "#2a78d6", target_amount: 60000, current_amount: 21000, monthly_contribution: 3000, months_ahead: null },
  { name: "Ferie i Hellas", icon: "plane", color: "#eb6834", target_amount: 25000, current_amount: 9200, monthly_contribution: 2500, months_ahead: 7 },
  { name: "Ny sykkel", icon: "bike", color: "#1baf7a", target_amount: 12000, current_amount: 11200, monthly_contribution: 800, months_ahead: 2 },
];

