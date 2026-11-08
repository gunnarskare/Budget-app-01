import { describe, expect, it } from "vitest";
import { addMonths, clampDay, daysInMonth, diffDays, isoWeekNumber, isValidISO, lastMonths, monthEnd, monthsBetween, weekStart } from "./dates";
import { formatCompact, formatMoney, formatPercent, monthLabel, plural, roundNice } from "./format";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("formatMoney", () => {
  it("bruker norsk formatering med minus-tegn og kr", () => {
    expect(nbsp(formatMoney(1299))).toBe("1 299 kr");
    expect(nbsp(formatMoney(-845))).toBe("−845 kr");
    expect(nbsp(formatMoney(32000, { signed: true }))).toBe("+32 000 kr");
    expect(nbsp(formatMoney(1234.5, { decimals: 2 }))).toBe("1 234,50 kr");
    expect(nbsp(formatMoney(100, { currency: "EUR" }))).toBe("100 EUR");
  });
  it("viser aldri «−0»", () => {
    expect(nbsp(formatMoney(-0.4))).toBe("0 kr");
  });
  it("kompakt, prosent, flertall, pene beløp", () => {
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(12_500)).toBe("13k");
    expect(nbsp(formatPercent(0.183))).toBe("18 %");
    expect(plural(1, "dag", "dager")).toBe("1 dag");
    expect(plural(3, "dag", "dager")).toBe("3 dager");
    expect(roundNice(1234)).toBe(1200);
    expect(roundNice(430)).toBe(450);
    expect(roundNice(26_740)).toBe(26_500);
  });
  it("månedsnavn", () => {
    expect(monthLabel("2026-11")).toBe("november 2026");
  });
});

describe("datoer", () => {
  it("gyldighet og månedslengder (skuddår)", () => {
    expect(isValidISO("2026-02-29")).toBe(false);
    expect(isValidISO("2028-02-29")).toBe(true);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(monthEnd("2026-11")).toBe("2026-11-30");
  });
  it("månedsaritmetikk over årsskifte", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthsBetween("2026-10", "2027-01")).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(lastMonths("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(clampDay("2026-02", 31)).toBe("2026-02-28");
  });
  it("uker: mandag som start og ISO-ukenummer", () => {
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(isoWeekNumber("2026-01-01")).toBe(1);
    expect(isoWeekNumber("2026-12-31")).toBe(53);
    expect(diffDays("2026-11-08", "2026-11-01")).toBe(7);
  });
});
