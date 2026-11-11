import { ok, type DomainError, type Result } from "@/shared/domain";
import type { Account, IAccountWriter } from "@/modules/accounts/domain";
import type { IBudgetLedgerPort, ITransactionWriter, Transaction } from "../domain";

/**
 * GRASP Pure Fabrication: encapsula la secuencia "aplicar a la cuenta →
 * persistir transacción → actualizar sobre", reutilizada por gastos, ingresos,
 * importaciones, carga rápida y pagos de suscripciones.
 * Debe invocarse SIEMPRE dentro de una IUnitOfWork.
 */
export class TransactionPostingService {
  constructor(
    private readonly accounts: IAccountWriter,
    private readonly transactions: ITransactionWriter,
    private readonly ledger: IBudgetLedgerPort,
  ) {}

  async post(transaction: Transaction, account: Account): Promise<Result<void, DomainError>> {
    const amount = transaction.amount;
    const applied = amount.isNegative() ? account.withdraw(amount.abs()) : account.deposit(amount);
    if (!applied.ok) return applied;

    await this.accounts.save(account);
    await this.transactions.save(transaction);
    const impact = transaction.budgetImpact();
    if (impact) await this.ledger.recordActivity(impact.categoryId, impact.month, impact.delta);
    return ok(undefined);
  }

  async unpost(transaction: Transaction, account: Account): Promise<void> {
    account.revert(transaction.amount);
    await this.accounts.save(account);
    const impact = transaction.budgetImpact();
    if (impact) await this.ledger.recordActivity(impact.categoryId, impact.month, impact.delta.negate());
    await this.transactions.delete(transaction.id);
  }
}
