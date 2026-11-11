import type { BudgetMethodology, Currency, LocalDate, Money, YearMonth } from "@/shared/domain";
import type { BudgetEnvelope } from "../BudgetEnvelope";
import type { Category } from "../Category";
import type { SavingsGoal } from "../SavingsGoal";

export interface FixedCommitment {
  readonly label: string;
  /** En moneda base, positivo. */
  readonly amount: Money;
  readonly source: "subscription" | "installment" | "fixed_category";
  readonly paid: boolean;
}

export interface EnvelopeLine {
  readonly category: Category;
  readonly envelope: BudgetEnvelope;
}

/** Foto del mes que reciben las estrategias. Todo en moneda base. */
export interface BudgetSnapshot {
  readonly month: YearMonth;
  readonly today: LocalDate;
  readonly currency: Currency;
  readonly incomeThisMonth: Money;
  /** Ingreso esperado (promedio de los últimos meses) para proyectar antes de cobrar. */
  readonly expectedIncome: Money;
  /** Ingresos acumulados hasta el fin de `month` (inclusive). */
  readonly cumulativeIncome: Money;
  /** Asignaciones acumuladas hasta `month` (inclusive). */
  readonly cumulativeAssigned: Money;
  readonly envelopes: readonly EnvelopeLine[];
  readonly fixedCommitments: readonly FixedCommitment[];
  readonly savingsGoals: readonly SavingsGoal[];
  /** Gasto variable ya realizado en el mes (positivo). */
  readonly variableSpent: Money;
}

export type Tone = "neutral" | "positive" | "negative" | "warning";

export interface SummaryLine {
  readonly label: string;
  readonly amount: Money;
  readonly tone: Tone;
  readonly hint?: string;
}

export interface BudgetSummary {
  readonly methodology: BudgetMethodology;
  readonly title: string;
  readonly headline: SummaryLine;
  /** Cuánto se puede gastar por día en lo que queda del mes. */
  readonly dailyAllowance: Money | null;
  readonly daysRemaining: number;
  readonly lines: readonly SummaryLine[];
  readonly warnings: readonly string[];
}

/**
 * GRASP Polymorphism + SOLID OCP/LSP: cada metodología de presupuesto es una
 * estrategia intercambiable con el mismo contrato de entrada y salida.
 * Agregar una nueva (ej. 50/30/20) no modifica a los consumidores.
 */
export interface IBudgetingStrategy {
  readonly id: BudgetMethodology;
  readonly name: string;
  calculate(snapshot: BudgetSnapshot): BudgetSummary;
}

/** Días que quedan en el mes contando hoy (0 si el mes ya pasó). */
export function daysRemainingIn(month: YearMonth, today: LocalDate): number {
  const cmp = month.compare(today.yearMonth);
  if (cmp < 0) return 0;
  if (cmp > 0) return month.daysInMonth;
  return month.daysInMonth - today.day + 1;
}
