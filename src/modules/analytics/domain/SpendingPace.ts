import { Money, type LocalDate, type YearMonth } from "@/shared/domain";

export type PaceStatus = "under" | "on_track" | "over" | "no_budget";

export interface PacePoint {
  readonly day: number;
  /** null para días futuros. */
  readonly actual: Money | null;
  readonly ideal: Money;
}

export interface SpendingPaceResult {
  readonly daysInMonth: number;
  readonly daysElapsed: number;
  readonly daysRemaining: number;
  readonly spent: Money;
  readonly budget: Money;
  readonly idealToDate: Money;
  readonly projectedMonthEnd: Money;
  /** Gastado vs ideal a la fecha (10000 = exactamente en ritmo). */
  readonly paceBasisPoints: number | null;
  readonly status: PaceStatus;
  readonly series: readonly PacePoint[];
}

/**
 * Velocidad de gasto: compara lo gastado contra una línea ideal lineal
 * (presupuesto × díasTranscurridos / díasDelMes) y proyecta el cierre del mes.
 */
export class SpendingPace {
  /** Tolerancia de ±10% antes de marcar "por encima/debajo" del ritmo. */
  static readonly TOLERANCE_BPS = 1_000;

  static calculate(input: {
    month: YearMonth;
    today: LocalDate;
    budget: Money;
    /** Gasto por día del mes (1..n), moneda base, positivo. */
    dailySpending: ReadonlyMap<number, Money>;
  }): SpendingPaceResult {
    const { month, today, budget } = input;
    const currency = budget.currency;
    const daysInMonth = month.daysInMonth;
    const cmp = month.compare(today.yearMonth);
    const daysElapsed = cmp < 0 ? daysInMonth : cmp > 0 ? 0 : today.day;

    const series: PacePoint[] = [];
    let cumulative = Money.zero(currency);
    for (let day = 1; day <= daysInMonth; day++) {
      cumulative = cumulative.add(input.dailySpending.get(day) ?? Money.zero(currency));
      series.push({
        day,
        actual: day <= daysElapsed ? cumulative : null,
        ideal: budget.multiplyByRatio(BigInt(day), BigInt(daysInMonth)),
      });
    }

    const spent = daysElapsed > 0 ? series[daysElapsed - 1].actual! : Money.zero(currency);
    const idealToDate = budget.multiplyByRatio(BigInt(daysElapsed), BigInt(daysInMonth));
    const projectedMonthEnd =
      daysElapsed > 0 ? spent.multiplyByRatio(BigInt(daysInMonth), BigInt(daysElapsed)) : Money.zero(currency);

    const paceBasisPoints = idealToDate.isPositive() ? spent.ratioInBasisPoints(idealToDate) : null;
    let status: PaceStatus = "no_budget";
    if (budget.isPositive() && paceBasisPoints !== null) {
      status =
        paceBasisPoints > 10_000 + SpendingPace.TOLERANCE_BPS
          ? "over"
          : paceBasisPoints < 10_000 - SpendingPace.TOLERANCE_BPS
            ? "under"
            : "on_track";
    }

    return {
      daysInMonth,
      daysElapsed,
      daysRemaining: daysInMonth - daysElapsed,
      spent,
      budget,
      idealToDate,
      projectedMonthEnd,
      paceBasisPoints,
      status,
      series,
    };
  }
}
