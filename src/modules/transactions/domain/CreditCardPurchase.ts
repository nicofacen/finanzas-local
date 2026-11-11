import { DomainError, LocalDate, Money, YearMonth, err, ok, type Result } from "@/shared/domain";
import { Installment } from "./Installment";
import { InstallmentPlan, type MonthlyProjection } from "./InstallmentPlan";

export const MAX_INSTALLMENTS = 72;

export interface CreateCreditCardPurchaseInput {
  id: string;
  accountId: string;
  description: string;
  categoryId: string | null;
  purchaseDate: LocalDate;
  /** Total financiado en la moneda de la tarjeta. */
  total: Money;
  /** El mismo total convertido a moneda base al momento de la compra. */
  baseTotal: Money;
  installmentsCount: number;
  /** Día de cierre del resumen de la tarjeta (null = la 1ª cuota vence el mes siguiente). */
  closingDay: number | null;
}

export interface CreditCardPurchaseProps {
  id: string;
  accountId: string;
  description: string;
  categoryId: string | null;
  purchaseDate: LocalDate;
  plan: InstallmentPlan;
}

/**
 * Agregado CreditCardPurchase — GRASP Creator: como contiene y registra sus cuotas,
 * es el responsable de instanciarlas (`Installment`) y de proyectarlas en el tiempo.
 */
export class CreditCardPurchase {
  private constructor(private readonly props: CreditCardPurchaseProps) {}

  static create(input: CreateCreditCardPurchaseInput): Result<CreditCardPurchase, DomainError> {
    const n = input.installmentsCount;
    if (!Number.isInteger(n) || n < 1 || n > MAX_INSTALLMENTS) {
      return err(DomainError.validation(`La cantidad de cuotas debe estar entre 1 y ${MAX_INSTALLMENTS}`));
    }
    if (!input.total.isPositive()) return err(DomainError.validation("El total de la compra debe ser mayor a cero"));
    if (input.baseTotal.isNegative()) return err(DomainError.validation("El total en moneda base no puede ser negativo"));
    if (!input.description.trim()) return err(DomainError.validation("La descripción es obligatoria"));

    const firstMonth = CreditCardPurchase.firstInstallmentMonth(input.purchaseDate, input.closingDay);
    const amounts = input.total.allocate(n);
    const baseAmounts = input.baseTotal.allocate(n);

    const installments = amounts.map(
      (amount, i) => new Installment(i + 1, n, firstMonth.addMonths(i), amount, baseAmounts[i]),
    );

    return ok(
      new CreditCardPurchase({
        id: input.id,
        accountId: input.accountId,
        description: input.description.trim(),
        categoryId: input.categoryId,
        purchaseDate: input.purchaseDate,
        plan: new InstallmentPlan(installments, input.total.currency, input.baseTotal.currency),
      }),
    );
  }

  /**
   * Regla de facturación: si la compra es posterior al cierre del resumen,
   * entra en el resumen siguiente y la 1ª cuota se paga dos meses después.
   */
  static firstInstallmentMonth(purchaseDate: LocalDate, closingDay: number | null): YearMonth {
    const purchaseMonth = purchaseDate.yearMonth;
    if (closingDay === null) return purchaseMonth.next();
    const effectiveClosing = Math.min(closingDay, purchaseMonth.daysInMonth);
    return purchaseDate.day > effectiveClosing ? purchaseMonth.addMonths(2) : purchaseMonth.next();
  }

  static restore(props: CreditCardPurchaseProps): CreditCardPurchase {
    return new CreditCardPurchase(props);
  }

  get id() {
    return this.props.id;
  }
  get accountId() {
    return this.props.accountId;
  }
  get description() {
    return this.props.description;
  }
  get categoryId() {
    return this.props.categoryId;
  }
  get purchaseDate() {
    return this.props.purchaseDate;
  }
  get plan(): InstallmentPlan {
    return this.props.plan;
  }
  get installments(): readonly Installment[] {
    return this.props.plan.all;
  }
  get total(): Money {
    return this.props.plan.total();
  }
  get baseTotal(): Money {
    return this.props.plan.baseTotal();
  }

  /** Impacto presupuestario de cada cuota en su mes (moneda base, con signo negativo). */
  budgetImpacts(): { categoryId: string; month: YearMonth; delta: Money }[] {
    const categoryId = this.props.categoryId;
    if (!categoryId) return [];
    return this.installments.map((i) => ({ categoryId, month: i.dueMonth, delta: i.baseAmount.negate() }));
  }

  projectFrom(from: YearMonth, months: number): MonthlyProjection[] {
    return this.props.plan.project(from, months);
  }
}
