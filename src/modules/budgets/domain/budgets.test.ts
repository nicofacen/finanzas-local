import { describe, expect, it } from "vitest";
import { Currency, LocalDate, Money, Results, YearMonth } from "@/shared/domain";
import { BudgetEnvelope, type EnvelopeRecord } from "./BudgetEnvelope";
import { Category } from "./Category";
import { SavingsGoal } from "./SavingsGoal";
import { Subscription } from "./Subscription";
import type { BudgetSnapshot, IBudgetingStrategy } from "./strategies/IBudgetingStrategy";
import { SafeToSpendStrategy } from "./strategies/SafeToSpendStrategy";
import { ZeroBasedEnvelopeStrategy } from "./strategies/ZeroBasedEnvelopeStrategy";

const ARS = Currency.ARS;
const ars = (v: string) => Results.unwrap(Money.fromDecimal(v, ARS));
const ym = (s: string) => YearMonth.fromString(s);
const rec = (categoryId: string, month: string, assigned: string, activity: string): EnvelopeRecord => ({
  categoryId,
  month: ym(month),
  assigned: ars(assigned),
  activity: ars(activity),
});

describe("BudgetEnvelope — rollover", () => {
  it("arrastra el sobrante positivo al mes siguiente", () => {
    const env = BudgetEnvelope.projectFromHistory(
      "super",
      [rec("super", "2026-09", "100000", "-80000"), rec("super", "2026-10", "100000", "-90000")],
      ym("2026-10"),
      ARS,
    );
    expect(env.carryover.toDecimalString()).toBe("20000.00");
    expect(env.available().toDecimalString()).toBe("30000.00");
  });

  it("arrastra también a través de meses sin movimientos", () => {
    const env = BudgetEnvelope.projectFromHistory("viajes", [rec("viajes", "2026-08", "50000", "0")], ym("2026-11"), ARS);
    expect(env.carryover.toDecimalString()).toBe("50000.00");
    expect(env.month.toString()).toBe("2026-11");
  });

  it("un sobregiro NO se arrastra en el sobre: se absorbe", () => {
    const env = BudgetEnvelope.projectFromHistory(
      "salidas",
      [rec("salidas", "2026-10", "10000", "-15000"), rec("salidas", "2026-11", "10000", "0")],
      ym("2026-11"),
      ARS,
    );
    expect(env.carryover.isZero()).toBe(true);
    expect(env.absorbedOverspending.toDecimalString()).toBe("-5000.00");
    expect(env.available().toDecimalString()).toBe("10000.00");
  });

  it("calcula su uso en puntos básicos y detecta sobregiro", () => {
    const env = BudgetEnvelope.empty("x", ym("2026-11"), ARS);
    expect(env.assign(ars("1000")).ok).toBe(true);
    env.recordActivity(ars("-1250"));
    expect(env.isOverspent()).toBe(true);
    expect(env.usageBasisPoints()).toBe(12_500);
  });

  it("no permite asignaciones negativas", () => {
    const env = BudgetEnvelope.empty("x", ym("2026-11"), ARS);
    expect(env.assign(ars("-1")).ok).toBe(false);
  });
});

// ─────────────── Estrategias ───────────────

const cat = (id: string, kind: "variable" | "fixed" | "income") =>
  Results.unwrap(Category.create({ id, name: id, group: "G", kind }));

function snapshot(overrides: Partial<BudgetSnapshot> = {}): BudgetSnapshot {
  const superEnv = BudgetEnvelope.projectFromHistory("super", [rec("super", "2026-11", "200000", "-50000")], ym("2026-11"), ARS);
  const alquiler = BudgetEnvelope.projectFromHistory("alquiler", [rec("alquiler", "2026-11", "300000", "-300000")], ym("2026-11"), ARS);
  return {
    month: ym("2026-11"),
    today: LocalDate.fromISO("2026-11-11"),
    currency: ARS,
    incomeThisMonth: ars("1000000"),
    expectedIncome: ars("1000000"),
    cumulativeIncome: ars("1000000"),
    cumulativeAssigned: ars("500000"),
    envelopes: [
      { category: cat("super", "variable"), envelope: superEnv },
      { category: cat("alquiler", "fixed"), envelope: alquiler },
    ],
    fixedCommitments: [
      { label: "Alquiler", amount: ars("300000"), source: "fixed_category", paid: true },
      { label: "Netflix", amount: ars("10000"), source: "subscription", paid: false },
      { label: "Heladera 2/6", amount: ars("40000"), source: "installment", paid: false },
    ],
    savingsGoals: [
      Results.unwrap(
        SavingsGoal.create({
          id: "g",
          name: "Viaje",
          target: ars("1000000"),
          saved: ars("0"),
          monthlyContribution: ars("100000"),
          targetMonth: null,
        }),
      ),
    ],
    variableSpent: ars("50000"),
    ...overrides,
  };
}

describe("ZeroBasedEnvelopeStrategy", () => {
  const strategy = new ZeroBasedEnvelopeStrategy();

  it("Listo para asignar = ingresos − asignado", () => {
    const s = strategy.calculate(snapshot());
    expect(s.headline.label).toBe("Listo para asignar");
    expect(s.headline.amount.toDecimalString()).toBe("500000.00");
    expect(s.daysRemaining).toBe(20); // 30 − 11 + 1
  });

  it("descuenta sobregiros absorbidos de meses previos", () => {
    const env = BudgetEnvelope.projectFromHistory(
      "super",
      [rec("super", "2026-10", "10000", "-25000"), rec("super", "2026-11", "0", "0")],
      ym("2026-11"),
      ARS,
    );
    const s = strategy.calculate(snapshot({ envelopes: [{ category: cat("super", "variable"), envelope: env }] }));
    expect(s.headline.amount.toDecimalString()).toBe("485000.00");
  });

  it("advierte cuando se asigna más de lo disponible", () => {
    const s = strategy.calculate(snapshot({ cumulativeAssigned: ars("1200000") }));
    expect(s.headline.amount.isNegative()).toBe(true);
    expect(s.warnings[0]).toMatch(/más de lo que tenés/);
  });

  it("el diario disponible sale de los sobres variables", () => {
    const s = strategy.calculate(snapshot());
    expect(s.dailyAllowance?.toDecimalString()).toBe("7500.00"); // 150000 / 20
  });
});

describe("SafeToSpendStrategy", () => {
  const strategy = new SafeToSpendStrategy();

  it("Ingresos − Fijos − Ahorro − Variables realizados", () => {
    const s = strategy.calculate(snapshot());
    // 1.000.000 − 350.000 − 100.000 − 50.000
    expect(s.headline.amount.toDecimalString()).toBe("500000.00");
    expect(s.dailyAllowance?.toDecimalString()).toBe("25000.00");
  });

  it("usa el ingreso esperado si todavía no se cobró", () => {
    const s = strategy.calculate(snapshot({ incomeThisMonth: ars("0") }));
    expect(s.headline.amount.toDecimalString()).toBe("500000.00");
    expect(s.warnings.some((w) => w.includes("ingreso esperado"))).toBe(true);
  });

  it("marca negativo cuando el gasto supera lo seguro", () => {
    const s = strategy.calculate(snapshot({ variableSpent: ars("700000") }));
    expect(s.headline.amount.toDecimalString()).toBe("-150000.00");
    expect(s.headline.tone).toBe("negative");
    expect(s.dailyAllowance?.isZero()).toBe(true);
  });
});

describe("LSP: ambas estrategias son intercambiables", () => {
  const strategies: IBudgetingStrategy[] = [new ZeroBasedEnvelopeStrategy(), new SafeToSpendStrategy()];
  it.each(strategies.map((s) => [s.name, s]))("%s cumple el contrato", (_name, strategy) => {
    const summary = (strategy as IBudgetingStrategy).calculate(snapshot());
    expect(summary.methodology).toBe((strategy as IBudgetingStrategy).id);
    expect(summary.headline.amount.currency.code).toBe("ARS");
    expect(summary.lines.length).toBeGreaterThan(0);
    expect(summary.daysRemaining).toBe(20);
  });
});

describe("Subscription y SavingsGoal", () => {
  it("vencimiento ajustado a meses cortos y estado según la fecha", () => {
    const sub = Results.unwrap(
      Subscription.create({
        id: "s",
        name: "Gimnasio",
        amount: ars("25000"),
        accountId: "a",
        categoryId: null,
        billingDay: 31,
        startMonth: ym("2026-01"),
      }),
    );
    expect(sub.dueDateIn(ym("2027-02")).toISO()).toBe("2027-02-28");
    const today = LocalDate.fromISO("2026-11-11");
    expect(sub.statusFor(ym("2026-11"), false, today)).toBe("pending");
    expect(sub.statusFor(ym("2026-10"), false, today)).toBe("overdue");
    expect(sub.statusFor(ym("2026-10"), true, today)).toBe("paid");
    expect(sub.statusFor(ym("2025-12"), false, today)).toBe("not_due");
  });

  it("meta de ahorro: progreso, meses restantes y aporte requerido", () => {
    const g = Results.unwrap(
      SavingsGoal.create({
        id: "g",
        name: "Auto",
        target: ars("1000000"),
        saved: ars("250000"),
        monthlyContribution: ars("100000"),
        targetMonth: ym("2027-02"),
      }),
    );
    expect(g.progressBasisPoints()).toBe(2500);
    expect(g.monthsToComplete()).toBe(8);
    expect(g.requiredMonthlyContribution(ym("2026-11"))?.toDecimalString()).toBe("187500.00");
  });
});
