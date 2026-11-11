import {
  AndSpecification,
  DomainError,
  OrSpecification,
  Results,
  err,
  ok,
  type ISpecification,
  type Result,
} from "@/shared/domain";
import { specificationFromCondition, type CategorizationCandidate, type RuleCondition } from "./RuleSpecifications";

export type MatchMode = "all" | "any";

export interface CategorizationRuleProps {
  id: string;
  name: string;
  /** Menor número = mayor prioridad. */
  priority: number;
  matchMode: MatchMode;
  conditions: RuleCondition[];
  categoryId: string;
  /** Opcional: renombrar la descripción ("MERPAGO*UBER TRIP" → "Uber"). */
  renameTo: string | null;
  active: boolean;
}

/**
 * Contrato del motor (Strategy/Specification): cualquier regla que sepa decir
 * si aplica a un candidato y qué categoría sugiere.
 */
export interface ICategorizationRule {
  readonly id: string;
  readonly priority: number;
  readonly categoryId: string;
  readonly renameTo: string | null;
  appliesTo(candidate: CategorizationCandidate): boolean;
  describe(): string;
}

/** Regla configurable por el usuario: condiciones serializables → Specification compuesta. */
export class CategorizationRule implements ICategorizationRule {
  private constructor(
    private readonly props: CategorizationRuleProps,
    private readonly spec: ISpecification<CategorizationCandidate>,
  ) {}

  static create(props: CategorizationRuleProps, minorFactor = 100n): Result<CategorizationRule, DomainError> {
    if (props.name.trim().length < 2) return err(DomainError.validation("El nombre de la regla es demasiado corto"));
    if (props.conditions.length === 0) return err(DomainError.validation("La regla necesita al menos una condición"));
    if (!props.categoryId) return err(DomainError.validation("La regla debe asignar una categoría"));

    const specs = Results.combine(props.conditions.map((c) => specificationFromCondition(c, minorFactor)));
    if (!specs.ok) return specs;
    const spec = props.matchMode === "all" ? new AndSpecification(specs.value) : new OrSpecification(specs.value);
    return ok(new CategorizationRule({ ...props, name: props.name.trim(), renameTo: props.renameTo?.trim() || null }, spec));
  }

  get id() {
    return this.props.id;
  }
  get name() {
    return this.props.name;
  }
  get priority() {
    return this.props.priority;
  }
  get categoryId() {
    return this.props.categoryId;
  }
  get renameTo() {
    return this.props.renameTo;
  }
  get active() {
    return this.props.active;
  }
  get conditions(): readonly RuleCondition[] {
    return this.props.conditions;
  }
  get matchMode() {
    return this.props.matchMode;
  }

  appliesTo(candidate: CategorizationCandidate): boolean {
    return this.props.active && this.spec.isSatisfiedBy(candidate);
  }

  describe(): string {
    return this.spec.describe();
  }

  toggle(active: boolean) {
    this.props.active = active;
  }

  toSnapshot(): Readonly<CategorizationRuleProps> {
    return { ...this.props, conditions: [...this.props.conditions] };
  }
}
