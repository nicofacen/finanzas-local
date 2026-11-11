import { DomainError, Money, YearMonth, err, ok, type Currency, type Result } from "@/shared/domain";

/** Estado persistido de un sobre en un mes: lo que el usuario asignó y lo que se gastó. */
export interface EnvelopeRecord {
  readonly categoryId: string;
  readonly month: YearMonth;
  readonly assigned: Money;
  /** Con signo: los gastos son negativos. */
  readonly activity: Money;
}

interface BudgetEnvelopeProps {
  categoryId: string;
  month: YearMonth;
  carryover: Money;
  assigned: Money;
  activity: Money;
  /** Sobregiros de meses anteriores que NO se arrastraron (se descuentan del "Listo para asignar"). */
  absorbedOverspending: Money;
}

/**
 * Entidad BudgetEnvelope (sobre) — Information Expert de su disponible:
 * disponible = arrastre + asignado + actividad.
 *
 * Regla de rollover (estilo YNAB/Actual): el sobrante positivo pasa al mes
 * siguiente; un sobregiro NO se arrastra en el sobre, sino que se absorbe
 * contra el dinero listo para asignar.
 */
export class BudgetEnvelope {
  private constructor(private props: BudgetEnvelopeProps) {}

  static empty(categoryId: string, month: YearMonth, currency: Currency): BudgetEnvelope {
    const zero = Money.zero(currency);
    return new BudgetEnvelope({ categoryId, month, carryover: zero, assigned: zero, activity: zero, absorbedOverspending: zero });
  }

  /**
   * Reconstruye el sobre de `target` plegando el historial mes a mes,
   * incluyendo meses sin registros (que igual arrastran saldo).
   */
  static projectFromHistory(
    categoryId: string,
    records: readonly EnvelopeRecord[],
    target: YearMonth,
    currency: Currency,
  ): BudgetEnvelope {
    const own = records
      .filter((r) => r.categoryId === categoryId && !r.month.isAfter(target))
      .sort((a, b) => a.month.compare(b.month));
    if (own.length === 0) return BudgetEnvelope.empty(categoryId, target, currency);

    const byMonth = new Map(own.map((r) => [r.month.toString(), r]));
    let envelope = BudgetEnvelope.empty(categoryId, own[0].month, currency);
    for (let m = own[0].month; ; m = m.next()) {
      const rec = byMonth.get(m.toString());
      if (rec) envelope.props.assigned = rec.assigned;
      if (rec) envelope.props.activity = rec.activity;
      if (m.equals(target)) return envelope;
      envelope = envelope.rollOverTo(m.next());
    }
  }

  get categoryId() {
    return this.props.categoryId;
  }
  get month() {
    return this.props.month;
  }
  get carryover() {
    return this.props.carryover;
  }
  get assigned() {
    return this.props.assigned;
  }
  get activity() {
    return this.props.activity;
  }
  get absorbedOverspending() {
    return this.props.absorbedOverspending;
  }

  available(): Money {
    return this.props.carryover.add(this.props.assigned).add(this.props.activity);
  }

  isOverspent(): boolean {
    return this.available().isNegative();
  }

  /** Gastado / (arrastre + asignado), en puntos básicos (10000 = 100%). */
  usageBasisPoints(): number | null {
    const funded = this.props.carryover.add(this.props.assigned);
    if (!funded.isPositive()) return this.props.activity.isNegative() ? 10_000 : null;
    return this.props.activity.negate().ratioInBasisPoints(funded);
  }

  assign(amount: Money): Result<void, DomainError> {
    if (amount.isNegative()) return err(DomainError.validation("El monto asignado no puede ser negativo"));
    if (!amount.hasSameCurrency(this.props.assigned)) {
      return err(new DomainError("CURRENCY_MISMATCH", "Los sobres operan en la moneda base"));
    }
    this.props.assigned = amount;
    return ok(undefined);
  }

  recordActivity(delta: Money): void {
    this.props.activity = this.props.activity.add(delta);
  }

  /** Crea el sobre del mes siguiente (GRASP Creator: el sobre conoce su propio saldo final). */
  rollOverTo(next: YearMonth): BudgetEnvelope {
    const available = this.available();
    const zero = Money.zero(available.currency);
    return new BudgetEnvelope({
      categoryId: this.props.categoryId,
      month: next,
      carryover: available.max(zero),
      assigned: zero,
      activity: zero,
      absorbedOverspending: this.props.absorbedOverspending.add(available.min(zero)),
    });
  }

  toRecord(): EnvelopeRecord {
    return {
      categoryId: this.props.categoryId,
      month: this.props.month,
      assigned: this.props.assigned,
      activity: this.props.activity,
    };
  }
}
