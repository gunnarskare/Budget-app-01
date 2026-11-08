import { describe, expect, it } from "vitest";
import { buildWorld, ACCOUNTS } from "@/lib/testing/fixtures";
import { addMonths, monthKeyOf, todayISO, weekStart } from "@/lib/dates";
import type { Budget, BudgetCategory, RecurringTransaction, TxLite } from "@/lib/types";
import { dailyCumulativeExpenses, inMonth, spendByCategory, totals } from "./aggregate";
import { buildSlices } from "./donut";
import { buildBudgetView, paceProjection, resolveBudget, statusOf, suggestBudget } from "./budget";
import { classify } from "./classify";
import { forecastMonth } from "./forecast";
import { crossedMilestone, goalProgress } from "./goals";
import { generateInsights } from "./insights";
import { detectRecurring, monthlyEquivalent } from "./recurring";

const TODAY = "2026-11-08";
const world = buildWorld(TODAY);
const { lk, txs } = world;
const lite = (t: (typeof txs)[number]): TxLite => t;

describe("klassifisering", () => {
  const tx = (over: Partial<TxLite>): TxLite => ({
    id: "x", account_id: "acc-checking", booked_date: "2026-11-01", amount: -100, description: "", merchant_key: "",
    category_id: "cat-dagligvarer", subcategory_id: null, transfer_status: "none", review_status: "auto", ...over,
  });

  it("utgift, refusjon, inntekt og ukategorisert", () => {
    expect(classify(tx({}), lk)).toEqual({ bucket: "expense", value: 100 });
    expect(classify(tx({ amount: 129 }), lk)).toEqual({ bucket: "expense", value: -129 }); // refusjon
    expect(classify(tx({ amount: 30000, category_id: "cat-inntekter" }), lk)).toEqual({ bucket: "income", value: 30000 });
    expect(classify(tx({ amount: 50, category_id: null }), lk).bucket).toBe("income");
    expect(classify(tx({ amount: -50, category_id: null }), lk).bucket).toBe("expense");
  });

  it("sparing og interne overføringer", () => {
    expect(classify(tx({ amount: -3000, category_id: "cat-okonomi", subcategory_id: "sub-okonomi.sparing" }), lk)).toEqual({ bucket: "saving", value: 3000 });
    expect(classify(tx({ amount: -3000, transfer_status: "confirmed" }), lk)).toEqual({ bucket: "transfer", value: 0 });
    expect(classify(tx({ amount: 3000, transfer_status: "confirmed", account_id: "acc-savings" }), lk)).toEqual({ bucket: "saving", value: 3000 });
    // «foreslått» overføring teller ikke som overføring før brukeren bekrefter
    expect(classify(tx({ amount: -3000, transfer_status: "suggested" }), lk).bucket).toBe("expense");
  });
});

describe("eksempeldata gir troverdige månedstall", () => {
  const prev = addMonths(monthKeyOf(TODAY), -1);
  const t = totals(inMonth(txs, prev).map(lite), lk);

  it("inntekt ≈ lønn, sparing = 3 000, overføringer telles ikke som utgift", () => {
    expect(t.income).toBeGreaterThanOrEqual(38500);
    expect(t.income).toBeLessThan(39100);
    expect(t.savings).toBe(3000);
    expect(t.expenses).toBeGreaterThan(18000);
    expect(t.expenses).toBeLessThan(36000);
    expect(t.available).toBeCloseTo(t.income - t.expenses - t.savings, 2);
  });

  it("det er flere måneder med data og uten duplikater i fingeravtrykkets forutsetninger", () => {
    const months = new Set(txs.map((x) => monthKeyOf(x.booked_date)));
    expect(months.size).toBe(7);
  });

  it("refusjon reduserer forbruket i kategorien", () => {
    const retur = txs.find((x) => x.original.includes("retur"))!;
    expect(retur.amount).toBe(129);
    expect(retur.category_id).toBe("cat-dagligvarer");
    const withRefund = spendByCategory(inMonth(txs, prev).map(lite), lk).find((s) => s.categoryId === "cat-dagligvarer")!.amount;
    const without = spendByCategory(inMonth(txs, prev).filter((x) => x.id !== retur.id).map(lite), lk).find((s) => s.categoryId === "cat-dagligvarer")!.amount;
    expect(without - withRefund).toBeCloseTo(129, 2);
  });

  it("noe er usikkert og venter på godkjenning, men det meste er automatisk", () => {
    const review = txs.filter((x) => x.review_status === "review").length;
    expect(review).toBeGreaterThan(5);
    expect(review / txs.length).toBeLessThan(0.25);
  });

  it("akkumulert forbruk stiger jevnt og stopper i dag", () => {
    const cum = dailyCumulativeExpenses(txs.map(lite), lk, monthKeyOf(TODAY), 8);
    expect(cum).toHaveLength(30);
    expect(cum[7]).not.toBeNull();
    expect(cum[8]).toBeNull();
    const filled = cum.filter((x): x is number => x !== null);
    for (let i = 1; i < filled.length; i++) expect(filled[i]).toBeGreaterThanOrEqual(filled[i - 1]);
  });
});

describe("donut-deler", () => {
  const prevMonth = addMonths(monthKeyOf(TODAY), -1);
  const spend = spendByCategory(inMonth(txs, prevMonth).map(lite), lk);

  it("viser maks 7 deler + «Andre», og delene summerer til 100 %", () => {
    const slices = buildSlices(spend, lk, 5);
    expect(slices.length).toBeLessThanOrEqual(6);
    expect(slices.at(-1)?.other).toBe(true);
    expect(slices.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1, 6);
    expect(slices[0].amount).toBeGreaterThanOrEqual(slices[1].amount);
  });

  it("viser alle når det er få nok kategorier, og ingenting uten utgifter", () => {
    expect(buildSlices(spend, lk, 20).every((s) => !s.other)).toBe(true);
    expect(buildSlices([], lk)).toEqual([]);
    expect(buildSlices([{ categoryId: "cat-bolig", amount: -50, count: 1, share: 0 }], lk)).toEqual([]);
  });
});

describe("gjentakende betalinger", () => {
  const rec = detectRecurring(txs.map(lite), lk, TODAY);
  const names = rec.map((r) => r.merchantKey);

  it("finner abonnementer, faste regninger og lønn", () => {
    for (const k of ["netflix.com", "spotify premium", "hbo max", "altibox as", "lønn acme", "husleie skøyen"]) {
      const hit = rec.some((r) => r.merchantKey === k || r.merchantKey.startsWith(k.split(" ")[0]));
      expect(hit, `${k} i ${names.join(", ")}`).toBe(true);
    }
    const salary = rec.find((r) => r.merchantKey.startsWith("lønn"))!;
    expect(salary.typicalAmount).toBe(38500);
    expect(salary.frequency).toBe("monthly");
    expect(salary.nextExpected).toBe("2026-11-25");
  });

  it("flagger abonnementer, men ikke husleie eller lønn", () => {
    const subs = rec.filter((r) => r.isSubscription);
    expect(subs.length).toBeGreaterThanOrEqual(4);
    expect(subs.some((r) => r.merchantKey.startsWith("netflix"))).toBe(true);
    expect(rec.find((r) => r.merchantKey.startsWith("lønn"))!.isSubscription).toBe(false);
  });

  it("dagligvarekjøp med varierende beløp er ikke «gjentakende»", () => {
    expect(names.some((n) => n.startsWith("kiwi") || n.startsWith("rema"))).toBe(false);
  });

  it("månedlig ekvivalent", () => {
    expect(monthlyEquivalent(-1200, "yearly")).toBe(100);
    expect(monthlyEquivalent(-300, "quarterly")).toBe(100);
    expect(monthlyEquivalent(-100, "monthly")).toBe(100);
  });
});

function asRecurring(txsIn: TxLite[]): RecurringTransaction[] {
  return detectRecurring(txsIn, lk, TODAY).map((r, i) => ({
    id: `r${i}`, merchant_key: r.merchantKey, display_name: r.displayName, category_id: r.categoryId, subcategory_id: r.subcategoryId,
    typical_amount: r.typicalAmount, frequency: r.frequency, occurrences: r.occurrences, first_seen: r.firstSeen, last_seen: r.lastSeen,
    next_expected: r.nextExpected, is_subscription: r.isSubscription, status: r.status,
  }));
}

describe("prognose", () => {
  const recurring = asRecurring(txs.map(lite));
  const key = monthKeyOf(TODAY);
  const f = forecastMonth({ txs: txs.map(lite), lk, monthKey: key, today: TODAY, recurring });

  it("regner med forventet lønn og gjenstående faste utgifter", () => {
    expect(f.isCurrent).toBe(true);
    expect(f.elapsedDays).toBe(8);
    expect(f.expectedIncomeRemaining).toBe(38500);
    expect(f.projectedIncome).toBeCloseTo(f.incomeSoFar + 38500, 2);
    expect(f.projectedExpenses).toBeGreaterThan(f.expensesSoFar);
    expect(f.projectedAvailable).toBeCloseTo(f.projectedIncome - f.projectedExpenses - f.projectedSavings, 1);
  });

  it("«tilgjengelig nå» regner med kjent forventet lønn", () => {
    expect(f.incomeSoFar).toBe(0);
    expect(f.availableNow).toBeCloseTo(38500 - f.expensesSoFar - f.savingsSoFar, 2);
    expect(f.availableNow).toBeGreaterThan(0);
  });

  it("prognosen ligger i nærheten av en typisk måned (±40 %)", () => {
    const prev = totals(inMonth(txs, addMonths(key, -1)).map(lite), lk);
    expect(f.projectedExpenses).toBeGreaterThan(prev.expenses * 0.6);
    expect(f.projectedExpenses).toBeLessThan(prev.expenses * 1.4);
  });

  it("bygger på historikk, og avsluttede måneder er faktiske tall", () => {
    expect(f.basisMonths).toBe(3);
    expect(f.confidence).toBe("high");
    const past = forecastMonth({ txs: txs.map(lite), lk, monthKey: addMonths(key, -1), today: TODAY, recurring });
    expect(past.isCurrent).toBe(false);
    expect(past.projectedExpenses).toBe(past.expensesSoFar);
    expect(past.confidence).toBe("high");
  });

  it("siste dag i måneden er prognosen lik faktisk", () => {
    const end = forecastMonth({ txs: txs.map(lite), lk, monthKey: key, today: "2026-11-30", recurring: [] });
    expect(end.variableRemaining).toBe(0);
  });
});

describe("budsjett", () => {
  const budget: Budget = { id: "b1", period_type: "month", period_start: "2026-10-01", planned_income: 38500, is_demo: true };
  const lines: BudgetCategory[] = [
    { id: "l1", budget_id: "b1", category_id: "cat-dagligvarer", amount: 8000 },
    { id: "l2", budget_id: "b1", category_id: "cat-restaurant", amount: 1 },
  ];

  it("statusgrenser", () => {
    expect(statusOf(1000, 500)).toBe("ok");
    expect(statusOf(1000, 850)).toBe("warn");
    expect(statusOf(1000, 1000)).toBe("warn");
    expect(statusOf(1000, 1001)).toBe("over");
    expect(statusOf(0, 0)).toBe("none");
  });

  it("arver forrige budsjett når perioden mangler eget", () => {
    const r = resolveBudget([budget], lines, "month", "2026-11-01");
    expect(r.inheritedFrom).toBe("2026-10-01");
    expect(r.plan.get("cat-dagligvarer")).toBe(8000);
    expect(resolveBudget([budget], lines, "month", "2026-10-01").inheritedFrom).toBeNull();
    expect(resolveBudget([budget], lines, "month", "2026-09-01").budget).toBeNull();
    expect(resolveBudget([budget], lines, "week", "2026-11-02").budget).toBeNull();
  });

  it("beregner brukt, gjenstår og overskredet", () => {
    const view = buildBudgetView([budget], lines, "month", "2026-10-01", txs.map(lite), lk);
    const rest = view.lines.find((l) => l.categoryId === "cat-restaurant")!;
    expect(rest.status).toBe("over");
    expect(rest.remaining).toBeLessThan(0);
    const dagl = view.lines.find((l) => l.categoryId === "cat-dagligvarer")!;
    expect(dagl.spent).toBeGreaterThan(2000);
    expect(dagl.remaining).toBeCloseTo(8000 - dagl.spent, 2);
    expect(view.totalPlanned).toBe(8001);
    expect(view.unbudgeted.some((u) => u.categoryId === "cat-bolig")).toBe(true);
  });

  it("ukentlig budsjett bruker mandag–søndag", () => {
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // søndag → mandag samme uke
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    const wk: Budget = { id: "w1", period_type: "week", period_start: "2026-11-02", planned_income: null, is_demo: false };
    const view = buildBudgetView([wk], [{ id: "wl", budget_id: "w1", category_id: "cat-bolig", amount: 20000 }], "week", "2026-11-02", txs.map(lite), lk);
    const expected = spendByCategory(txs.filter((t) => t.booked_date >= "2026-11-02" && t.booked_date <= "2026-11-08").map(lite), lk).find((s) => s.categoryId === "cat-bolig")!.amount;
    expect(view.lines[0].spent).toBe(expected);
    expect(view.lines[0].spent).toBeGreaterThan(0);
    // 1. november 2026 er en søndag og hører til forrige uke – husleien skal ikke telle her
    expect(view.lines[0].spent).toBeLessThan(12500);
  });

  it("tempoprognose er null tidlig i perioden", () => {
    expect(paceProjection(1000, "2026-11-01", "2026-11-30", "2026-11-03")).toBeNull();
    expect(paceProjection(1500, "2026-11-01", "2026-11-30", "2026-11-15")?.projected).toBe(3000);
  });
});

describe("budsjettforslag", () => {
  it("foreslår realistiske beløp ut fra seks hele måneder", () => {
    const r = suggestBudget(txs.map(lite), lk, TODAY);
    expect(r.months).toHaveLength(6);
    expect(r.usedPartialMonth).toBe(false);
    const bolig = r.suggestions.find((s) => s.categoryId === "cat-bolig")!;
    expect(bolig.suggested).toBeGreaterThanOrEqual(13500);
    expect(bolig.suggested).toBeLessThan(16500);
    expect(bolig.confidence).toBe("high");
    expect(r.suggestions.length).toBeGreaterThanOrEqual(6);
    expect(r.suggestedIncome).toBeGreaterThanOrEqual(38500);
    // Alle forslag er "pene" tall
    for (const s of r.suggestions) expect(s.suggested % 50).toBe(0);
  });

  it("faller tilbake til inneværende måned med lav sikkerhet, og gir ingenting uten data", () => {
    const onlyThisMonth = txs.filter((t) => t.booked_date.startsWith("2026-11")).map(lite);
    const r = suggestBudget(onlyThisMonth, lk, TODAY);
    expect(r.usedPartialMonth).toBe(true);
    expect(r.suggestions.every((s) => s.confidence === "low")).toBe(true);
    expect(suggestBudget([], lk, TODAY).suggestions).toEqual([]);
  });
});

describe("innsikter", () => {
  const recurring = asRecurring(txs.map(lite));
  const key = monthKeyOf(TODAY);
  const forecast = forecastMonth({ txs: txs.map(lite), lk, monthKey: key, today: TODAY, recurring });
  const budgetLines: BudgetCategory[] = [
    { id: "a", budget_id: "b", category_id: "cat-bolig", amount: 15500 },
    { id: "b", budget_id: "b", category_id: "cat-dagligvarer", amount: 6000 },
    { id: "c", budget_id: "b", category_id: "cat-restaurant", amount: 2000 },
    { id: "d", budget_id: "b", category_id: "cat-shopping", amount: 2500 },
    { id: "e", budget_id: "b", category_id: "cat-transport", amount: 3000 },
  ];
  const budget = buildBudgetView([{ id: "b", period_type: "month", period_start: "2026-11-01", planned_income: null, is_demo: true }], budgetLines, "month", "2026-11-01", txs.map(lite), lk);
  const insights = generateInsights({ txs: txs.map(lite), lk, today: TODAY, recurring, budget, forecast });

  it("lager konkrete innsikter med norske, vennlige formuleringer", () => {
    expect(insights.length).toBeGreaterThanOrEqual(4);
    const kinds = insights.map((i) => i.kind);
    expect(kinds).toContain("budget_left");
    expect(kinds).toContain("forecast_balance");
    expect(kinds).toContain("subscriptions");
    const subs = insights.find((i) => i.kind === "subscriptions")!;
    expect(subs.title).toMatch(/^Du har \d+ abonnementer som samlet koster [\d\s]+kr i måneden$/);
    for (const i of insights) {
      expect(i.title.length).toBeLessThanOrEqual(200);
      expect(i.body.length).toBeLessThanOrEqual(600);
      expect(i.key).toContain(":");
    }
  });

  it("nøkler er unike og sorteringen er stabil", () => {
    const keys = insights.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const sorts = insights.map((i) => i.sort);
    expect([...sorts].sort((a, b) => a - b)).toEqual(sorts);
  });

  it("sier ingenting bastant med for lite data (kun én måned)", () => {
    const oneMonth = txs.filter((t) => t.booked_date.startsWith("2026-11")).map(lite);
    const rec = detectRecurring(oneMonth, lk, TODAY).map((r, i) => ({
      id: `r${i}`, merchant_key: r.merchantKey, display_name: r.displayName, category_id: r.categoryId, subcategory_id: r.subcategoryId,
      typical_amount: r.typicalAmount, frequency: r.frequency, occurrences: r.occurrences, first_seen: r.firstSeen, last_seen: r.lastSeen,
      next_expected: r.nextExpected, is_subscription: r.isSubscription, status: r.status,
    })) as RecurringTransaction[];
    const f = forecastMonth({ txs: oneMonth, lk, monthKey: key, today: TODAY, recurring: rec });
    const few = generateInsights({ txs: oneMonth, lk, today: TODAY, recurring: rec, budget: null, forecast: f });
    const kinds = few.map((i) => i.kind);
    for (const needsHistory of ["takeaway_avg", "saving_potential", "savings_rate", "category_trend", "subscriptions", "unusual_expense"]) {
      expect(kinds).not.toContain(needsHistory);
    }
    expect(generateInsights({ txs: [], lk, today: TODAY, recurring: [], budget: null, forecast: f })).toEqual([]);
  });

  it("gir sparetips med konkret årlig beløp når det er nok data", () => {
    const tip = insights.find((i) => i.kind === "saving_potential");
    expect(tip).toBeDefined();
    expect(tip!.title).toMatch(/kan du spare [\d\s]+kr i året/);
  });

  it("oppdager uvanlig stort kjøp", () => {
    const big = insights.find((i) => i.kind === "unusual_expense");
    expect(big?.title).toMatch(/Ikea/i);
  });
});

describe("sparemål", () => {
  const base = { target_amount: 25000, current_amount: 9200, monthly_contribution: 2500, target_date: null as string | null };

  it("estimerer måldato", () => {
    const p = goalProgress(base, "2026-11-08");
    expect(p.remaining).toBe(15800);
    expect(p.monthsToGo).toBe(7);
    expect(p.estimatedDate).toBe("2027-06-08");
    expect(p.ratio).toBeCloseTo(0.368, 3);
    expect(p.status).toBe("on_track");
  });

  it("sier fra når man ligger bak måldatoen", () => {
    const behind = goalProgress({ ...base, target_date: "2027-02-01" }, "2026-11-08");
    expect(behind.status).toBe("behind");
    expect(behind.requiredMonthly).toBeGreaterThan(2500);
    expect(goalProgress({ ...base, target_date: "2027-12-01" }, "2026-11-08").status).toBe("on_track");
  });

  it("håndterer fullført mål og manglende plan", () => {
    expect(goalProgress({ ...base, current_amount: 25000 }, "2026-11-08").status).toBe("done");
    expect(goalProgress({ ...base, monthly_contribution: 0 }, "2026-11-08")).toMatchObject({ status: "no_plan", monthsToGo: null, estimatedDate: null });
  });

  it("finner milepæler", () => {
    expect(crossedMilestone(1000, 100, 200)).toBeNull();
    expect(crossedMilestone(1000, 200, 260)).toBe(25);
    expect(crossedMilestone(1000, 400, 800)).toBe(75);
    expect(crossedMilestone(1000, 900, 1000)).toBe(100);
  });
});

describe("datoer", () => {
  it("todayISO bruker norsk tidssone", () => {
    expect(todayISO(new Date("2026-11-07T23:30:00Z"))).toBe("2026-11-08");
    expect(todayISO(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
  });
  it("kontoer i fixtures", () => {
    expect(ACCOUNTS.map((a) => a.kind)).toEqual(["checking", "savings"]);
  });
});
