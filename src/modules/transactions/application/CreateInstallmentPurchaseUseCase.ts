import { DomainError, err, ok, type IClock, type IIdGenerator, type IUnitOfWork, type Result } from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import type { CurrencyConversionService } from "@/modules/accounts/application/CurrencyConversionService";
import type { IAccountRepository } from "@/modules/accounts/domain";
import {
  CreditCardPurchase,
  Transaction,
  type IBudgetLedgerPort,
  type ICreditCardPurchaseWriter,
  type ITransactionWriter,
} from "../domain";
import { parseDateOrToday, parsePositiveAmount } from "./helpers";
import type { ICategorySuggester } from "./ports";

export interface CreateInstallmentPurchaseInput {
  accountId: string;
  total: string;
  installments: number;
  description: string;
  categoryId?: string | null;
  purchaseDate?: string | null;
}

export interface CreateInstallmentPurchaseOutput {
  purchaseId: string;
  firstInstallmentMonth: string;
  installmentAmount: string;
}

/**
 * Compra con tarjeta en N cuotas. En una sola transacción atómica:
 *  1. El agregado CreditCardPurchase crea sus cuotas (Creator).
 *  2. La tarjeta registra la deuda total (respetando el límite).
 *  3. Cada cuota impacta el sobre de su categoría en SU mes → proyecciones futuras.
 */
export class CreateInstallmentPurchaseUseCase
  implements UseCase<CreateInstallmentPurchaseInput, CreateInstallmentPurchaseOutput>
{
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly accounts: IAccountRepository,
    private readonly purchases: ICreditCardPurchaseWriter,
    private readonly transactions: ITransactionWriter,
    private readonly ledger: IBudgetLedgerPort,
    private readonly conversion: CurrencyConversionService,
    private readonly suggester: ICategorySuggester,
    private readonly ids: IIdGenerator,
    private readonly clock: IClock,
  ) {}

  execute(input: CreateInstallmentPurchaseInput): Promise<Result<CreateInstallmentPurchaseOutput, DomainError>> {
    return this.uow.transaction(async () => {
      const card = await this.accounts.findById(input.accountId);
      if (!card) return err(DomainError.notFound("Tarjeta", input.accountId));
      if (!card.isCreditCard) return err(DomainError.validation("Las compras en cuotas requieren una tarjeta de crédito"));

      const total = parsePositiveAmount(input.total, card.currency);
      if (!total.ok) return total;
      const date = parseDateOrToday(input.purchaseDate, this.clock);
      if (!date.ok) return date;
      const baseTotal = (await this.conversion.converter()).toBaseCurrency(total.value);
      if (!baseTotal.ok) return baseTotal;

      let categoryId = input.categoryId || null;
      let description = input.description;
      if (!categoryId) {
        const s = await this.suggester.suggest({ description, baseAmount: baseTotal.value.negate(), accountId: card.id });
        if (s) ({ categoryId, description } = s);
      }

      const purchase = CreditCardPurchase.create({
        id: this.ids.next(),
        accountId: card.id,
        description,
        categoryId,
        purchaseDate: date.value,
        total: total.value,
        baseTotal: baseTotal.value,
        installmentsCount: input.installments,
        closingDay: card.closingDay,
      });
      if (!purchase.ok) return purchase;

      const charged = card.withdraw(total.value);
      if (!charged.ok) return charged;

      const tx = Transaction.cardPurchase({
        id: this.ids.next(),
        accountId: card.id,
        date: date.value,
        amount: total.value,
        baseAmount: baseTotal.value,
        description: `${purchase.value.description} (${input.installments} cuotas)`,
        categoryId,
        purchaseId: purchase.value.id,
        createdAt: this.clock.nowISO(),
      });
      if (!tx.ok) return tx;

      await this.purchases.save(purchase.value);
      await this.accounts.save(card);
      await this.transactions.save(tx.value);
      for (const impact of purchase.value.budgetImpacts()) {
        await this.ledger.recordActivity(impact.categoryId, impact.month, impact.delta);
      }

      return ok({
        purchaseId: purchase.value.id,
        firstInstallmentMonth: purchase.value.plan.firstMonth.toString(),
        installmentAmount: purchase.value.installments[0].amount.format(),
      });
    });
  }
}
