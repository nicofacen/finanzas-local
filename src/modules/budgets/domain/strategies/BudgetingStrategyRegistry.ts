import type { BudgetMethodology } from "@/shared/domain";
import type { IBudgetingStrategy } from "./IBudgetingStrategy";
import { SafeToSpendStrategy } from "./SafeToSpendStrategy";
import { ZeroBasedEnvelopeStrategy } from "./ZeroBasedEnvelopeStrategy";

/** Registro de estrategias: OCP — registrar una nueva no toca a los casos de uso. */
export class BudgetingStrategyRegistry {
  private readonly strategies = new Map<BudgetMethodology, IBudgetingStrategy>();

  constructor(strategies: readonly IBudgetingStrategy[] = [new ZeroBasedEnvelopeStrategy(), new SafeToSpendStrategy()]) {
    for (const s of strategies) this.strategies.set(s.id, s);
  }

  get(id: BudgetMethodology): IBudgetingStrategy {
    const s = this.strategies.get(id);
    if (!s) throw new Error(`Estrategia de presupuesto no registrada: ${id}`);
    return s;
  }

  all(): IBudgetingStrategy[] {
    return [...this.strategies.values()];
  }
}
