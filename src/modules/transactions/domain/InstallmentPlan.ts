import { Money, YearMonth, invariant, type Currency } from "@/shared/domain";
import type { Installment } from "./Installment";

export interface MonthlyProjection {
  readonly month: YearMonth;
  readonly amount: Money;
  readonly baseAmount: Money;
}

/**
 * Entidad InstallmentPlan — High Cohesion: concentra todos los cálculos
 * sobre el cronograma de cuotas (saldo restante, proyección, cuota del mes).
 */
export class InstallmentPlan {
  private readonly installments: readonly Installment[];

  constructor(
    installments: readonly Installment[],
    private readonly currency: Currency,
    private readonly baseCurrency: Currency,
  ) {
    invariant(installments.length > 0, "Un plan de cuotas requiere al menos una cuota");
    const sorted = [...installments].sort((a, b) => a.number - b.number);
    sorted.forEach((inst, i) => {
      invariant(inst.number === i + 1, "Las cuotas deben numerarse consecutivamente desde 1");
      invariant(inst.of === sorted.length, "Todas las cuotas deben conocer el total del plan");
      if (i > 0) invariant(inst.dueMonth.equals(sorted[i - 1].dueMonth.next()), "Las cuotas deben ser mensuales y consecutivas");
    });
    this.installments = Object.freeze(sorted);
  }

  get count(): number {
    return this.installments.length;
  }
  get all(): readonly Installment[] {
    return this.installments;
  }
  get firstMonth(): YearMonth {
    return this.installments[0].dueMonth;
  }
  get lastMonth(): YearMonth {
    return this.installments[this.installments.length - 1].dueMonth;
  }

  total(): Money {
    return Money.sum(this.installments.map((i) => i.amount), this.currency);
  }

  baseTotal(): Money {
    return Money.sum(this.installments.map((i) => i.baseAmount), this.baseCurrency);
  }

  installmentFor(month: YearMonth): Installment | undefined {
    return this.installments.find((i) => i.dueMonth.equals(month));
  }

  amountDueIn(month: YearMonth): Money {
    return this.installmentFor(month)?.amount ?? Money.zero(this.currency);
  }

  baseAmountDueIn(month: YearMonth): Money {
    return this.installmentFor(month)?.baseAmount ?? Money.zero(this.baseCurrency);
  }

  /** Deuda pendiente DESPUÉS de pagar la cuota de `month`. */
  remainingAfter(month: YearMonth): Money {
    return Money.sum(
      this.installments.filter((i) => i.dueMonth.isAfter(month)).map((i) => i.amount),
      this.currency,
    );
  }

  billedCount(asOf: YearMonth): number {
    return this.installments.filter((i) => !i.dueMonth.isAfter(asOf)).length;
  }

  isActiveIn(month: YearMonth): boolean {
    return !month.isBefore(this.firstMonth) && !month.isAfter(this.lastMonth);
  }

  /** Proyección de `months` meses a partir de `from` (incluye meses en cero). */
  project(from: YearMonth, months: number): MonthlyProjection[] {
    return Array.from({ length: months }, (_, k) => {
      const month = from.addMonths(k);
      return { month, amount: this.amountDueIn(month), baseAmount: this.baseAmountDueIn(month) };
    });
  }
}
