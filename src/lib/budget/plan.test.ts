import { describe, expect, it } from "vitest";
import { makeCategories } from "@/lib/testing/fixtures";
import { formatMoney } from "@/lib/format";
import { buildLookups, type BudgetPlanItem } from "@/lib/types";
import { buildDraft, draftIssues, draftLines, draftMonthly, draftPayload, formatAmountText, newCustomItem, parseAmountText, resolvePrompt } from "./draft";
import {
  allocation,
  categoryBudgetLines,
  expenseGroup,
  goalAdvice,
  groupAmountsForBudget,
  monthlyOf,
  planChecks,
  planTotals,
  realityCheck,
  savingSuggestions,
  type PlanLine,
  type PlanTotals,
} from "./plan";
import { ALL_PROMPTS, PROMPT_BY_SLOT } from "./templates";

const { categories, subcategories } = makeCategories();
const lk = buildLookups(categories, subcategories, []);
const cat = (key: string) => `cat-${key}`;
const sub = (key: string) => `sub-${key}`;
const kr = (n: number) => formatMoney(n);

const line = (p: Partial<PlanLine> & Pick<PlanLine, "kind" | "amount">): PlanLine => ({
  nature: "variable",
  categoryId: null,
  subcategoryId: null,
  frequency: "monthly",
  ...p,
});

describe("monthlyOf", () => {
  it("regner om til månedsbeløp i hele kroner", () => {
    expect(monthlyOf({ amount: 1500, frequency: "weekly" })).toBe(6500);
    expect(monthlyOf({ amount: 3100, frequency: "quarterly" })).toBe(1033);
    expect(monthlyOf({ amount: 12000, frequency: "yearly" })).toBe(1000);
    expect(monthlyOf({ amount: 6500, frequency: "yearly" })).toBe(542);
    expect(monthlyOf({ amount: 9990, frequency: "monthly" })).toBe(9990);
  });

  it("ugyldige beløp gir 0", () => {
    expect(monthlyOf({ amount: 0, frequency: "monthly" })).toBe(0);
    expect(monthlyOf({ amount: -5, frequency: "monthly" })).toBe(0);
    expect(monthlyOf({ amount: Number.NaN, frequency: "weekly" })).toBe(0);
  });
});

describe("expenseGroup", () => {
  it("skiller behov fra ønsker", () => {
    expect(expenseGroup("bolig")).toBe("need");
    expect(expenseGroup("dagligvarer")).toBe("need");
    expect(expenseGroup("okonomi")).toBe("need");
    expect(expenseGroup("restaurant")).toBe("want");
    expect(expenseGroup("fritid")).toBe("want");
    expect(expenseGroup("shopping")).toBe("want");
  });

  it("underkategorier kan overstyre kategorien", () => {
    expect(expenseGroup("abonnementer", "abonnementer.mobil")).toBe("need");
    expect(expenseGroup("abonnementer", "abonnementer.streaming")).toBe("want");
    expect(expenseGroup("transport", "transport.taxi")).toBe("want");
    expect(expenseGroup("transport", "transport.drivstoff")).toBe("need");
  });

  it("egne kategorier uten nøkkel regnes som ønsker", () => {
    expect(expenseGroup(null)).toBe("want");
    expect(expenseGroup(undefined)).toBe("want");
  });
});

describe("planTotals", () => {
  const lines: PlanLine[] = [
    // Inntekt
    line({ kind: "income", nature: "fixed", amount: 38000, categoryId: cat("inntekter"), subcategoryId: sub("inntekter.lonn") }),
    line({ kind: "income", nature: "fixed", amount: 1766, categoryId: cat("inntekter"), subcategoryId: sub("inntekter.stotte") }),
    // Faste
    line({ kind: "expense", nature: "fixed", amount: 12000, categoryId: cat("bolig"), subcategoryId: sub("bolig.husleie") }),
    line({ kind: "expense", nature: "fixed", amount: 1200, categoryId: cat("bolig"), subcategoryId: sub("bolig.strom") }),
    line({ kind: "expense", nature: "fixed", amount: 6000, frequency: "yearly", categoryId: cat("bolig"), subcategoryId: sub("bolig.forsikring") }),
    line({ kind: "expense", nature: "fixed", amount: 400, categoryId: cat("abonnementer"), subcategoryId: sub("abonnementer.mobil") }),
    line({ kind: "expense", nature: "fixed", amount: 300, categoryId: cat("abonnementer"), subcategoryId: sub("abonnementer.streaming") }),
    // Variable
    line({ kind: "expense", amount: 1500, frequency: "weekly", categoryId: cat("dagligvarer") }),
    line({ kind: "expense", amount: 1500, categoryId: cat("restaurant") }),
    line({ kind: "expense", amount: 1000, categoryId: cat("shopping") }),
    // Sparing
    line({ kind: "saving", nature: "fixed", amount: 4000, categoryId: cat("okonomi"), subcategoryId: sub("okonomi.sparing") }),
  ];
  const t = planTotals(lines, lk, 1000);

  it("summerer inntekt, faste og variable utgifter og sparing", () => {
    expect(t.income).toBe(39766);
    expect(t.fixed).toBe(14400);
    expect(t.variable).toBe(9000);
    expect(t.expenses).toBe(23400);
    expect(t.itemSaving).toBe(4000);
    expect(t.goalSaving).toBe(1000);
    expect(t.saving).toBe(5000);
    expect(t.leftover).toBe(39766 - 23400 - 5000);
  });

  it("fordeler utgiftene på behov og ønsker (og de går opp mot totalen)", () => {
    expect(t.groups).toEqual({ need: 20600, want: 2800, saving: 5000 });
    expect(t.groups.need + t.groups.want).toBe(t.expenses);
  });

  it("regner sparerate og kategorisummer", () => {
    expect(t.savingRate).toBeCloseTo(5000 / 39766, 6);
    expect(t.byCategory.get(cat("bolig"))).toBe(13700);
    expect(t.byCategory.get(cat("abonnementer"))).toBe(700);
    expect(t.byCategory.get(cat("dagligvarer"))).toBe(6500);
    expect(t.byCategory.has(cat("okonomi"))).toBe(false); // sparing er ikke et forbruk
    expect(t.byCategory.has(cat("inntekter"))).toBe(false);
  });

  it("budsjettlinjene er hele kroner, størst først, og summerer til utgiftene", () => {
    const rows = categoryBudgetLines(t);
    expect(rows[0]).toEqual({ categoryId: cat("bolig"), amount: 13700 });
    expect(rows.map((r) => r.amount)).toEqual([...rows.map((r) => r.amount)].sort((a, b) => b - a));
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBe(t.expenses);
  });

  it("tom plan og manglende inntekt gir nuller uten feil", () => {
    const empty = planTotals([], lk);
    expect(empty.income).toBe(0);
    expect(empty.leftover).toBe(0);
    expect(empty.savingRate).toBeNull();
    expect(categoryBudgetLines(empty)).toEqual([]);
  });

  it("ignorerer poster uten beløp", () => {
    const only = planTotals([line({ kind: "expense", amount: 0, categoryId: cat("bolig") }), line({ kind: "expense", amount: 500, categoryId: cat("bolig") })], lk);
    expect(only.expenses).toBe(500);
  });
});

describe("groupAmountsForBudget", () => {
  const lines = [
    { categoryId: cat("bolig"), amount: 12000 },
    { categoryId: cat("restaurant"), amount: 2000 },
    { categoryId: cat("dagligvarer"), amount: 5000 },
  ];

  it("uten plan avgjør kategorien alene", () => {
    expect(groupAmountsForBudget(lines, [], lk)).toEqual({ need: 17000, want: 2000 });
  });

  it("med plan brukes postenes fordeling ned på underkategori – samme tall som i byggeren", () => {
    const items = [
      { kind: "expense" as const, category_id: cat("abonnementer"), subcategory_id: sub("abonnementer.mobil"), amount: 400, frequency: "monthly" as const },
      { kind: "expense" as const, category_id: cat("abonnementer"), subcategory_id: sub("abonnementer.streaming"), amount: 300, frequency: "monthly" as const },
    ];
    const g = groupAmountsForBudget([{ categoryId: cat("abonnementer"), amount: 700 }], items, lk);
    expect(g).toEqual({ need: 400, want: 300 });
    // Byggeren regner det samme ut fra de samme postene
    const t = planTotals(
      items.map((i) => line({ kind: "expense", nature: "fixed", amount: i.amount, categoryId: i.category_id, subcategoryId: i.subcategory_id })),
      lk,
    );
    expect(t.groups.need).toBe(g.need);
    expect(t.groups.want).toBe(g.want);
  });

  it("har du justert linjen, skaleres fordelingen til beløpet", () => {
    const items = [
      { kind: "expense" as const, category_id: cat("abonnementer"), subcategory_id: sub("abonnementer.mobil"), amount: 400, frequency: "monthly" as const },
      { kind: "expense" as const, category_id: cat("abonnementer"), subcategory_id: sub("abonnementer.streaming"), amount: 400, frequency: "monthly" as const },
    ];
    expect(groupAmountsForBudget([{ categoryId: cat("abonnementer"), amount: 1000 }], items, lk)).toEqual({ need: 500, want: 500 });
  });

  it("summerer alltid til linjene", () => {
    const g = groupAmountsForBudget(lines, [], lk);
    expect(g.need + g.want).toBe(19000);
  });
});

describe("allocation", () => {
  it("deler inntekten i behov, ønsker, sparing og til overs", () => {
    const { segments, overspent } = allocation({ income: 40000, need: 20000, want: 10000, saving: 6000 });
    expect(overspent).toBe(0);
    expect(segments.map((s) => s.key)).toEqual(["need", "want", "saving", "leftover"]);
    expect(segments.map((s) => s.share)).toEqual([0.5, 0.25, 0.15, 0.1]);
    expect(segments.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1, 10);
  });

  it("planlegger du mer enn du tjener, er stolpen planen og overforbruket oppgis", () => {
    const { segments, overspent } = allocation({ income: 20000, need: 15000, want: 8000, saving: 2000 });
    expect(overspent).toBe(5000);
    expect(segments.find((s) => s.key === "leftover")).toBeUndefined();
    expect(segments.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1, 10);
  });

  it("uten noe å vise gir tom liste", () => {
    expect(allocation({ income: 0, need: 0, want: 0, saving: 0 }).segments).toEqual([]);
  });
});

describe("planChecks", () => {
  const base: PlanTotals = {
    income: 40000,
    fixed: 15000,
    variable: 8000,
    expenses: 23000,
    itemSaving: 6000,
    goalSaving: 0,
    saving: 6000,
    leftover: 11000,
    groups: { need: 18000, want: 5000, saving: 6000 },
    savingRate: 0.15,
    byCategory: new Map(),
  };
  const ids = (t: PlanTotals) => planChecks(t).map((c) => c.id);

  it("peker på penger uten jobb og tilbyr å sette dem av til sparing", () => {
    const c = planChecks(base).find((x) => x.id === "unallocated");
    expect(c?.action).toBe("leftover_to_saving");
    expect(c?.text).toContain(kr(11000));
  });

  it("advarer når planen går i minus", () => {
    const over = { ...base, leftover: -2500 };
    const c = planChecks(over).find((x) => x.id === "overspent");
    expect(c?.tone).toBe("bad");
    expect(c?.text).toContain(kr(2500));
    expect(ids(over)).not.toContain("unallocated");
  });

  it("sier fra når hver krone er fordelt", () => {
    expect(ids({ ...base, leftover: 300 })).toContain("balanced");
  });

  it("vurderer sparingen: ingen, lav og god", () => {
    expect(ids({ ...base, saving: 0, savingRate: 0 })).toContain("no-saving");
    expect(ids({ ...base, saving: 2000, savingRate: 0.05 })).toContain("low-saving");
    expect(ids(base)).toContain("saving-ok");
  });

  it("varsler om høye faste utgifter eller behov, men ikke begge samtidig", () => {
    const fixedHigh = { ...base, fixed: 27000, expenses: 31000, groups: { need: 28000, want: 3000, saving: 6000 } };
    expect(ids(fixedHigh)).toContain("fixed-high");
    expect(ids(fixedHigh)).not.toContain("needs-high");
    const needsHigh = { ...base, fixed: 12000, groups: { need: 26000, want: 3000, saving: 6000 } };
    expect(ids(needsHigh)).toContain("needs-high");
    expect(ids(needsHigh)).not.toContain("fixed-high");
  });

  it("uten inntekt får brukeren beskjed om å legge den inn", () => {
    const noIncome = { ...base, income: 0, savingRate: null, leftover: -29000 };
    expect(ids(noIncome)).toEqual(["no-income"]);
    expect(planChecks({ ...noIncome, expenses: 0, fixed: 0, variable: 0, saving: 0, itemSaving: 0, groups: { need: 0, want: 0, saving: 0 } })).toEqual([]);
  });
});

describe("savingSuggestions", () => {
  it("foreslår 10, 15 og 20 prosent", () => {
    expect(savingSuggestions(40000)).toEqual([
      { rate: 0.1, amount: 4000 },
      { rate: 0.15, amount: 6000 },
      { rate: 0.2, amount: 8000 },
    ]);
  });

  it("gir ingenting uten inntekt", () => {
    expect(savingSuggestions(0)).toEqual([]);
    expect(savingSuggestions(Number.NaN)).toEqual([]);
  });
});

describe("goalAdvice", () => {
  const goal = { target_amount: 60000, current_amount: 10000, target_date: "2027-11-01" };
  const today = "2026-11-08";

  it("uten månedlig beløp: sier hvor mye som kreves for å nå måldatoen", () => {
    const a = goalAdvice(goal, 0, today);
    expect(a.tone).toBe("info");
    expect(a.requiredMonthly).toBe(4167);
    expect(a.text).toContain("november 2027");
    expect(a.text).toContain(kr(4167));
  });

  it("i rute: når målet før måldatoen", () => {
    const a = goalAdvice(goal, 5000, today);
    expect(a.tone).toBe("good");
    expect(a.text).toContain("september 2027");
    expect(a.text).toContain("i tide");
  });

  it("på etterskudd: sier hva som kreves", () => {
    const a = goalAdvice(goal, 2000, today);
    expect(a.tone).toBe("warn");
    expect(a.text).toContain("etter november 2027");
    expect(a.text).toContain(kr(4167));
  });

  it("målet er nådd", () => {
    expect(goalAdvice({ ...goal, current_amount: 60000 }, 0, today).text).toBe("Målet er nådd.");
  });

  it("uten måldato: beskriver bare sparetakten", () => {
    const a = goalAdvice({ ...goal, target_date: null }, 5000, today);
    expect(a.tone).toBe("good");
    expect(a.requiredMonthly).toBeNull();
    expect(a.text).toContain("rundt");
    expect(goalAdvice({ ...goal, target_date: null }, 0, today).text).toContain("Legg inn et månedlig beløp");
  });
});

describe("realityCheck", () => {
  const history = { months: 3, average: { [cat("dagligvarer")]: 5600, [cat("restaurant")]: 2000, [cat("shopping")]: 1100, [cat("helse")]: 200 } };
  const planned = new Map([
    [cat("dagligvarer"), 3000],
    [cat("restaurant"), 5000],
    [cat("shopping"), 1000],
  ]);

  it("peker på kategorier der planen avviker tydelig fra vanlig forbruk, største avvik først", () => {
    const rows = realityCheck(planned, history);
    // restaurant: 3 000 over vanlig forbruk, dagligvarer: 2 600 under
    expect(rows.map((r) => [r.categoryId, r.level])).toEqual([
      [cat("restaurant"), "over"],
      [cat("dagligvarer"), "under"],
    ]);
    expect(rows[1]).toMatchObject({ planned: 3000, average: 5600 });
  });

  it("ignorerer småbeløp og kategorier uten avvik", () => {
    expect(realityCheck(planned, history).some((r) => r.categoryId === cat("helse") || r.categoryId === cat("shopping"))).toBe(false);
  });

  it("kategorier uten plan, men med forbruk, regnes som lavt budsjettert", () => {
    expect(realityCheck(new Map(), { months: 2, average: { [cat("dagligvarer")]: 5000 } })[0]).toMatchObject({ level: "under", planned: 0 });
  });

  it("krever minst to måneder med data", () => {
    expect(realityCheck(planned, null)).toEqual([]);
    expect(realityCheck(planned, { ...history, months: 1 })).toEqual([]);
  });
});

describe("parseAmountText", () => {
  it("leser norske beløp", () => {
    expect(parseAmountText("12 500")).toBe(12500);
    expect(parseAmountText("12500")).toBe(12500);
    expect(parseAmountText("1 250,50")).toBe(1250.5);
    expect(parseAmountText("900 kr")).toBe(900);
    expect(parseAmountText("")).toBe(0);
    expect(parseAmountText("  ")).toBe(0);
  });

  it("avviser ugyldige og negative beløp", () => {
    expect(parseAmountText("abc")).toBeNull();
    expect(parseAmountText("-100")).toBeNull();
    expect(parseAmountText("1e9")).toBeNull();
    expect(parseAmountText("100000000")).toBeNull();
  });
});

describe("formatAmountText", () => {
  it("gir tusenskille og leses tilbake uendret", () => {
    expect(formatAmountText(12000).replace(/\s/g, " ")).toBe("12 000");
    expect(formatAmountText(249.5)).toBe("249,5");
    for (const n of [0, 5, 999, 1000, 12345.67, 99_999_999]) expect(parseAmountText(formatAmountText(n))).toBe(n);
  });
});

describe("forslagsrader", () => {
  it("har unike nøkler, og alle peker på en kategori i standardsystemet", () => {
    expect(new Set(ALL_PROMPTS.map((p) => p.slot)).size).toBe(ALL_PROMPTS.length);
    expect(PROMPT_BY_SLOT.size).toBe(ALL_PROMPTS.length);
    for (const p of ALL_PROMPTS) {
      const r = resolvePrompt(p, categories, subcategories);
      expect(r, p.slot).not.toBeNull();
      if (p.subKey) expect(r?.subcategoryId, p.slot).toBe(sub(`${p.categoryKey}.${p.subKey}`));
    }
  });

  it("har riktig type: inntekt i inntektskategori, utgifter i utgiftskategorier, sparing som sparing", () => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    for (const p of ALL_PROMPTS) {
      const r = resolvePrompt(p, categories, subcategories);
      const c = byId.get(r!.categoryId)!;
      if (p.kind === "income") expect(c.kind, p.slot).toBe("income");
      else expect(c.kind, p.slot).toBe("expense");
      if (p.kind === "saving") expect(subcategories.find((s) => s.id === r!.subcategoryId)?.is_saving, p.slot).toBe(true);
    }
  });

  it("arkiverte kategorier brukes ikke", () => {
    const archived = categories.map((c) => (c.system_key === "bolig" ? { ...c, archived_at: "2026-01-01T00:00:00Z" } : c));
    expect(resolvePrompt({ categoryKey: "bolig" }, archived, subcategories)).toBeNull();
  });
});

describe("buildDraft", () => {
  const saved = (over: Partial<BudgetPlanItem> & Pick<BudgetPlanItem, "id" | "kind" | "name" | "amount">): BudgetPlanItem => ({
    nature: "fixed",
    slot: null,
    category_id: null,
    subcategory_id: null,
    frequency: "monthly",
    sort_order: 0,
    ...over,
  });

  it("uten noe lagret: alle forslagsrader med tomme beløp", () => {
    const { draft, importedFromBudget } = buildDraft({ items: [], categories, subcategories });
    expect(draft).toHaveLength(ALL_PROMPTS.length);
    expect(draft.every((d) => d.amount === "" && d.id === null && !d.custom)).toBe(true);
    expect(importedFromBudget).toBe(false);
    expect(draft.find((d) => d.slot === "bolig.kommunale-avgifter")?.frequency).toBe("quarterly");
  });

  it("fyller ut lagrede poster og tar med egne poster", () => {
    const items = [
      saved({ id: "i1", kind: "expense", name: "Husleie", slot: "bolig.husleie", category_id: cat("bolig"), subcategory_id: sub("bolig.husleie"), amount: 12000 }),
      saved({ id: "i2", kind: "expense", name: "Bilvask", category_id: cat("transport"), amount: 249.5, frequency: "yearly" }),
    ];
    const { draft } = buildDraft({ items, categories, subcategories });
    const husleie = draft.find((d) => d.slot === "bolig.husleie")!;
    expect(husleie).toMatchObject({ id: "i1", amount: formatAmountText(12000), custom: false });
    const own = draft.find((d) => d.id === "i2")!;
    expect(own).toMatchObject({ custom: true, name: "Bilvask", amount: "249,5", frequency: "yearly", slot: null });
    expect(draft).toHaveLength(ALL_PROMPTS.length + 1);
  });

  it("henter utgangspunkt fra et eksisterende budsjett når det ikke finnes noen plan", () => {
    const { draft, importedFromBudget } = buildDraft({
      items: [],
      categories,
      subcategories,
      fallback: { plannedIncome: 40000, lines: [{ categoryId: cat("dagligvarer"), amount: 5000 }, { categoryId: cat("bolig"), amount: 14000 }] },
    });
    expect(importedFromBudget).toBe(true);
    expect(draft.find((d) => d.slot === "inntekter.lonn")?.amount).toBe(formatAmountText(40000));
    expect(draft.find((d) => d.slot === "var.dagligvarer")?.amount).toBe(formatAmountText(5000));
    const bolig = draft.find((d) => d.categoryId === cat("bolig") && d.custom);
    expect(bolig).toMatchObject({ name: "Bolig (fra budsjettet ditt)", amount: formatAmountText(14000), nature: "fixed", kind: "expense" });
  });

  it("bruker ikke utgangspunktet fra budsjettet når planen allerede finnes", () => {
    const items = [saved({ id: "i1", kind: "income", name: "Lønn etter skatt", slot: "inntekter.lonn", amount: 30000 })];
    const { draft, importedFromBudget } = buildDraft({ items, categories, subcategories, fallback: { plannedIncome: 99999, lines: [] } });
    expect(importedFromBudget).toBe(false);
    expect(draft.find((d) => d.slot === "inntekter.lonn")?.amount).toBe(formatAmountText(30000));
  });
});

describe("kladd → beregning og lagring", () => {
  const { draft } = buildDraft({ items: [], categories, subcategories });
  const set = (slot: string, amount: string, frequency?: PlanLine["frequency"]) => {
    const d = draft.find((x) => x.slot === slot)!;
    d.amount = amount;
    if (frequency) d.frequency = frequency;
  };

  it("teller bare poster med gyldig beløp", () => {
    set("inntekter.lonn", "38 000");
    set("var.dagligvarer", "1 500", "weekly");
    set("bolig.husleie", "abc");
    const lines = draftLines(draft);
    expect(lines).toHaveLength(2);
    const t = planTotals(lines, lk);
    expect(t.income).toBe(38000);
    expect(t.variable).toBe(6500);
    expect(draftMonthly(draft.find((d) => d.slot === "var.dagligvarer")!)).toBe(6500);
  });

  it("finner feil som hindrer lagring", () => {
    const custom = newCustomItem("new-1", "expense", "fixed");
    custom.amount = "500";
    const issues = draftIssues([...draft, custom]);
    expect(issues["bolig.husleie"]).toBe("Skriv et gyldig beløp");
    expect(issues["new-1"]).toBe("Gi posten et navn");
    custom.name = "Parkering";
    expect(draftIssues([...draft, custom])["new-1"]).toBe("Velg en kategori");
    custom.categoryId = cat("transport");
    expect(draftIssues([...draft, custom])["new-1"]).toBeUndefined();
  });

  it("sender kun poster med beløp til serveren, i rekkefølge", () => {
    draft.find((d) => d.slot === "bolig.husleie")!.amount = "12000";
    const payload = draftPayload(draft);
    expect(payload.map((p) => p.slot)).toEqual(["inntekter.lonn", "bolig.husleie", "var.dagligvarer"]);
    expect(payload.every((p) => p.amount > 0)).toBe(true);
    expect(payload[0].sortOrder).toBeLessThan(payload[1].sortOrder);
  });
});
