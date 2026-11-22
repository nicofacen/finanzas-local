/**
 * Patrón Specification genérico: reglas de negocio combinables (AND/OR/NOT).
 * Lo reutilizan el motor de categorización (rules) y la detección de gastos hormiga (analytics).
 */
export interface ISpecification<T> {
  isSatisfiedBy(candidate: T): boolean;
  describe(): string;
}

export abstract class CompositeSpecification<T> implements ISpecification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;
  abstract describe(): string;

  and(other: ISpecification<T>): ISpecification<T> {
    return new AndSpecification([this, other]);
  }
  or(other: ISpecification<T>): ISpecification<T> {
    return new OrSpecification([this, other]);
  }
  not(): ISpecification<T> {
    return new NotSpecification(this);
  }
}

export class AndSpecification<T> extends CompositeSpecification<T> {
  constructor(private readonly specs: readonly ISpecification<T>[]) {
    super();
  }
  isSatisfiedBy(c: T) {
    return this.specs.length > 0 && this.specs.every((s) => s.isSatisfiedBy(c));
  }
  describe() {
    return this.specs.map((s) => s.describe()).join(" Y ");
  }
}

export class OrSpecification<T> extends CompositeSpecification<T> {
  constructor(private readonly specs: readonly ISpecification<T>[]) {
    super();
  }
  isSatisfiedBy(c: T) {
    return this.specs.some((s) => s.isSatisfiedBy(c));
  }
  describe() {
    return this.specs.map((s) => s.describe()).join(" O ");
  }
}

export class NotSpecification<T> extends CompositeSpecification<T> {
  constructor(private readonly spec: ISpecification<T>) {
    super();
  }
  isSatisfiedBy(c: T) {
    return !this.spec.isSatisfiedBy(c);
  }
  describe() {
    return `NO (${this.spec.describe()})`;
  }
}
