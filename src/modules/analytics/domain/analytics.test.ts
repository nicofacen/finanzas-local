import { describe, expect, it } from "vitest";
import { Currency, LocalDate, Money, Results, YearMonth } from "@/shared/domain";
import { netWorth, savingsRate } from "./FinancialMetrics";
import { AntExpenseDetector, MovingAverageDeviationDetector, type InsightContext, type SpendingRecord } from "./SpendingInsights";
import { SpendingPace } from "./SpendingPace";

const ARS = Currency.ARS;
const ars = (v: string) => Results.unwrap(Money.fromDecimal(v, ARS));

describe("SpendingPace", () => {
  const month = YearMonth.fromString("2026-11");
  it("detecta que se gasta más rápido que lo ideal y proyecta el cierre", () => {
    const daily = new Map([[1, ars("100000")], [5, ars("50000")]]);
    const r = SpendingPace.calculate({ month, today: LocalDate.fromISO("2026-11-10"), budget: ars("300000"), dailySpending: daily });
    expect(r.daysElapsed).toBe(10);
    expect(r.idealToDate.toDecimalString()).toBe("100000.00");
    expect(r.spent.toDecimalString()).toBe("150000.00");
    expect(r.paceBasisPoints).toBe(15_000);
    expect(r.status).toBe("over");
    expect(r.projectedMonthEnd.toDecimalString()).toBe("450000.00");
    expect(r.series[10].actual).toBeNull(); // día 11 es futuro
  });

  it("meses pasados se evalúan completos", () => {
    const r = SpendingPace.calculate({ month, today: LocalDate.fromISO("2026-12-05"), budget: ars("300000"), dailySpending: new Map([[3, ars("290000")]]) });
    expect(r.daysElapsed).toBe(30);
    expect(r.status).toBe("on_track");
  });
});

describe("Métricas financieras", () => {
  it("tasa de ahorro en puntos básicos", () => {
    expect(savingsRate(ars("1000000"), ars("750000")).rateBasisPoints).toBe(2500);
    expect(savingsRate(ars("0"), ars("10")).rateBasisPoints).toBeNull();
  });

  it("patrimonio neto = activos − pasivos", () => {
    const r = netWorth(
      [
        { label: "Banco", group: "Bancos", baseBalance: ars("500000"), isLiability: false },
        { label: "Visa", group: "Tarjetas", baseBalance: ars("-120000"), isLiability: true },
        { label: "USD", group: "Inversiones", baseBalance: ars("1050000"), isLiability: false },
      ],
      ARS,
    );
    expect(r.assets.toDecimalString()).toBe("1550000.00");
    expect(r.liabilities.toDecimalString()).toBe("120000.00");
    expect(r.netWorth.toDecimalString()).toBe("1430000.00");
  });
});

const rec = (date: string, description: string, amount: string, categoryId: string | null = "cafe"): SpendingRecord => ({
  date: LocalDate.fromISO(date),
  description,
  categoryId,
  amount: ars(amount),
});

describe("Detección de gastos hormiga y desvíos", () => {
  const base: InsightContext = {
    month: YearMonth.fromString("2026-11"),
    currency: ARS,
    current: [
      rec("2026-11-01", "Café Martínez Centro", "3500"),
      rec("2026-11-03", "Cafe Martinez Palermo", "3800"),
      rec("2026-11-05", "CAFÉ MARTÍNEZ", "4000"),
      rec("2026-11-06", "Kiosco", "1500"),
      rec("2026-11-07", "Supermercado", "95000", "super"),
    ],
    previous: new Map([
      ["2026-10", [rec("2026-10-02", "Café", "3000"), rec("2026-10-10", "Supermercado", "40000", "super")]],
      ["2026-09", [rec("2026-09-02", "Café", "3000"), rec("2026-09-10", "Supermercado", "45000", "super")]],
      ["2026-08", [rec("2026-08-10", "Supermercado", "50000", "super")]],
    ]),
    categoryNames: new Map([["super", "Supermercado"], ["cafe", "Café"]]),
    antThreshold: ars("5000"),
  };

  it("agrupa compras chicas repetidas del mismo comercio", () => {
    const insights = new AntExpenseDetector(3).detect(base);
    const cafe = insights.find((i) => i.title.includes("Café"));
    expect(cafe).toBeDefined();
    expect(cafe!.amount.toDecimalString()).toBe("11300.00");
    expect(cafe!.message).toMatch(/3 compras/);
  });

  it("compara el total hormiga contra el promedio móvil", () => {
    const insights = new AntExpenseDetector(3).detect(base);
    expect(insights.some((i) => i.title.includes("en aumento"))).toBe(true);
  });

  it("detecta desvíos por categoría vs promedio de 3 meses", () => {
    const insights = new MovingAverageDeviationDetector(2500, 100_000n).detect(base);
    const superInsight = insights.find((i) => i.categoryId === "super");
    expect(superInsight).toBeDefined(); // 95.000 vs promedio 45.000
    expect(superInsight!.title).toMatch(/\+111%/);
    expect(superInsight!.severity).toBe("critical");
  });
});
