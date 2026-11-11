import { DomainError, Money, YearMonth, err, ok, type Result } from "@/shared/domain";

export interface SavingsGoalProps {
  id: string;
  name: string;
  target: Money;
  saved: Money;
  monthlyContribution: Money;
  targetMonth: YearMonth | null;
}

/** Meta de ahorro: su aporte mensual se reserva en el modo Safe-to-Spend. */
export class SavingsGoal {
  private constructor(private props: SavingsGoalProps) {}

  static create(input: SavingsGoalProps): Result<SavingsGoal, DomainError> {
    if (input.name.trim().length < 2) return err(DomainError.validation("Nombre de meta demasiado corto"));
    if (!input.target.isPositive()) return err(DomainError.validation("El objetivo debe ser mayor a cero"));
    if (input.saved.isNegative() || input.monthlyContribution.isNegative()) {
      return err(DomainError.validation("Los montos no pueden ser negativos"));
    }
    return ok(new SavingsGoal({ ...input, name: input.name.trim() }));
  }

  static restore(props: SavingsGoalProps) {
    return new SavingsGoal({ ...props });
  }

  get id() {
    return this.props.id;
  }
  get name() {
    return this.props.name;
  }
  get target() {
    return this.props.target;
  }
  get saved() {
    return this.props.saved;
  }
  get monthlyContribution() {
    return this.props.monthlyContribution;
  }
  get targetMonth() {
    return this.props.targetMonth;
  }

  isCompleted(): boolean {
    return this.props.saved.greaterThanOrEqual(this.props.target);
  }

  remaining(): Money {
    const r = this.props.target.subtract(this.props.saved);
    return r.isNegative() ? Money.zero(r.currency) : r;
  }

  progressBasisPoints(): number {
    return Math.min(10_000, this.props.saved.ratioInBasisPoints(this.props.target) ?? 0);
  }

  /** Aporte que corresponde reservar este mes (0 si la meta ya se cumplió). */
  contributionFor(_month: YearMonth): Money {
    if (this.isCompleted()) return Money.zero(this.props.target.currency);
    return this.props.monthlyContribution.min(this.remaining());
  }

  /** Aporte mensual necesario para llegar a tiempo a `targetMonth`. */
  requiredMonthlyContribution(from: YearMonth): Money | null {
    if (!this.props.targetMonth) return null;
    const months = Math.max(1, this.props.targetMonth.monthsSince(from) + 1);
    return this.remaining().multiplyByRatio(1n, BigInt(months), "HALF_UP");
  }

  /** Meses estimados para completar la meta al ritmo actual. */
  monthsToComplete(): number | null {
    if (this.isCompleted()) return 0;
    if (!this.props.monthlyContribution.isPositive()) return null;
    const rem = this.remaining().minor;
    const per = this.props.monthlyContribution.minor;
    return Number((rem + per - 1n) / per);
  }

  contribute(amount: Money): Result<void, DomainError> {
    if (!amount.isPositive()) return err(DomainError.validation("El aporte debe ser mayor a cero"));
    this.props.saved = this.props.saved.add(amount);
    return ok(undefined);
  }

  toSnapshot(): Readonly<SavingsGoalProps> {
    return { ...this.props };
  }
}
