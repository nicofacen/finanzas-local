import { Money } from "@/shared/domain";
import {
  daysRemainingIn,
  type BudgetSnapshot,
  type BudgetSummary,
  type IBudgetingStrategy,
} from "./IBudgetingStrategy";

/**
 * Safe-to-Spend (Monarch / PocketGuard):
 *   Disponible = Ingresos − Gastos fijos/Suscripciones/Cuotas − Metas de ahorro − Gastos variables realizados
 * Si todavía no cobraste, usa el ingreso esperado (promedio reciente).
 */
export class SafeToSpendStrategy implements IBudgetingStrategy {
  readonly id = "safe-to-spend" as const;
  readonly name = "Safe-to-Spend";

  calculate(s: BudgetSnapshot): BudgetSummary {
    const usingExpected = s.expectedIncome.greaterThan(s.incomeThisMonth);
    const income = usingExpected ? s.expectedIncome : s.incomeThisMonth;

    const fixed = Money.sum(s.fixedCommitments.map((c) => c.amount), s.currency);
    const pendingFixed = Money.sum(s.fixedCommitments.filter((c) => !c.paid).map((c) => c.amount), s.currency);
    const savings = Money.sum(s.savingsGoals.map((g) => g.contributionFor(s.month)), s.currency);
    const safeToSpend = income.subtract(fixed).subtract(savings).subtract(s.variableSpent);

    const daysRemaining = daysRemainingIn(s.month, s.today);
    const dailyAllowance =
      daysRemaining > 0 && safeToSpend.isPositive()
        ? safeToSpend.multiplyByRatio(1n, BigInt(daysRemaining), "DOWN")
        : daysRemaining > 0
          ? Money.zero(s.currency)
          : null;

    const warnings: string[] = [];
    if (safeToSpend.isNegative()) {
      warnings.push(`Estás ${safeToSpend.abs().format()} por encima de lo que podés gastar este mes.`);
    }
    if (usingExpected) {
      warnings.push(`Usando ingreso esperado (${s.expectedIncome.format()}) porque todavía no se registró el total del mes.`);
    }
    if (pendingFixed.isPositive()) {
      warnings.push(`Quedan ${pendingFixed.format()} de gastos fijos por pagar este mes (ya descontados).`);
    }

    return {
      methodology: this.id,
      title: this.name,
      headline: {
        label: "Podés gastar",
        amount: safeToSpend,
        tone: safeToSpend.isNegative() ? "negative" : "positive",
        hint: dailyAllowance && daysRemaining > 0 ? `${dailyAllowance.format()} por día durante ${daysRemaining} días` : undefined,
      },
      dailyAllowance,
      daysRemaining,
      lines: [
        { label: usingExpected ? "Ingresos (esperados)" : "Ingresos", amount: income, tone: "positive" },
        { label: "Gastos fijos, suscripciones y cuotas", amount: fixed.negate(), tone: "negative" },
        { label: "Metas de ahorro", amount: savings.negate(), tone: "warning" },
        { label: "Gastos variables realizados", amount: s.variableSpent.negate(), tone: "negative" },
      ],
      warnings,
    };
  }
}
