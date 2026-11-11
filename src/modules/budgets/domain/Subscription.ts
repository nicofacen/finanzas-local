import { DomainError, LocalDate, Money, YearMonth, err, ok, type Result } from "@/shared/domain";

export type SubscriptionStatus = "paid" | "pending" | "overdue" | "not_due";

export interface SubscriptionProps {
  id: string;
  name: string;
  amount: Money;
  accountId: string;
  categoryId: string | null;
  /** Día de débito (1-31). En meses más cortos se usa el último día. */
  billingDay: number;
  startMonth: YearMonth;
  active: boolean;
}

/** Suscripción / gasto fijo recurrente mensual. */
export class Subscription {
  private constructor(private props: SubscriptionProps) {}

  static create(input: Omit<SubscriptionProps, "active">): Result<Subscription, DomainError> {
    if (input.name.trim().length < 2) return err(DomainError.validation("Nombre de suscripción demasiado corto"));
    if (!input.amount.isPositive()) return err(DomainError.validation("El monto debe ser mayor a cero"));
    if (!Number.isInteger(input.billingDay) || input.billingDay < 1 || input.billingDay > 31) {
      return err(DomainError.validation("El día de vencimiento debe estar entre 1 y 31"));
    }
    return ok(new Subscription({ ...input, name: input.name.trim(), active: true }));
  }

  static restore(props: SubscriptionProps) {
    return new Subscription({ ...props });
  }

  get id() {
    return this.props.id;
  }
  get name() {
    return this.props.name;
  }
  get amount() {
    return this.props.amount;
  }
  get accountId() {
    return this.props.accountId;
  }
  get categoryId() {
    return this.props.categoryId;
  }
  get billingDay() {
    return this.props.billingDay;
  }
  get startMonth() {
    return this.props.startMonth;
  }
  get active() {
    return this.props.active;
  }

  isDueIn(month: YearMonth): boolean {
    return this.props.active && !month.isBefore(this.props.startMonth);
  }

  dueDateIn(month: YearMonth): LocalDate {
    const day = Math.min(this.props.billingDay, month.daysInMonth);
    return LocalDate.fromISO(`${month.toString()}-${String(day).padStart(2, "0")}`);
  }

  statusFor(month: YearMonth, isPaid: boolean, today: LocalDate): SubscriptionStatus {
    if (!this.isDueIn(month)) return "not_due";
    if (isPaid) return "paid";
    return this.dueDateIn(month).isBefore(today) ? "overdue" : "pending";
  }

  deactivate() {
    this.props.active = false;
  }

  toSnapshot(): Readonly<SubscriptionProps> {
    return { ...this.props };
  }
}
