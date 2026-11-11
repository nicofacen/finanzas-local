import { CompositeSpecification, DomainError, err, normalizeText, ok, type Result } from "@/shared/domain";

/** Lo que se evalúa al categorizar: un movimiento todavía sin categoría. */
export interface CategorizationCandidate {
  readonly description: string;
  /** Monto con signo en unidades menores de la moneda base (negativo = gasto). */
  readonly baseAmountMinor: bigint;
  readonly accountId: string | null;
}

export const CONDITION_FIELDS = ["description", "amount", "account"] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export const CONDITION_OPERATORS = ["contains", "equals", "starts_with", "regex", "gte", "lte"] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface RuleCondition {
  readonly field: ConditionField;
  readonly operator: ConditionOperator;
  /** Para montos: decimal canónico absoluto en moneda base ("5000.00"). */
  readonly value: string;
}

// ─────────────── Especificaciones concretas ───────────────

export class DescriptionContains extends CompositeSpecification<CategorizationCandidate> {
  private readonly needle: string;
  constructor(text: string) {
    super();
    this.needle = normalizeText(text);
  }
  isSatisfiedBy(c: CategorizationCandidate) {
    return normalizeText(c.description).includes(this.needle);
  }
  describe() {
    return `descripción contiene "${this.needle}"`;
  }
}

export class DescriptionEquals extends CompositeSpecification<CategorizationCandidate> {
  private readonly value: string;
  constructor(text: string) {
    super();
    this.value = normalizeText(text);
  }
  isSatisfiedBy(c: CategorizationCandidate) {
    return normalizeText(c.description) === this.value;
  }
  describe() {
    return `descripción es "${this.value}"`;
  }
}

export class DescriptionStartsWith extends CompositeSpecification<CategorizationCandidate> {
  private readonly prefix: string;
  constructor(text: string) {
    super();
    this.prefix = normalizeText(text);
  }
  isSatisfiedBy(c: CategorizationCandidate) {
    return normalizeText(c.description).startsWith(this.prefix);
  }
  describe() {
    return `descripción empieza con "${this.prefix}"`;
  }
}

export class DescriptionMatchesRegex extends CompositeSpecification<CategorizationCandidate> {
  constructor(private readonly regex: RegExp) {
    super();
  }
  isSatisfiedBy(c: CategorizationCandidate) {
    return this.regex.test(c.description);
  }
  describe() {
    return `descripción coincide con /${this.regex.source}/`;
  }
}

/** Compara el valor ABSOLUTO del monto (para que "gasto mayor a 5000" sea intuitivo). */
export class AbsoluteAmountCompare extends CompositeSpecification<CategorizationCandidate> {
  constructor(
    private readonly operator: "gte" | "lte",
    private readonly thresholdMinor: bigint,
  ) {
    super();
  }
  isSatisfiedBy(c: CategorizationCandidate) {
    const abs = c.baseAmountMinor < 0n ? -c.baseAmountMinor : c.baseAmountMinor;
    return this.operator === "gte" ? abs >= this.thresholdMinor : abs <= this.thresholdMinor;
  }
  describe() {
    return `monto ${this.operator === "gte" ? "≥" : "≤"} ${this.thresholdMinor} (centavos)`;
  }
}

export class AccountIs extends CompositeSpecification<CategorizationCandidate> {
  constructor(private readonly accountId: string) {
    super();
  }
  isSatisfiedBy(c: CategorizationCandidate) {
    return c.accountId === this.accountId;
  }
  describe() {
    return `cuenta = ${this.accountId}`;
  }
}

// ─────────────── Factoría: condición serializable → Specification ───────────────

export function specificationFromCondition(
  condition: RuleCondition,
  minorFactor: bigint,
): Result<CompositeSpecification<CategorizationCandidate>, DomainError> {
  const value = condition.value.trim();
  if (!value) return err(DomainError.validation("Las condiciones no pueden estar vacías"));

  switch (condition.field) {
    case "description":
      switch (condition.operator) {
        case "contains":
          return ok(new DescriptionContains(value));
        case "equals":
          return ok(new DescriptionEquals(value));
        case "starts_with":
          return ok(new DescriptionStartsWith(value));
        case "regex":
          try {
            return ok(new DescriptionMatchesRegex(new RegExp(value, "i")));
          } catch {
            return err(DomainError.validation(`Expresión regular inválida: ${value}`));
          }
        default:
          return err(DomainError.validation(`Operador "${condition.operator}" no aplica a la descripción`));
      }
    case "amount": {
      if (condition.operator !== "gte" && condition.operator !== "lte") {
        return err(DomainError.validation("Para montos usá 'mayor o igual' o 'menor o igual'"));
      }
      const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
      if (!m) return err(DomainError.validation(`Monto inválido en condición: ${value}`));
      const frac = (m[2] ?? "").padEnd(2, "0");
      const minor = (BigInt(m[1]) * 100n + BigInt(frac)) * minorFactor / 100n;
      return ok(new AbsoluteAmountCompare(condition.operator, minor));
    }
    case "account":
      if (condition.operator !== "equals") return err(DomainError.validation("Para cuentas usá 'es igual a'"));
      return ok(new AccountIs(value));
  }
}
