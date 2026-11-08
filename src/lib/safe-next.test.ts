import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext (hindrer åpen redirect)", () => {
  it("godtar interne stier", () => {
    expect(safeNext("/budsjett")).toBe("/budsjett");
    expect(safeNext("/transaksjoner?q=rema")).toBe("/transaksjoner?q=rema");
  });
  it("avviser eksterne og lure mål", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNext(bad as string | null | undefined)).toBe("/oversikt");
    }
    expect(safeNext("evil", "/x")).toBe("/x");
  });
});
