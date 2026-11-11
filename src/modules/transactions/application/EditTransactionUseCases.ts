import { DomainError, err, ok, type IUnitOfWork, type Result } from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import type { IAccountRepository } from "@/modules/accounts/domain";
import type {
  IBudgetLedgerPort,
  ICreditCardPurchaseReader,
  ICreditCardPurchaseWriter,
  ITransactionReader,
  ITransactionWriter,
} from "../domain";
import type { ITransactionDeletedHandler } from "./ports";
import type { TransactionPostingService } from "./TransactionPostingService";

/**
 * Elimina una transacción revirtiendo TODOS sus efectos (saldo, sobres, cuotas,
 * pierna opuesta de una transferencia) dentro de una única UoW.
 */
export class DeleteTransactionUseCase implements UseCase<{ transactionId: string }, void> {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly reader: ITransactionReader,
    private readonly accounts: IAccountRepository,
    private readonly purchasesReader: ICreditCardPurchaseReader,
    private readonly purchasesWriter: ICreditCardPurchaseWriter,
    private readonly posting: TransactionPostingService,
    private readonly ledger: IBudgetLedgerPort,
    private readonly handlers: readonly ITransactionDeletedHandler[],
  ) {}

  execute({ transactionId }: { transactionId: string }): Promise<Result<void, DomainError>> {
    return this.uow.transaction(async () => {
      const tx = await this.reader.findById(transactionId);
      if (!tx) return err(DomainError.notFound("Transacción", transactionId));

      const legs = tx.kind === "transfer" && tx.transferGroupId ? await this.reader.findByTransferGroup(tx.transferGroupId) : [tx];

      for (const leg of legs) {
        const account = await this.accounts.findById(leg.accountId);
        if (!account) return err(DomainError.notFound("Cuenta", leg.accountId));
        await this.posting.unpost(leg, account);
        for (const h of this.handlers) await h.onTransactionDeleted(leg.id);
      }

      if (tx.kind === "card_purchase" && tx.purchaseId) {
        const purchase = await this.purchasesReader.findById(tx.purchaseId);
        if (purchase) {
          for (const impact of purchase.budgetImpacts()) {
            await this.ledger.recordActivity(impact.categoryId, impact.month, impact.delta.negate());
          }
          await this.purchasesWriter.delete(purchase.id);
        }
      }
      return ok(undefined);
    });
  }
}

/** Cambia la categoría moviendo la actividad entre sobres (atómico). */
export class RecategorizeTransactionUseCase
  implements UseCase<{ transactionId: string; categoryId: string | null }, void>
{
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly reader: ITransactionReader,
    private readonly writer: ITransactionWriter,
    private readonly ledger: IBudgetLedgerPort,
  ) {}

  execute(input: { transactionId: string; categoryId: string | null }): Promise<Result<void, DomainError>> {
    return this.uow.transaction(async () => {
      const tx = await this.reader.findById(input.transactionId);
      if (!tx) return err(DomainError.notFound("Transacción", input.transactionId));
      if (tx.kind === "card_purchase") {
        return err(DomainError.validation("Las compras en cuotas se recategorizan eliminándolas y cargándolas de nuevo"));
      }
      if (tx.kind === "transfer") return err(DomainError.validation("Las transferencias no llevan categoría"));

      const { before, after } = tx.recategorize(input.categoryId);
      if (before) await this.ledger.recordActivity(before.categoryId, before.month, before.delta.negate());
      if (after) await this.ledger.recordActivity(after.categoryId, after.month, after.delta);
      await this.writer.save(tx);
      return ok(undefined);
    });
  }
}
