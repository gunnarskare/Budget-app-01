// Økonomiassistent: konkrete, forståelige innsikter basert på brukerens egne tall.
// Hver innsikt har et eget krav til datagrunnlag. Er grunnlaget for lite, sies ingenting
// bastant – innsikten utelates eller merkes som foreløpig.

import { addMonths, dayOfMonth, daysInMonth, lastMonths, monthKeyOf, monthStart } from "@/lib/dates";
import { formatMoney, monthName, plural, roundNice } from "@/lib/format";
import type { InsightSeverity, Lookups, RecurringTransaction, TxLite } from "@/lib/types";
import { inMonth, monthlySpendByCategory, monthsWithData, totals } from "./aggregate";
import type { BudgetView } from "./budget";
import { classify } from "./classify";
import type { Forecast } from "./forecast";
import { monthlyEquivalent } from "./recurring";

export interface InsightDraft {
  /** Stabil nøkkel – avviste innsikter dukker ikke opp igjen for samme periode. */
  key: string;
  kind: string;
  severity: InsightSeverity;
  confidence: "low" | "medium" | "high";
  period: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sort: number;
}

export interface InsightInput {
  txs: TxLite[];
  lk: Lookups;
  today: string;
  recurring: RecurringTransaction[];
  /** Budsjettvisning for inneværende måned (kan være null) */
  budget: BudgetView | null;
  forecast: Forecast;
}

const kr = (n: number) => formatMoney(n);
const pctOf = (r: number) => `${Math.round(Math.abs(r) * 100)}`;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function categoryByKey(lk: Lookups, key: string) {
  for (const c of lk.categories.values()) if (c.system_key === key) return c;
  return undefined;
}

function subIdsByKey(lk: Lookups, keys: string[]): Set<string> {
  const ids = new Set<string>();
  for (const s of lk.subcategories.values()) if (s.system_key && keys.includes(s.system_key)) ids.add(s.id);
  return ids;
}

/** Forbruk per kategori t.o.m. gitt dag i måneden. */
function spendUpToDay(txs: TxLite[], lk: Lookups, monthKey: string, day: number): Map<string, number> {
  const out = new Map<string, number>();
  const limit = `${monthKey}-${String(day).padStart(2, "0")}`;
  for (const tx of inMonth(txs, monthKey)) {
    if (tx.booked_date > limit || !tx.category_id) continue;
    const c = classify(tx, lk);
    if (c.bucket !== "expense") continue;
    out.set(tx.category_id, (out.get(tx.category_id) ?? 0) + c.value);
  }
  return out;
}

export function generateInsights(input: InsightInput): InsightDraft[] {
  const { txs, lk, today, recurring, budget, forecast } = input;
  const currentKey = monthKeyOf(today);
  const prevKey = addMonths(currentKey, -1);
  const period = monthStart(currentKey);
  const elapsed = dayOfMonth(today);
  const dim = daysInMonth(currentKey);
  const daysLeft = dim - elapsed;

  const completeMonths = monthsWithData(txs, lastMonths(prevKey, 6), 5);
  const curTxs = inMonth(txs, currentKey);
  const out: InsightDraft[] = [];
  const push = (d: Omit<InsightDraft, "period">) => out.push({ ...d, period });

  if (txs.length === 0) return out;

  // ---- 1. Budsjett: hvor mye er igjen? ----
  if (budget && budget.totalPlanned > 0) {
    const remaining = budget.totalRemaining;
    if (remaining >= 0) {
      const perDay = daysLeft > 0 ? Math.round(remaining / daysLeft) : remaining;
      push({
        key: `budget_left:${currentKey}`,
        kind: "budget_left",
        severity: "good",
        confidence: "high",
        title: `Du har ${kr(remaining)} igjen av månedens budsjett`,
        body:
          daysLeft > 0
            ? `Det er ${plural(daysLeft, "dag", "dager")} igjen av ${monthName(currentKey)} – omtrent ${kr(perDay)} per dag.`
            : `Måneden er over – bra jobbet å holde seg innenfor budsjettet!`,
        data: { remaining, planned: budget.totalPlanned },
        sort: 10,
      });
    } else {
      push({
        key: `budget_over:${currentKey}`,
        kind: "budget_over",
        severity: "bad",
        confidence: "high",
        title: `Du har brukt ${kr(-remaining)} mer enn månedens budsjett`,
        body: "Vurder å justere budsjettet, eller kutt i valgfrie utgifter resten av måneden.",
        data: { remaining, planned: budget.totalPlanned },
        sort: 10,
      });
    }

    // Kategorier over budsjett
    const worst = [...budget.lines].filter((l) => l.status === "over").sort((a, b) => a.remaining - b.remaining)[0];
    if (worst) {
      const cat = lk.categories.get(worst.categoryId);
      if (cat) {
        push({
          key: `category_over:${currentKey}:${cat.id}`,
          kind: "category_over",
          severity: "warn",
          confidence: "high",
          title: `${cat.name} er over budsjett med ${kr(-worst.remaining)}`,
          body: `Du har brukt ${kr(worst.spent)} av ${kr(worst.planned)}.`,
          data: { categoryId: cat.id },
          sort: 15,
        });
      }
    }

    // Tempo mot budsjett (bruker prognosen, som skiller faste og variable utgifter)
    if (forecast.isCurrent && forecast.confidence !== "low" && elapsed >= 7) {
      const diff = forecast.projectedExpenses - budget.totalPlanned;
      if (diff > Math.max(300, budget.totalPlanned * 0.03)) {
        push({
          key: `pace_over:${currentKey}`,
          kind: "pace",
          severity: "warn",
          confidence: forecast.confidence,
          title: `Hvis du fortsetter i samme tempo, bruker du omtrent ${kr(roundNice(diff))} mer enn planlagt`,
          body: `Prognosen for måneden er ${kr(forecast.projectedExpenses)} mot et budsjett på ${kr(budget.totalPlanned)}.`,
          data: { diff },
          sort: 20,
        });
      } else if (-diff > Math.max(500, budget.totalPlanned * 0.05)) {
        push({
          key: `pace_under:${currentKey}`,
          kind: "pace",
          severity: "good",
          confidence: forecast.confidence,
          title: `I dette tempoet ender du omtrent ${kr(roundNice(-diff))} under budsjettet`,
          body: `Prognosen for måneden er ${kr(forecast.projectedExpenses)} mot et budsjett på ${kr(budget.totalPlanned)}.`,
          data: { diff },
          sort: 20,
        });
      }
    }
  }

  // ---- 2. Forventet saldo ved månedsslutt ----
  if (forecast.isCurrent && curTxs.length >= 3) {
    const v = forecast.projectedAvailable;
    const prelim = forecast.confidence === "low" ? " Foreløpig anslag – det blir sikrere utover måneden." : "";
    push({
      key: `forecast_balance:${currentKey}`,
      kind: "forecast_balance",
      severity: v >= 0 ? "good" : "bad",
      confidence: forecast.confidence,
      title:
        v >= 0
          ? `Du ligger an til å ha omtrent ${kr(roundNice(v))} igjen ved månedsslutt`
          : `Med dagens tempo går du omtrent ${kr(roundNice(-v))} i minus denne måneden`,
      body: `Regnet ut fra inntekt og utgifter hittil, kjente faste betalinger og ditt vanlige daglige forbruk.${prelim}`,
      data: { projected: v },
      sort: 25,
    });
  }

  // ---- 3. Utvikling per kategori (samme dag i forrige måned) ----
  if (completeMonths.includes(prevKey) && elapsed >= 10) {
    const cur = spendUpToDay(txs, lk, currentKey, elapsed);
    const prev = spendUpToDay(txs, lk, prevKey, elapsed);
    const movers: Array<{ id: string; delta: number; ratio: number; c: number; p: number }> = [];
    for (const [id, p] of prev) {
      const cat = lk.categories.get(id);
      if (!cat || cat.kind !== "expense" || p < 800) continue;
      const c = cur.get(id) ?? 0;
      if (c === 0 && elapsed < 15) continue; // for tidlig til å si «ingenting brukt»
      const delta = c - p;
      const ratio = delta / p;
      if (Math.abs(ratio) >= 0.15 && Math.abs(delta) >= 200) movers.push({ id, delta, ratio, c, p });
    }
    movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    for (const mv of movers.slice(0, 2)) {
      const cat = lk.categories.get(mv.id)!;
      const less = mv.delta < 0;
      push({
        key: `trend:${currentKey}:${mv.id}`,
        kind: "category_trend",
        severity: less ? "good" : "warn",
        confidence: elapsed >= 10 ? "high" : "medium",
        title: `Du har brukt ${pctOf(mv.ratio)} % ${less ? "mindre" : "mer"} på ${cat.name.toLowerCase()} denne måneden`,
        body: `Så langt: ${kr(mv.c)} mot ${kr(mv.p)} på samme tidspunkt i ${monthName(prevKey)}.`,
        data: { categoryId: mv.id, ratio: mv.ratio },
        sort: 30,
      });
    }
  }

  // ---- 4. Hva restaurantbesøk og andre valgfrie utgifter koster ----
  {
    const monthSpend = new Map<string, { amount: number; count: number }>();
    for (const tx of curTxs) {
      const c = classify(tx, lk);
      if (c.bucket !== "expense" || !tx.category_id) continue;
      const e = monthSpend.get(tx.category_id) ?? { amount: 0, count: 0 };
      e.amount += c.value;
      e.count += 1;
      monthSpend.set(tx.category_id, e);
    }
    const rest = categoryByKey(lk, "restaurant");
    const restSpend = rest ? monthSpend.get(rest.id) : undefined;
    if (rest && restSpend && restSpend.amount >= 500) {
      push({
        key: `category_total:${currentKey}:${rest.id}`,
        kind: "category_total",
        severity: "info",
        confidence: "high",
        title: `Restaurantbesøk har kostet deg ${kr(restSpend.amount)} denne måneden`,
        body: `Fordelt på ${plural(restSpend.count, "kjøp", "kjøp")} (inkl. kafé og levering).`,
        data: { categoryId: rest.id },
        sort: 40,
      });
    }
  }

  // ---- 5. Strømutgifter ----
  {
    const strom = subIdsByKey(lk, ["bolig.strom"]);
    if (strom.size > 0 && completeMonths.includes(prevKey)) {
      const sum = (key: string) =>
        inMonth(txs, key)
          .filter((t) => t.subcategory_id && strom.has(t.subcategory_id))
          .reduce((n, t) => n + classify(t, lk).value, 0);
      const cur = sum(currentKey);
      const prev = sum(prevKey);
      if (cur > 0 && prev > 0 && cur >= prev * 1.2 && cur - prev >= 150) {
        push({
          key: `utility:${currentKey}:strom`,
          kind: "utility_change",
          severity: "warn",
          confidence: "medium",
          title: "Strømutgiftene dine ser ut til å være høyere enn forrige måned",
          body: `${kr(cur)} så langt mot ${kr(prev)} i ${monthName(prevKey)}. Husk at regninger kommer til ulike datoer.`,
          data: { cur, prev },
          sort: 45,
        });
      }
    }
  }

  // ---- 6. Abonnementer ----
  {
    const subs = recurring.filter((r) => r.status === "active" && r.is_subscription && r.typical_amount < 0);
    if (subs.length >= 2) {
      const monthly = subs.reduce((n, r) => n + monthlyEquivalent(r.typical_amount, r.frequency), 0);
      push({
        key: `subscriptions:${currentKey}`,
        kind: "subscriptions",
        severity: "info",
        confidence: "medium",
        title: `Du har ${subs.length} abonnementer som samlet koster ${kr(monthly)} i måneden`,
        body: `Det tilsvarer ${kr(monthly * 12)} i året. Sjekk om du fortsatt bruker alle.`,
        data: { count: subs.length, monthly },
        sort: 50,
      });
    }
  }

  // ---- 7. Krever ≥ 3 hele måneder: gjennomsnitt og sparepotensial ----
  if (completeMonths.length >= 3) {
    const months = completeMonths;
    const perCat = monthlySpendByCategory(txs, lk);
    const avgOfCategory = (categoryId: string) => {
      const byMonth = perCat.get(categoryId);
      if (!byMonth) return 0;
      return months.reduce((n, m) => n + Math.max(0, byMonth.get(m) ?? 0), 0) / months.length;
    };

    // Takeaway
    const take = subIdsByKey(lk, ["restaurant.takeaway", "restaurant.leveringstjenester"]);
    if (take.size > 0) {
      const total = txs
        .filter((t) => t.subcategory_id && take.has(t.subcategory_id) && months.includes(monthKeyOf(t.booked_date)))
        .reduce((n, t) => n + classify(t, lk).value, 0);
      const avg = total / months.length;
      if (avg >= 500) {
        push({
          key: `takeaway_avg:${currentKey}`,
          kind: "takeaway_avg",
          severity: "info",
          confidence: months.length >= 5 ? "high" : "medium",
          title: `Du bruker i gjennomsnitt ${kr(roundNice(avg))} på takeaway hver måned`,
          body: `Basert på de siste ${months.length} månedene, inkludert leveringstjenester.`,
          data: { avg },
          sort: 55,
        });
      }
    }

    // Sparepotensial: den største valgfrie kategorien
    const discretionary = ["restaurant", "shopping", "fritid", "abonnementer"]
      .map((k) => categoryByKey(lk, k))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ c, avg: avgOfCategory(c.id) }))
      .filter((x) => x.avg >= 1500)
      .sort((a, b) => b.avg - a.avg)[0];
    if (discretionary) {
      const cut = Math.max(100, roundNice(discretionary.avg * 0.2));
      const isRest = discretionary.c.system_key === "restaurant";
      push({
        key: `saving_potential:${currentKey}:${discretionary.c.id}`,
        kind: "saving_potential",
        severity: "info",
        confidence: months.length >= 5 ? "high" : "medium",
        title: isRest
          ? `Hvis du reduserer restaurantbudsjettet med ${kr(cut)}, kan du spare ${kr(cut * 12)} i året`
          : `Hvis du kutter ${kr(cut)} i måneden på ${discretionary.c.name.toLowerCase()}, kan du spare ${kr(cut * 12)} i året`,
        body: `Du bruker i snitt ${kr(roundNice(discretionary.avg))} i måneden på ${discretionary.c.name.toLowerCase()} (siste ${months.length} måneder). Et lite kutt gir mye over tid.`,
        data: { categoryId: discretionary.c.id, cut },
        sort: 60,
      });
    }

    // Sparerate
    const tot = months.map((m) => totals(inMonth(txs, m), lk));
    const income = tot.reduce((n, t) => n + t.income, 0);
    const saved = tot.reduce((n, t) => n + t.savings, 0);
    if (income > 0 && saved > 0) {
      const rate = saved / income;
      push({
        key: `savings_rate:${currentKey}`,
        kind: "savings_rate",
        severity: rate >= 0.1 ? "good" : "info",
        confidence: months.length >= 5 ? "high" : "medium",
        title: `Du har i snitt spart ${pctOf(rate)} % av inntekten de siste ${months.length} månedene`,
        body: rate >= 0.1 ? "Det er et solid sparenivå – fortsett slik!" : "Å spare 10–20 % er et vanlig mål. Små, faste overføringer hjelper.",
        data: { rate },
        sort: 70,
      });
    }
  }

  // ---- 8. Uvanlige utgifter (siste 30 dager) ----
  if (completeMonths.length >= 2) {
    const since = new Date(`${today}T00:00:00Z`);
    since.setUTCDate(since.getUTCDate() - 30);
    const sinceIso = since.toISOString().slice(0, 10);
    const fixedKeys = new Set(recurring.filter((r) => r.status === "active").map((r) => r.merchant_key));
    const history = new Map<string, number[]>();
    const byMerchant = new Map<string, number[]>();
    for (const tx of txs) {
      if (tx.booked_date >= sinceIso || !tx.category_id) continue;
      const c = classify(tx, lk);
      if (c.bucket !== "expense" || c.value <= 0) continue;
      (history.get(tx.category_id) ?? history.set(tx.category_id, []).get(tx.category_id)!).push(c.value);
      (byMerchant.get(tx.merchant_key) ?? byMerchant.set(tx.merchant_key, []).get(tx.merchant_key)!).push(c.value);
    }
    const unusual = txs
      .filter((tx) => tx.booked_date >= sinceIso && tx.booked_date <= today && tx.category_id && !fixedKeys.has(tx.merchant_key))
      .map((tx) => ({ tx, c: classify(tx, lk) }))
      .filter(({ c }) => c.bucket === "expense" && c.value >= 1000)
      .map(({ tx, c }) => {
        const prior = history.get(tx.category_id!) ?? [];
        return { tx, value: c.value, prior, med: prior.length >= 5 ? median(prior) : 0 };
      })
      .filter((x) => x.prior.length >= 5 && x.value >= x.med * 3)
      // Samme betaler har vært belastet tilsvarende før (f.eks. husleie, forsikring) → ikke uvanlig
      .filter((x) => {
        const same = byMerchant.get(x.tx.merchant_key) ?? [];
        return !(same.length >= 2 && x.value <= Math.max(...same) * 1.5);
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 2);
    for (const u of unusual) {
      const cat = lk.categories.get(u.tx.category_id!);
      push({
        key: `unusual:${u.tx.id}`,
        kind: "unusual_expense",
        severity: "warn",
        confidence: "medium",
        title: `Uvanlig stor utgift: ${u.tx.description}`,
        body: `${kr(u.value)} – vanligvis ligger enkeltkjøp i «${cat?.name ?? "denne kategorien"}» rundt ${kr(roundNice(u.med))}.`,
        data: { transactionId: u.tx.id },
        sort: 35,
      });
    }
  }

  return out.sort((a, b) => a.sort - b.sort);
}

/** Tekst som forklarer hvor mye data analysene bygger på. */
export function dataBasisNote(txs: TxLite[], today: string): string {
  const months = monthsWithData(txs, lastMonths(monthKeyOf(today), 12), 5);
  if (months.length === 0) return "Vi har ikke nok data ennå til å si noe sikkert.";
  if (months.length < 3) return `Analysene bygger på ${plural(months.length, "måned", "måneder")} med data – de blir sikrere etter hvert.`;
  return `Analysene bygger på ${months.length} måneder med data.`;
}

