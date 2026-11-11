import type { Money } from "@/shared/domain";

/** Puerto hacia el motor de reglas (lo implementa el módulo rules). */
export interface ICategorySuggester {
  suggest(input: { description: string; baseAmount: Money; accountId: string | null }): Promise<{
    categoryId: string;
    description: string;
    ruleId: string;
  } | null>;
}

/** Observador: otros módulos reaccionan al borrado de una transacción (ej. pagos de suscripciones). */
export interface ITransactionDeletedHandler {
  onTransactionDeleted(transactionId: string): Promise<void>;
}
