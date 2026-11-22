import type { ICategorizationRule } from "./CategorizationRule";
import type { CategorizationCandidate } from "./RuleSpecifications";

export interface CategorySuggestion {
  readonly ruleId: string;
  readonly categoryId: string;
  readonly description: string;
  readonly explanation: string;
}

/**
 * Motor de categorización local: evalúa las reglas por prioridad y devuelve
 * la primera que aplica. Depende de la abstracción ICategorizationRule (DIP),
 * por lo que acepta reglas de usuario o reglas "aprendidas" indistintamente.
 */
export class CategorizationEngine {
  private readonly rules: readonly ICategorizationRule[];

  constructor(rules: readonly ICategorizationRule[]) {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
  }

  suggest(candidate: CategorizationCandidate): CategorySuggestion | null {
    const rule = this.rules.find((r) => r.appliesTo(candidate));
    if (!rule) return null;
    return {
      ruleId: rule.id,
      categoryId: rule.categoryId,
      description: rule.renameTo ?? candidate.description,
      explanation: rule.describe(),
    };
  }

  suggestMany(candidates: readonly CategorizationCandidate[]): (CategorySuggestion | null)[] {
    return candidates.map((c) => this.suggest(c));
  }
}
