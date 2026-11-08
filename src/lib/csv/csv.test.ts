import { describe, expect, it } from "vitest";
import { detectMapping } from "./columns";
import { cleanDescription } from "./clean";
import { parseDate, detectDateOrder } from "./dates";
import { assignOccurrences, fingerprint } from "./fingerprint";
import { normalizeRows } from "./normalize";
import { detectDecimalSeparator, parseAmount } from "./numbers";
import { decodeBytes, ImportError, parseCsvBuffer, parseCsvText, validateFileMeta } from "./parse";

function run(csv: string) {
  const parsed = parseCsvText(csv);
  const det = detectMapping(parsed.headers, parsed.rows.map((r) => r.cells));
  const res = normalizeRows(parsed, det.mapping);
  return { parsed, det, res };
}

describe("parseAmount", () => {
  it.each([
    ["1 234,56", 1234.56],
    ["1 234,56", 1234.56],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["-845,00", -845],
    ["−845,00", -845],
    ["(845,00)", -845],
    ["845,00-", -845],
    ["+500", 500],
    ["kr 1 299", 1299],
    ["NOK -149,00", -149],
    ["1.234.567,89", 1234567.89],
    ["12.5", 12.5],
    ["0,5", 0.5],
  ])("%s → %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it("returnerer null for tekst og tomme verdier", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });

  it("bruker desimalhint for tvetydige verdier", () => {
    expect(parseAmount("1.234", ",")).toBe(1234);
    expect(parseAmount("1.234", ".")).toBe(1.23); // beløp avrundes til 2 desimaler
    expect(parseAmount("1,234", ".")).toBe(1234);
  });

  it("detekterer desimaltegn fra kolonnen", () => {
    expect(detectDecimalSeparator(["1,50", "20,00", "-3,25"])).toBe(",");
    expect(detectDecimalSeparator(["1.50", "20.00", "-3.25"])).toBe(".");
    expect(detectDecimalSeparator(["1,234.50", "20.00"])).toBe(".");
    expect(detectDecimalSeparator(["1.234,50", "20,00"])).toBe(",");
    expect(detectDecimalSeparator([])).toBe(",");
  });
});

describe("parseDate", () => {
  it.each([
    ["31.10.2026", "dmy", "2026-10-31"],
    ["31/10/2026", "dmy", "2026-10-31"],
    ["31-10-2026", "dmy", "2026-10-31"],
    ["31.10.26", "dmy", "2026-10-31"],
    ["2026-10-31", "dmy", "2026-10-31"],
    ["2026/10/31", "dmy", "2026-10-31"],
    ["20261031", "dmy", "2026-10-31"],
    ["10/31/2026", "mdy", "2026-10-31"],
    ["31.10.2026 14:32:10", "dmy", "2026-10-31"],
    ["2026-10-31T14:32:10", "dmy", "2026-10-31"],
  ] as const)("%s (%s) → %s", (input, order, expected) => {
    expect(parseDate(input, order)).toBe(expected);
  });

  it("avviser ugyldige datoer", () => {
    expect(parseDate("31.02.2026")).toBeNull();
    expect(parseDate("32.01.2026")).toBeNull();
    expect(parseDate("hei")).toBeNull();
    expect(parseDate("")).toBeNull();
  });

  it("detekterer rekkefølge", () => {
    expect(detectDateOrder(["31/10/2026", "01/11/2026"])).toBe("dmy");
    expect(detectDateOrder(["10/31/2026", "11/01/2026"])).toBe("mdy");
    expect(detectDateOrder(["2026-10-31"])).toBe("ymd");
    expect(detectDateOrder(["01/02/2026"])).toBe("dmy");
  });
});

describe("DNB-format", () => {
  const csv = [
    '"Dato";"Forklaring";"Rentedato";"Ut fra konto";"Inn på konto"',
    '"31.10.2026";"Varekjøp REMA 1000 GRØNLAND";"31.10.2026";"845,00";""',
    '"30.10.2026";"Lønn Acme AS";"30.10.2026";"";"32 000,00"',
    '"29.10.2026";"Netflix.com";"29.10.2026";"149,00";""',
    "",
  ].join("\n");

  it("gjenkjenner bank og kolonner", () => {
    const { det } = run(csv);
    expect(det.bank).toBe("DNB");
    expect(det.complete).toBe(true);
    expect(det.mapping.inCol).toBe(4);
    expect(det.mapping.outCol).toBe(3);
  });

  it("normaliserer inn/ut-kolonner til fortegn", () => {
    const { res } = run(csv);
    expect(res.issues).toEqual([]);
    expect(res.rows.map((r) => [r.date, r.amount])).toEqual([
      ["2026-10-31", -845],
      ["2026-10-30", 32000],
      ["2026-10-29", -149],
    ]);
    expect(res.rows[0].description).toBe("Varekjøp REMA 1000 GRØNLAND");
    expect(res.rows[0].raw["Ut fra konto"]).toBe("845,00");
  });
});

describe("SpareBank 1-format (avsluttende skilletegn)", () => {
  const csv = [
    "Dato;Beskrivelse;Rentedato;Inn;Ut;Til konto;Fra konto;",
    "31.10.2026;Kiwi 505 Barcode;31.10.2026;;320,00;;12345678901;",
    "30.10.2026;Fra Ola Nordmann;30.10.2026;1 500,00;;12345678901;;",
  ].join("\r\n");

  it("leser fil med trailing semikolon", () => {
    const { det, res } = run(csv);
    expect(det.bank).toBe("SpareBank 1");
    expect(res.rows.map((r) => r.amount)).toEqual([-320, 1500]);
    expect(res.rows[0].description).toBe("Kiwi 505 Barcode");
  });
});

describe("Nordea-format (slash-datoer, avsender/mottaker som kontonummer)", () => {
  const csv = [
    "Bokføringsdato;Beløp;Avsender;Mottaker;Navn;Tittel;Valuta;Betalingstype",
    "2026/10/31;-650,00;12345678901;;Circle K Ullevål;Kortkjøp;NOK;Visa",
    "2026/10/30;32000,00;98765432109;12345678901;Acme AS;Lønn;NOK;Overføring",
  ].join("\n");

  it("bruker navn + tittel og ignorerer kontonumre", () => {
    const { det, res } = run(csv);
    expect(det.bank).toBe("Nordea");
    expect(res.rows[0]).toMatchObject({ date: "2026-10-31", amount: -650, currency: "NOK" });
    expect(res.rows[0].description).toBe("Circle K Ullevål – Kortkjøp");
    expect(res.rows[1].description).toBe("Acme AS – Lønn");
    expect(res.rows[1].amount).toBe(32000);
  });
});

describe("Danske Bank-format (punktum som tusenskille, reserverte rader)", () => {
  const csv = [
    '"Dato";"Tekst";"Beløp";"Saldo";"Status";"Avstemt"',
    '"31.10.2026";"IKEA FURUSET";"-1.299,00";"12.345,67";"Bokført";"Nei"',
    '"31.10.2026";"APOTEK 1 MAJORSTUEN";"-129,00";"12.345,67";"Reservert";"Nei"',
  ].join("\n");

  it("tolker 1.299,00 riktig og hopper over reservert", () => {
    const { det, res } = run(csv);
    expect(det.bank).toBe("Danske Bank");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ amount: -1299, balance: 12345.67 });
    expect(res.skipped).toBe(1);
    expect(res.issues[0].message).toMatch(/reservert/i);
  });
});

describe("Generisk engelsk CSV", () => {
  const csv = ["Date,Description,Amount,Balance", '2026-10-31,"Spotify, AB",-119.00,"1,234.50"', "2026-10-30,Salary,32000.00,33000.00"].join("\n");
  it("håndterer komma som skilletegn, anførselstegn og punktum-desimal", () => {
    const { res } = run(csv);
    expect(res.decimal).toBe(".");
    expect(res.rows.map((r) => [r.description, r.amount, r.balance])).toEqual([
      ["Spotify, AB", -119, 1234.5],
      ["Salary", 32000, 33000],
    ]);
  });
});

describe("Fil uten overskrift og med metadata", () => {
  it("gjetter kolonner fra innhold", () => {
    const csv = ["31.10.2026;REMA 1000;-845,00", "30.10.2026;Lønn;32000,00", "29.10.2026;Netflix;-149,00"].join("\n");
    const { parsed, det, res } = run(csv);
    expect(parsed.hasHeader).toBe(false);
    expect(det.complete).toBe(true);
    expect(det.confidence).toBeLessThan(1);
    expect(res.rows).toHaveLength(3);
    expect(res.rows[0]).toMatchObject({ amount: -845, description: "REMA 1000" });
  });

  it("hopper over metadata før overskriften", () => {
    const csv = ["Kontoutskrift;;", "Konto: 1234.56.78901;;", "", "Dato;Beskrivelse;Beløp", "31.10.2026;Kiwi;-100,00"].join("\n");
    const { parsed, res } = run(csv);
    expect(parsed.preambleLines).toBe(3);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].amount).toBe(-100);
  });
});

describe("Feilhåndtering", () => {
  it("rapporterer ugyldige rader med linjenummer og importerer resten", () => {
    const csv = ["Dato;Beskrivelse;Beløp", "31.10.2026;Kiwi;-100,00", "ikke-dato;Rema;-50,00", "29.10.2026;Coop;abc", "28.10.2026;Null;0,00"].join("\n");
    const { res } = run(csv);
    expect(res.rows).toHaveLength(1);
    expect(res.skipped).toBe(3);
    const errors = res.issues.filter((i) => i.severity === "error");
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
  });

  it("validerer filtype og størrelse", () => {
    expect(() => validateFileMeta("bank.xlsx", 100)).toThrow(ImportError);
    expect(() => validateFileMeta("bank.csv", 0)).toThrow(ImportError);
    expect(() => validateFileMeta("bank.csv", 6 * 1024 * 1024)).toThrow(/for stor/);
    expect(() => validateFileMeta("bank.CSV", 1000)).not.toThrow();
  });

  it("avviser binærfiler", () => {
    const bin = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer;
    expect(() => decodeBytes(bin)).toThrow(/tekstfil/);
  });

  it("avviser for mange rader", () => {
    const lines = ["Dato;Beskrivelse;Beløp", ...Array.from({ length: 5001 }, () => "31.10.2026;X;-1,00")];
    expect(() => parseCsvText(lines.join("\n"))).toThrow(/Maks/);
  });
});

describe("Tegnsett", () => {
  it("leser ISO-8859-1/Windows-1252 (æøå) uten skade", () => {
    const text = "Dato;Forklaring;Ut fra konto;Inn på konto\n31.10.2026;Kjøp Bakeri Grønland;45,00;\n";
    const buf = Buffer.from(text, "latin1");
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const parsed = parseCsvBuffer(arrayBuf);
    expect(parsed.encoding).toBe("windows-1252");
    expect(parsed.headers).toContain("Inn på konto");
    expect(parsed.rows[0].cells[1]).toBe("Kjøp Bakeri Grønland");
  });

  it("fjerner BOM i UTF-8", () => {
    const buf = Buffer.from("﻿Dato;Beskrivelse;Beløp\n31.10.2026;Kiwi;-1,00\n", "utf8");
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const parsed = parseCsvBuffer(arrayBuf);
    expect(parsed.encoding).toBe("utf-8");
    expect(parsed.headers[0]).toBe("Dato");
  });
});

describe("cleanDescription", () => {
  it("fjerner bankstøy og lager stabil nøkkel", () => {
    const a = cleanDescription("Varekjøp REMA 1000 GRØNLAND 12.10 *1234 Kurs: 1.0000");
    expect(a.display).toBe("Rema 1000 Grønland");
    expect(a.key).toBe("rema 1000");
    const b = cleanDescription("VISA VAREKJØP 4567 REMA 1000 MAJORSTUEN 30.09");
    expect(b.key).toBe("rema 1000");
  });

  it("beholder korte tall som er del av navnet og fjerner lange referanser", () => {
    expect(cleanDescription("Kiwi 505 Barcode").key).toBe("kiwi 505");
    expect(cleanDescription("Avtalegiro Telenor KID 1234567890123").normalized).toBe("telenor");
  });

  it("faller tilbake til originalen hvis alt renses bort", () => {
    expect(cleanDescription("12345678").normalized.length).toBeGreaterThan(0);
  });
});

describe("duplikatkontroll", () => {
  it("fingeravtrykk er stabilt og uavhengig av store/små bokstaver og mellomrom", () => {
    const a = fingerprint("acc1", "2026-10-31", -845, "REMA 1000  GRØNLAND");
    const b = fingerprint("acc1", "2026-10-31", -845.0, "rema 1000 grønland");
    expect(a).toBe(b);
    expect(fingerprint("acc2", "2026-10-31", -845, "rema 1000 grønland")).not.toBe(a);
    expect(fingerprint("acc1", "2026-10-31", -845.01, "rema 1000 grønland")).not.toBe(a);
  });

  it("gir identiske kjøp samme dag forskjellig forekomstnummer", () => {
    const items = [{ k: "a" }, { k: "b" }, { k: "a" }, { k: "a" }];
    const res = assignOccurrences(items, (i) => i.k);
    expect(res.map((r) => r.occurrence)).toEqual([1, 1, 2, 3]);
  });
});
