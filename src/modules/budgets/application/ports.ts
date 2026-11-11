import type { DomainError, Result } from "@/shared/domain";

/**
 * Puerto de salida: budgets necesita registrar un gasto al pagar una suscripción,
 * pero no depende del caso de uso concreto de transactions (lo cablea el contenedor).
 */
export interface IExpenseRecorder {
  recordExpense(input: {
    accountId: string;
    amount: string;
    date: string;
    description: string;
    categoryId: string | null;
    subscriptionId: string;
  }): Promise<Result<{ transactionId: string }, DomainError>>;
}
