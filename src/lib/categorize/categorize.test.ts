import { describe, expect, it } from "vitest";
import { DEFAULT_TAXONOMY, subKey } from "@/lib/categories/defaults";
import type { CategorizationRule, Category, Subcategory } from "@/lib/types";
import { aiCategorize, amountBand, buildAiCatalog, sanitizeForAi } from "./ai";
import { AUTO_THRESHOLD, Catalog, categorize, ruleFromChoice, statusFor, type EngineContext } from "./engine";
import { findTransferPairs } from "./transfers";

function makeCatalog() {
  const categories: Category[] = [];
  const subcategories: Subcategory[] = [];
  DEFAULT_TAXONOMY.forEach((c, ci) => {
    categories.push({ id: `cat-${c.key}`, system_key: c.key, name: c.name, icon: c.icon, color: c.color, kind: c.kind, sort_order: ci, archived_at: null });
    c.subs.forEach((s, si) =>
      subcategories.push({ id: `sub-${subKey(c.key, s.key)}`, category_id: `cat-${c.key}`, system_key: subKey(c.key, s.key), name: s.name, is_saving: !!s.saving, sort_order: si }),
    );
  });
  return new Catalog(categories, subcategories);
}

const catalog = makeCatalog();
const ctx = (over: Partial<EngineContext> = {}): EngineContext => ({ catalog, rules: [], history: new Map(), ...over });
const sub = (key: string) => `sub-${key}`;

describe("eksempeltabellen fra spesifikasjonen", () => {
  const cases: Array<[string, number, string]> = [
    ["REMA 1000", -845, "dagligvarer.matbutikk"],
    ["KIWI", -320, "dagligvarer.matbutikk"],
    ["Circle K", -650, "transport.drivstoff"],
    ["Netflix", -149, "abonnementer.streaming"],
    ["IKEA", -1299, "shopping.mobler"],
    ["STRØM", -1150, "bolig.strom"],
    ["LØNN", 32000, "inntekter.lonn"],
  ];
  it.each(cases)("%s (%s kr) → %s, godkjennes automatisk", (text, amount, expected) => {
    const s = categorize({ description: text, amount }, ctx());
    expect(s.subcategoryId).toBe(sub(expected));
    expect(s.confidence).toBeGreaterThanOrEqual(AUTO_THRESHOLD);
    expect(statusFor(s.confidence)).toBe("auto");
  });
});

describe("rekkefølge: regler → historikk → butikk → nøkkelord → standard", () => {
  const rule = (over: Partial<CategorizationRule>): CategorizationRule => ({
    id: "r1",
    pattern: "rema 1000",
    match_type: "contains",
    direction: "any",
    category_id: "cat-shopping",
    subcategory_id: null,
    mark_transfer: false,
    source: "user",
    priority: 100,
    hit_count: 0,
    created_at: "",
    ...over,
  });

  it("brukerregel slår butikkregisteret («REMA 1000» fra Diverse til Dagligvarer huskes)", () => {
    const s = categorize({ description: "Varekjøp REMA 1000 GRØNLAND", amount: -100 }, ctx({ rules: [rule({ category_id: "cat-diverse" })] }));
    expect(s.source).toBe("rule");
    expect(s.categoryId).toBe("cat-diverse");
    expect(s.confidence).toBe(0.99);
    expect(s.ruleId).toBe("r1");
  });

  it("brukerregel respekterer retning", () => {
    const r = rule({ direction: "in" });
    expect(categorize({ description: "REMA 1000", amount: -100 }, ctx({ rules: [r] })).source).toBe("merchant");
    expect(categorize({ description: "REMA 1000", amount: 100 }, ctx({ rules: [r] })).source).toBe("rule");
  });

  it("historikk brukes når ingen regel finnes, og slår butikkregisteret", () => {
    const history = new Map([["rema 1000", [{ categoryId: "cat-diverse", subcategoryId: null, count: 3 }]]]);
    const s = categorize({ description: "REMA 1000 SENTRUM", amount: -100 }, ctx({ history }));
    expect(s.source).toBe("history");
    expect(s.categoryId).toBe("cat-diverse");
    expect(s.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("splittet historikk gir lav konfidens og sendes til godkjenning", () => {
    const history = new Map([
      [
        "bakeriet oslo",
        [
          { categoryId: "cat-restaurant", subcategoryId: null, count: 3 },
          { categoryId: "cat-dagligvarer", subcategoryId: null, count: 2 },
        ],
      ],
    ]);
    const s = categorize({ description: "Bakeriet Oslo", amount: -80 }, ctx({ history }));
    expect(s.source).toBe("history");
    expect(statusFor(s.confidence)).toBe("review");
  });

  it("ikke-troverdig historikk (under 60 % enighet) ignoreres", () => {
    const history = new Map([
      [
        "kiwi 505",
        [
          { categoryId: "cat-shopping", subcategoryId: null, count: 1 },
          { categoryId: "cat-fritid", subcategoryId: null, count: 1 },
        ],
      ],
    ]);
    expect(categorize({ description: "Kiwi 505", amount: -50 }, ctx({ history })).source).toBe("merchant");
  });

  it("nøkkelord brukes når butikken er ukjent", () => {
    const s = categorize({ description: "Husleie november", amount: -12000 }, ctx());
    expect(s.source).toBe("keyword");
    expect(s.subcategoryId).toBe(sub("bolig.husleie"));
  });

  it("ukjent transaksjon får standardkategori, null konfidens og forklaring", () => {
    const out = categorize({ description: "XQZ Holding 77", amount: -500 }, ctx());
    expect(out.source).toBe("default");
    expect(out.confidence).toBe(0);
    expect(out.subcategoryId).toBe(sub("diverse.ukategorisert"));
    const inn = categorize({ description: "XQZ Holding 77", amount: 500 }, ctx());
    expect(inn.subcategoryId).toBe(sub("inntekter.andre"));
    expect(statusFor(inn.confidence)).toBe("review");
  });

  it("Vipps til privatperson forklares og sendes til godkjenning", () => {
    const s = categorize({ description: "Vipps Ola Nordmann", amount: -250 }, ctx());
    expect(s.confidence).toBe(0);
    expect(s.reason).toMatch(/privatperson/);
  });
});

describe("butikkregisteret", () => {
  it("lengste mønster vinner (Uber Eats ≠ Uber, kiwi.com ≠ KIWI)", () => {
    expect(categorize({ description: "UBER EATS HELP.UBER.COM", amount: -300 }, ctx()).subcategoryId).toBe(sub("restaurant.leveringstjenester"));
    expect(categorize({ description: "UBER *TRIP", amount: -200 }, ctx()).subcategoryId).toBe(sub("transport.taxi"));
    expect(categorize({ description: "Kiwi.com Booking", amount: -2000 }, ctx()).subcategoryId).toBe(sub("fritid.reiser"));
    expect(categorize({ description: "KIWI 505 BARCODE", amount: -200 }, ctx()).subcategoryId).toBe(sub("dagligvarer.matbutikk"));
  });

  it("matcher på ordgrenser, ikke inni andre ord", () => {
    // «spar» skal ikke treffe «Sparebank» eller «sparing»
    const s = categorize({ description: "Sparebank 1 gebyr", amount: -50 }, ctx());
    expect(s.merchantName).toBeNull();
  });

  it("flagger abonnementer", () => {
    expect(categorize({ description: "SPOTIFY P1234", amount: -119 }, ctx()).isSubscription).toBe(true);
    expect(categorize({ description: "REMA 1000", amount: -119 }, ctx()).isSubscription).toBe(false);
  });

  it("retningsavhengige treff (Lånekassen)", () => {
    expect(categorize({ description: "Lånekassen", amount: 9000 }, ctx()).subcategoryId).toBe(sub("inntekter.stotte"));
    expect(categorize({ description: "Lånekassen", amount: -1500 }, ctx()).subcategoryId).toBe(sub("okonomi.gjeldsnedbetaling"));
  });

  it("hopper videre hvis kategorien er slettet av brukeren", () => {
    const c = new Catalog(
      catalog.categories.filter((x) => x.system_key !== "dagligvarer"),
      catalog.subcategories.filter((x) => !x.system_key?.startsWith("dagligvarer.")),
    );
    const s = categorize({ description: "REMA 1000", amount: -100 }, { catalog: c, rules: [], history: new Map() });
    expect(s.source).not.toBe("merchant");
  });
});

describe("refusjoner og overføringer", () => {
  it("positivt beløp hos en butikk er en tilbakebetaling – ikke inntekt", () => {
    const s = categorize({ description: "REMA 1000 retur", amount: 129 }, ctx());
    expect(s.categoryId).toBe("cat-dagligvarer");
    expect(s.isRefund).toBe(true);
    expect(categorize({ description: "REMA 1000", amount: -129 }, ctx()).isRefund).toBe(false);
  });

  it("lønn er ikke en refusjon", () => {
    expect(categorize({ description: "Lønn Acme AS", amount: 32000 }, ctx()).isRefund).toBe(false);
  });

  it("eksplisitt overføring mellom egne kontoer bekreftes automatisk", () => {
    const s = categorize({ description: "Overføring til egen konto", amount: -5000 }, ctx());
    expect(s.transfer).toBe("confirmed");
    expect(s.categoryId).toBeNull();
  });

  it("regel kan markere som overføring", () => {
    const rule: CategorizationRule = {
      id: "r2", pattern: "kredittkort dnb", match_type: "contains", direction: "any", category_id: null, subcategory_id: null,
      mark_transfer: true, source: "user", priority: 100, hit_count: 0, created_at: "",
    };
    expect(categorize({ description: "Betaling Kredittkort DNB", amount: -8000 }, ctx({ rules: [rule] })).transfer).toBe("confirmed");
  });
});

describe("læring", () => {
  it("lager regel av valg, men ikke av for korte nøkler", () => {
    expect(ruleFromChoice("rema 1000", { categoryId: "cat-dagligvarer", subcategoryId: null })).toMatchObject({
      pattern: "rema 1000",
      match_type: "contains",
    });
    expect(ruleFromChoice("ab", { categoryId: "cat-dagligvarer", subcategoryId: null })).toBeNull();
    expect(ruleFromChoice("rema 1000", { categoryId: null, subcategoryId: null })).toBeNull();
  });
});

describe("overføringspar", () => {
  const tx = (id: string, accountId: string, date: string, amount: number, description = "X") => ({ id, accountId, date, amount, description });

  it("parer like store, motsatte beløp på ulike kontoer innen 2 dager", () => {
    const fresh = [tx("a", "A", "2026-11-01", -5000, "Overføring til sparekonto"), tx("b", "B", "2026-11-02", 5000, "Fra brukskonto")];
    const pairs = findTransferPairs(fresh, fresh);
    expect(pairs).toEqual([{ outId: "a", inId: "b", strong: true }]);
  });

  it("parer ikke samme konto, for stor datoavstand eller ulike beløp", () => {
    expect(findTransferPairs([tx("a", "A", "2026-11-01", -500), tx("b", "A", "2026-11-01", 500)], [tx("a", "A", "2026-11-01", -500), tx("b", "A", "2026-11-01", 500)])).toEqual([]);
    expect(findTransferPairs([tx("a", "A", "2026-11-01", -500)], [tx("b", "B", "2026-11-09", 500)])).toEqual([]);
    expect(findTransferPairs([tx("a", "A", "2026-11-01", -500)], [tx("b", "B", "2026-11-01", 501)])).toEqual([]);
  });

  it("hopper over tvetydige treff og merker svake par som ikke-sikre", () => {
    const pool = [tx("b1", "B", "2026-11-01", 500), tx("b2", "B", "2026-11-02", 500)];
    expect(findTransferPairs([tx("a", "A", "2026-11-01", -500)], pool)).toEqual([]);
    const weak = findTransferPairs([tx("a", "A", "2026-11-01", -500, "Vipps Kari")], [tx("b", "B", "2026-11-01", 500, "Vipps Per")]);
    expect(weak).toEqual([{ outId: "a", inId: "b", strong: false }]);
  });
});

describe("AI – personvern og validering", () => {
  it("fjerner personopplysninger før AI-kall", () => {
    expect(sanitizeForAi("Betaling ola@example.com 98765432 konto 12345678901 Kiwi")).toBe("Betaling konto Kiwi");
    expect(sanitizeForAi("NO9386011117947 Rema 1000 Grønland")).toBe("Rema 1000 Grønland");
    expect(sanitizeForAi("x".repeat(200)).length).toBe(60);
    expect(amountBand(-45)).toBe("under 100 kr");
    expect(amountBand(1299)).toBe("500–2 000 kr");
  });

  const aiCat = buildAiCatalog(catalog);

  function fakeFetch(content: unknown, ok = true): typeof fetch {
    return (async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    })) as unknown as typeof fetch;
  }

  it("gir kort kodeliste uten UUID-er", () => {
    expect(aiCat.entries[0]).toEqual({ code: "c1", label: "Bolig" });
    expect(aiCat.entries.find((e) => e.label === "Transport › Drivstoff")?.code).toMatch(/^c3\.s\d$/);
  });

  it("godtar gyldige svar, kapper konfidens og forkaster ukjente koder/ider", async () => {
    const drivstoff = aiCat.entries.find((e) => e.label === "Transport › Drivstoff")!.code;
    const out = await aiCategorize(
      [
        { id: "1", text: "Ukjent bensinstasjon", direction: "out", band: "100–500 kr" },
        { id: "2", text: "Hallo", direction: "out", band: "under 100 kr" },
        { id: "3", text: "Noe", direction: "out", band: "under 100 kr" },
      ],
      aiCat,
      {
        apiKey: "test",
        model: "test",
        fetchImpl: fakeFetch({
          results: [
            { id: "1", code: drivstoff, confidence: 0.99, is_subscription: false, is_internal_transfer: false },
            { id: "2", code: "c99.s1", confidence: 0.9, is_subscription: false, is_internal_transfer: false }, // finnes ikke
            { id: "999", code: drivstoff, confidence: 0.9, is_subscription: false, is_internal_transfer: false }, // ukjent id
            { id: "3", code: null, confidence: 0.1, is_subscription: false, is_internal_transfer: false }, // usikker
          ],
        }),
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("1");
    expect(out[0].confidence).toBe(0.9);
    expect(out[0].ref.subcategoryId).toBe(sub("transport.drivstoff"));
  });

  it("returnerer tomt ved ugyldig JSON-form, og kaster ved HTTP-feil", async () => {
    const items = [{ id: "1", text: "a", direction: "out" as const, band: "x" }];
    expect(await aiCategorize(items, aiCat, { apiKey: "k", model: "m", fetchImpl: fakeFetch({ nope: true }) })).toEqual([]);
    await expect(aiCategorize(items, aiCat, { apiKey: "k", model: "m", fetchImpl: fakeFetch({}, false) })).rejects.toThrow(/500/);
  });

  it("sender aldri dato, konto eller UUID i forespørselen", async () => {
    let body = "";
    const spy = (async (_url: string, init: RequestInit) => {
      body = String(init.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results: [] }) } }] }) };
    }) as unknown as typeof fetch;
    await aiCategorize([{ id: "1", text: "Kiwi", direction: "out", band: "under 100 kr" }], aiCat, { apiKey: "k", model: "m", fetchImpl: spy });
    expect(body).not.toMatch(/cat-|sub-|\d{4}-\d{2}-\d{2}|account_id/i);
    expect(body).toContain('"strict":true');
  });
});
