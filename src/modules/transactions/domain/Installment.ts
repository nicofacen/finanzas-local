import type { Money, YearMonth } from "@/shared/domain";

export type InstallmentStatus = "billed" | "current" | "upcoming";

/** Cuota individual de una compra financiada. Inmutable. */
export class Installment {
  constructor(
    readonly number: number,
    readonly of: number,
    readonly dueMonth: YearMonth,
    /** En la moneda de la tarjeta. */
    readonly amount: Money,
    /** En moneda base (para presupuesto y proyecciones). */
    readonly baseAmount: Money,
  ) {
    Object.freeze(this);
  }

  get label(): string {
    return `${this.number}/${this.of}`;
  }

  statusAt(month: YearMonth): InstallmentStatus {
    const cmp = this.dueMonth.compare(month);
    return cmp < 0 ? "billed" : cmp === 0 ? "current" : "upcoming";
  }
}
