import type { LocalDate, Money, YearMonth } from "@/shared/domain";
import type { SpendingRecord } from "./SpendingInsights";

export interface MonthlyFlow {
  readonly month: YearMonth;
  readonly income: Money;
  readonly expenses: Money;
}

/**
 * Read model de analítica (CQRS liviano): consultas agregadas optimizadas
 * en SQL, sin hidratar entidades. Todo en moneda base.
 */
export interface IAnalyticsReadModel {
  monthlyFlows(from: YearMonth, to: YearMonth): Promise<MonthlyFlow[]>;
  /** Gastos consumidos (incluye cuotas del mes, excluye compras en cuotas completas). */
  spendingRecords(from: LocalDate, to: LocalDate): Promise<SpendingRecord[]>;
  installmentProjection(from: YearMonth, months: number): Promise<{ month: YearMonth; amount: Money }[]>;
}
