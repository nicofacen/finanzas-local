import { Currency, DomainError, Money, err, normalizeText, ok, type Result } from "@/shared/domain";
import { ACCOUNT_TYPE_POLICIES, type AccountType } from "./AccountType";

export interface AccountProps {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: Money;
  creditLimit: Money | null;
  /** Día de cierre del resumen (sólo tarjetas): define en qué mes cae la 1ª cuota. */
  closingDay: number | null;
  /** Alias para la carga rápida: "débito", "visa", "mp". */
  aliases: string[];
  archived: boolean;
  createdAt: string;
}

export interface OpenAccountInput {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  openingBalance: Money;
  creditLimit?: Money | null;
  closingDay?: number | null;
  aliases?: string[];
  createdAt: string;
}

/**
 * Entidad Account — GRASP Information Expert: conoce su saldo y sus reglas
 * (descubierto, límite de crédito, moneda) y es la única que puede modificarlos.
 */
export class Account {
  private constructor(private props: AccountProps) {}

  static open(input: OpenAccountInput): Result<Account, DomainError> {
    const name = input.name.trim();
    if (name.length < 2) return err(DomainError.validation("El nombre de la cuenta debe tener al menos 2 caracteres"));
    if (!input.openingBalance.currency.equals(input.currency)) {
      return err(DomainError.validation("El saldo inicial debe estar en la moneda de la cuenta"));
    }
    const policy = ACCOUNT_TYPE_POLICIES[input.type];
    if (input.openingBalance.isNegative() && !policy.allowsNegativeBalance) {
      return err(DomainError.validation(`Una cuenta de tipo "${policy.label}" no puede iniciar en negativo`));
    }
    const creditLimit = input.type === "credit_card" ? (input.creditLimit ?? null) : null;
    if (creditLimit && (!creditLimit.currency.equals(input.currency) || creditLimit.isNegative())) {
      return err(DomainError.validation("El límite de crédito debe ser positivo y en la moneda de la tarjeta"));
    }
    const closingDay = input.type === "credit_card" ? (input.closingDay ?? null) : null;
    if (closingDay !== null && (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31)) {
      return err(DomainError.validation("El día de cierre debe estar entre 1 y 31"));
    }
    return ok(
      new Account({
        id: input.id,
        name,
        type: input.type,
        currency: input.currency,
        balance: input.openingBalance,
        creditLimit,
        closingDay,
        aliases: (input.aliases ?? []).map((a) => a.trim()).filter(Boolean),
        archived: false,
        createdAt: input.createdAt,
      }),
    );
  }

  static restore(props: AccountProps): Account {
    return new Account({ ...props, aliases: [...props.aliases] });
  }

  // ─────────── Getters ───────────
  get id() {
    return this.props.id;
  }
  get name() {
    return this.props.name;
  }
  get type() {
    return this.props.type;
  }
  get currency() {
    return this.props.currency;
  }
  get balance() {
    return this.props.balance;
  }
  get creditLimit() {
    return this.props.creditLimit;
  }
  get closingDay() {
    return this.props.closingDay;
  }
  get aliases(): readonly string[] {
    return this.props.aliases;
  }
  get archived() {
    return this.props.archived;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get isLiability() {
    return ACCOUNT_TYPE_POLICIES[this.props.type].isLiability;
  }
  get isCreditCard() {
    return this.props.type === "credit_card";
  }

  // ─────────── Comportamiento ───────────

  /** Egreso de dinero (gasto, transferencia saliente, compra con tarjeta). */
  withdraw(amount: Money): Result<void, DomainError> {
    const check = this.assertOperable(amount);
    if (!check.ok) return check;
    const next = this.props.balance.subtract(amount);

    if (this.isCreditCard) {
      if (this.props.creditLimit && next.negate().greaterThan(this.props.creditLimit)) {
        return err(
          new DomainError(
            "CREDIT_LIMIT_EXCEEDED",
            `La operación supera el límite de ${this.props.name} (disponible: ${this.availableToSpend().format()})`,
          ),
        );
      }
    } else if (next.isNegative() && !ACCOUNT_TYPE_POLICIES[this.props.type].allowsNegativeBalance) {
      return err(
        new DomainError(
          "INSUFFICIENT_FUNDS",
          `Saldo insuficiente en ${this.props.name}: disponible ${this.props.balance.format()}, requerido ${amount.format()}`,
        ),
      );
    }
    this.props.balance = next;
    return ok(undefined);
  }

  /** Ingreso de dinero (sueldo, transferencia entrante, pago de tarjeta). */
  deposit(amount: Money): Result<void, DomainError> {
    const check = this.assertOperable(amount);
    if (!check.ok) return check;
    this.props.balance = this.props.balance.add(amount);
    return ok(undefined);
  }

  /**
   * Revierte un movimiento previo (al eliminar una transacción). No valida
   * descubierto: deshacer siempre debe ser posible para mantener consistencia.
   */
  revert(signedAmount: Money): void {
    this.props.balance = this.props.balance.subtract(signedAmount);
  }

  /** Cuánto se puede gastar: saldo, o crédito disponible en tarjetas. */
  availableToSpend(): Money {
    if (this.isCreditCard) {
      if (!this.props.creditLimit) return Money.zero(this.currency);
      return this.props.creditLimit.add(this.props.balance);
    }
    return this.props.balance.isNegative() ? Money.zero(this.currency) : this.props.balance;
  }

  /** ¿Este token de la carga rápida refiere a esta cuenta? */
  matchesAlias(token: string): boolean {
    const t = normalizeText(token);
    if (!t) return false;
    if (normalizeText(this.props.name) === t) return true;
    if (this.props.aliases.some((a) => normalizeText(a) === t)) return true;
    return normalizeText(this.props.name).split(" ").includes(t) && t.length >= 3;
  }

  rename(name: string): Result<void, DomainError> {
    if (name.trim().length < 2) return err(DomainError.validation("Nombre demasiado corto"));
    this.props.name = name.trim();
    return ok(undefined);
  }

  archive() {
    this.props.archived = true;
  }

  toSnapshot(): Readonly<AccountProps> {
    return { ...this.props, aliases: [...this.props.aliases] };
  }

  private assertOperable(amount: Money): Result<void, DomainError> {
    if (this.props.archived) return err(DomainError.conflict(`La cuenta ${this.props.name} está archivada`));
    if (!amount.currency.equals(this.props.currency)) {
      return err(
        new DomainError(
          "CURRENCY_MISMATCH",
          `La cuenta ${this.props.name} opera en ${this.props.currency.code}, no en ${amount.currency.code}`,
        ),
      );
    }
    if (!amount.isPositive()) return err(DomainError.validation("El monto debe ser mayor a cero"));
    return ok(undefined);
  }
}
