import { DomainError, LocalDate, Money, YearMonth, err, ok, type Result } from "@/shared/domain";

export const TRANSACTION_KINDS = ["expense", "income", "transfer", "card_purchase"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export interface TransactionProps {
  id: string;
  accountId: string;
  date: LocalDate;
  /** Monto con signo en la moneda de la cuenta (negativo = sale dinero). */
  amount: Money;
  /** Mismo monto convertido a la moneda base al momento de registrarlo. */
  baseAmount: Money;
  description: string;
  categoryId: string | null;
  kind: TransactionKind;
  transferGroupId: string | null;
  purchaseId: string | null;
  subscriptionId: string | null;
  importHash: string | null;
  notes: string | null;
  createdAt: string;
}

export interface MovementInput {
  id: string;
  accountId: string;
  date: LocalDate;
  /** Siempre positivo: el signo lo define el tipo de movimiento. */
  amount: Money;
  baseAmount: Money;
  description: string;
  categoryId?: string | null;
  subscriptionId?: string | null;
  importHash?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface BudgetImpact {
  readonly categoryId: string;
  readonly month: YearMonth;
  /** En moneda base, con signo (gasto = negativo). */
  readonly delta: Money;
}

/**
 * Entidad Transaction — Information Expert de su propio impacto contable
 * (sobre el saldo de la cuenta) y presupuestario (sobre el sobre de su categoría).
 */
export class Transaction {
  private constructor(private props: TransactionProps) {}

  static expense(input: MovementInput): Result<Transaction, DomainError> {
    return Transaction.createMovement(input, "expense", -1);
  }

  static income(input: MovementInput): Result<Transaction, DomainError> {
    return Transaction.createMovement(input, "income", 1);
  }

  /** Pierna de una transferencia: `direction` -1 sale, +1 entra. */
  static transferLeg(
    input: MovementInput & { transferGroupId: string },
    direction: -1 | 1,
  ): Result<Transaction, DomainError> {
    const r = Transaction.createMovement(input, "transfer", direction);
    if (r.ok) r.value.props.transferGroupId = input.transferGroupId;
    return r;
  }

  /**
   * Compra en cuotas: impacta el saldo (deuda) de la tarjeta por el total,
   * pero su impacto presupuestario se difiere a cada cuota.
   */
  static cardPurchase(input: MovementInput & { purchaseId: string }): Result<Transaction, DomainError> {
    const r = Transaction.createMovement(input, "card_purchase", -1);
    if (r.ok) r.value.props.purchaseId = input.purchaseId;
    return r;
  }

  static restore(props: TransactionProps): Transaction {
    return new Transaction({ ...props });
  }

  private static createMovement(
    input: MovementInput,
    kind: TransactionKind,
    sign: -1 | 1,
  ): Result<Transaction, DomainError> {
    const description = input.description.trim();
    if (!description) return err(DomainError.validation("La descripción es obligatoria"));
    if (description.length > 200) return err(DomainError.validation("La descripción no puede superar 200 caracteres"));
    if (!input.amount.isPositive()) return err(DomainError.validation("El monto debe ser mayor a cero"));
    if (input.baseAmount.isNegative()) return err(DomainError.validation("El monto en moneda base no puede ser negativo"));

    return ok(
      new Transaction({
        id: input.id,
        accountId: input.accountId,
        date: input.date,
        amount: sign < 0 ? input.amount.negate() : input.amount,
        baseAmount: sign < 0 ? input.baseAmount.negate() : input.baseAmount,
        description,
        categoryId: input.categoryId ?? null,
        kind,
        transferGroupId: null,
        purchaseId: null,
        subscriptionId: input.subscriptionId ?? null,
        importHash: input.importHash ?? null,
        notes: input.notes?.trim() || null,
        createdAt: input.createdAt,
      }),
    );
  }

  // ─────────── Getters ───────────
  get id() {
    return this.props.id;
  }
  get accountId() {
    return this.props.accountId;
  }
  get date() {
    return this.props.date;
  }
  get month() {
    return this.props.date.yearMonth;
  }
  get amount() {
    return this.props.amount;
  }
  get baseAmount() {
    return this.props.baseAmount;
  }
  get description() {
    return this.props.description;
  }
  get categoryId() {
    return this.props.categoryId;
  }
  get kind() {
    return this.props.kind;
  }
  get transferGroupId() {
    return this.props.transferGroupId;
  }
  get purchaseId() {
    return this.props.purchaseId;
  }
  get subscriptionId() {
    return this.props.subscriptionId;
  }
  get importHash() {
    return this.props.importHash;
  }
  get notes() {
    return this.props.notes;
  }
  get createdAt() {
    return this.props.createdAt;
  }

  // ─────────── Reglas ───────────

  get isOutflow(): boolean {
    return this.props.amount.isNegative();
  }

  /** ¿Cuenta como gasto consumido en el mes? (las compras en cuotas se cuentan por cuota). */
  get countsAsSpending(): boolean {
    return this.props.kind === "expense";
  }

  /**
   * Efecto sobre el sobre presupuestario. Sólo gastos categorizados
   * (o reintegros categorizados) mueven la "actividad" del sobre.
   */
  budgetImpact(): BudgetImpact | null {
    if (this.props.kind !== "expense" || !this.props.categoryId) return null;
    return { categoryId: this.props.categoryId, month: this.month, delta: this.props.baseAmount };
  }

  /** Recategorizar devuelve el impacto a revertir y el nuevo a aplicar. */
  recategorize(categoryId: string | null): { before: BudgetImpact | null; after: BudgetImpact | null } {
    const before = this.budgetImpact();
    this.props.categoryId = categoryId;
    return { before, after: this.budgetImpact() };
  }

  toSnapshot(): Readonly<TransactionProps> {
    return { ...this.props };
  }
}
