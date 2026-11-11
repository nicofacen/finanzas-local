import { DomainError, err, ok, type Result } from "@/shared/domain";

export const CATEGORY_KINDS = ["income", "fixed", "variable", "savings"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  income: "Ingreso",
  fixed: "Gasto fijo",
  variable: "Gasto variable",
  savings: "Ahorro",
};

export interface CategoryProps {
  id: string;
  name: string;
  group: string;
  kind: CategoryKind;
  archived: boolean;
}

export class Category {
  private constructor(private props: CategoryProps) {}

  static create(input: Omit<CategoryProps, "archived">): Result<Category, DomainError> {
    const name = input.name.trim();
    if (name.length < 2) return err(DomainError.validation("El nombre de la categoría es demasiado corto"));
    if (!CATEGORY_KINDS.includes(input.kind)) return err(DomainError.validation("Tipo de categoría inválido"));
    return ok(new Category({ ...input, name, group: input.group.trim() || "General", archived: false }));
  }

  static restore(props: CategoryProps) {
    return new Category({ ...props });
  }

  get id() {
    return this.props.id;
  }
  get name() {
    return this.props.name;
  }
  get group() {
    return this.props.group;
  }
  get kind() {
    return this.props.kind;
  }
  get archived() {
    return this.props.archived;
  }

  /** Las categorías de ingreso no tienen sobre: alimentan el "Listo para asignar". */
  get hasEnvelope(): boolean {
    return this.props.kind !== "income";
  }

  toSnapshot(): Readonly<CategoryProps> {
    return { ...this.props };
  }
}
