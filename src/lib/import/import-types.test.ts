import { describe, expect, it } from "vitest";
import { MAX_ACTION_BYTES, payloadTooLarge } from "./types";

describe("payloadTooLarge (Vercel tillater maks 4,5 MB per forespørsel)", () => {
  const row = (i: number, rawSize = 200) => ({
    line: i,
    date: "2026-10-31",
    description: "Varekjøp REMA 1000 GRØNLAND",
    amount: -845,
    raw: { Dato: "31.10.2026", Forklaring: "x".repeat(rawSize) },
    categoryId: "0e9711df-799e-4f08-bfc1-fdc636a2fee7",
    subcategoryId: null,
  });

  it("slipper gjennom vanlige importer, også opptil maks antall rader", () => {
    expect(payloadTooLarge({ rows: Array.from({ length: 200 }, (_, i) => row(i)) })).toBe(false);
    expect(payloadTooLarge({ rows: Array.from({ length: 5000 }, (_, i) => row(i)) })).toBe(false);
  });

  it("stopper uvanlig brede filer før de når serveren", () => {
    expect(payloadTooLarge({ rows: Array.from({ length: 5000 }, (_, i) => row(i, 2000)) })).toBe(true);
  });

  it("grensen ligger under Vercels 4,5 MB", () => {
    expect(MAX_ACTION_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});
