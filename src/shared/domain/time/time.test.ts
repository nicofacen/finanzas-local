import { describe, expect, it } from "vitest";
import { LocalDate } from "./LocalDate";
import { YearMonth } from "./YearMonth";

describe("YearMonth", () => {
  it("normaliza desbordes de año", () => {
    expect(YearMonth.fromString("2026-11").addMonths(3).toString()).toBe("2027-02");
    expect(YearMonth.fromString("2026-01").previous().toString()).toBe("2025-12");
  });
  it("conoce sus días (bisiestos incluidos)", () => {
    expect(YearMonth.fromString("2028-02").daysInMonth).toBe(29);
    expect(YearMonth.fromString("2026-02").daysInMonth).toBe(28);
  });
  it("calcula rangos y distancias", () => {
    const r = YearMonth.range(YearMonth.fromString("2026-11"), YearMonth.fromString("2027-01"));
    expect(r.map(String)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(YearMonth.fromString("2027-01").monthsSince(YearMonth.fromString("2026-11"))).toBe(2);
  });
});

describe("LocalDate", () => {
  it("valida fechas imposibles", () => {
    expect(LocalDate.parse("2026-02-30").ok).toBe(false);
    expect(LocalDate.parse("2026-13-01").ok).toBe(false);
  });
  it("suma días cruzando meses sin corrimiento de zona horaria", () => {
    expect(LocalDate.fromISO("2026-12-31").addDays(1).toISO()).toBe("2027-01-01");
    expect(LocalDate.fromISO("2026-03-01").addDays(-1).toISO()).toBe("2026-02-28");
  });
});
