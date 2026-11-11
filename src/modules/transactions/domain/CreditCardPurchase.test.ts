import { describe, expect, it } from "vitest";
import { Currency, LocalDate, Money, Results, YearMonth } from "@/shared/domain";
import { CreditCardPurchase } from "./CreditCardPurchase";

const ARS = Currency.ARS;
const ars = (v: string) => Results.unwrap(Money.fromDecimal(v, ARS));

function purchase(total: string, n: number, date = "2026-11-05", closingDay: number | null = null) {
  return CreditCardPurchase.create({
    id: "p1",
    accountId: "visa",
    description: "Heladera",
    categoryId: "hogar",
    purchaseDate: LocalDate.fromISO(date),
    total: ars(total),
    baseTotal: ars(total),
    installmentsCount: n,
    closingDay,
  });
}

describe("CreditCardPurchase (GRASP Creator)", () => {
  it("crea sus propias cuotas y suman exactamente el total", () => {
    const p = Results.unwrap(purchase("100000", 3));
    expect(p.installments).toHaveLength(3);
    expect(p.installments.map((i) => i.amount.toDecimalString())).toEqual(["33333.34", "33333.33", "33333.33"]);
    expect(p.total.equals(ars("100000"))).toBe(true);
    expect(p.installments.map((i) => i.label)).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("la 1ª cuota vence el mes siguiente si no hay día de cierre", () => {
    const p = Results.unwrap(purchase("1200", 12));
    expect(p.plan.firstMonth.toString()).toBe("2026-12");
    expect(p.plan.lastMonth.toString()).toBe("2027-11");
  });

  it("compras posteriores al cierre pasan al resumen siguiente", () => {
    const before = Results.unwrap(purchase("1000", 2, "2026-11-20", 24));
    const after = Results.unwrap(purchase("1000", 2, "2026-11-26", 24));
    expect(before.plan.firstMonth.toString()).toBe("2026-12");
    expect(after.plan.firstMonth.toString()).toBe("2027-01");
  });

  it("proyecta el impacto mes a mes", () => {
    const p = Results.unwrap(purchase("90000", 3));
    const projection = p.projectFrom(YearMonth.fromString("2026-11"), 5);
    expect(projection.map((x) => x.amount.toDecimalString())).toEqual([
      "0.00", "30000.00", "30000.00", "30000.00", "0.00",
    ]);
  });

  it("calcula deuda restante y cuotas facturadas", () => {
    const p = Results.unwrap(purchase("60000", 6));
    const jan = YearMonth.fromString("2027-01");
    expect(p.plan.billedCount(jan)).toBe(2);
    expect(p.plan.remainingAfter(jan).toDecimalString()).toBe("40000.00");
    expect(p.plan.isActiveIn(YearMonth.fromString("2027-05"))).toBe(true);
    expect(p.plan.isActiveIn(YearMonth.fromString("2027-06"))).toBe(false);
  });

  it("genera el impacto presupuestario de cada cuota (negativo, en su mes)", () => {
    const p = Results.unwrap(purchase("3000", 3));
    const impacts = p.budgetImpacts();
    expect(impacts.map((i) => [i.month.toString(), i.delta.toDecimalString()])).toEqual([
      ["2026-12", "-1000.00"],
      ["2027-01", "-1000.00"],
      ["2027-02", "-1000.00"],
    ]);
  });

  it("valida la cantidad de cuotas y el total", () => {
    expect(purchase("1000", 0).ok).toBe(false);
    expect(purchase("1000", 73).ok).toBe(false);
    expect(purchase("0", 3).ok).toBe(false);
  });
});
