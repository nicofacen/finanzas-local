import { DomainError, err, ok, type IClock, type IIdGenerator, type IUnitOfWork, type Result } from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import type { CurrencyConversionService } from "@/modules/accounts/application/CurrencyConversionService";
import type { IAccountRepository } from "@/modules/accounts/domain";
import { TransferService, type ITransactionWriter } from "../domain";
import { parseDateOrToday, parsePositiveAmount } from "./helpers";

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  /** Requerido si las cuentas tienen monedas distintas (ej. compra de dólares). */
  receivedAmount?: string | null;
  date?: string | null;
  description?: string | null;
}

/** Transferencia atómica: debita, acredita y registra ambas piernas en una sola UoW. */
export class TransferBetweenAccountsUseCase implements UseCase<TransferInput, { transferGroupId: string }> {
  private readonly service = new TransferService();

  constructor(
    private readonly uow: IUnitOfWork,
    private readonly accounts: IAccountRepository,
    private readonly transactions: ITransactionWriter,
    private readonly conversion: CurrencyConversionService,
    private readonly ids: IIdGenerator,
    private readonly clock: IClock,
  ) {}

  execute(input: TransferInput): Promise<Result<{ transferGroupId: string }, DomainError>> {
    return this.uow.transaction(async () => {
      const [from, to] = await Promise.all([
        this.accounts.findById(input.fromAccountId),
        this.accounts.findById(input.toAccountId),
      ]);
      if (!from) return err(DomainError.notFound("Cuenta origen", input.fromAccountId));
      if (!to) return err(DomainError.notFound("Cuenta destino", input.toAccountId));

      const amount = parsePositiveAmount(input.amount, from.currency);
      if (!amount.ok) return amount;
      let received = null;
      if (input.receivedAmount && !from.currency.equals(to.currency)) {
        const r = parsePositiveAmount(input.receivedAmount, to.currency);
        if (!r.ok) return r;
        received = r.value;
      }
      const date = parseDateOrToday(input.date, this.clock);
      if (!date.ok) return date;
      const base = (await this.conversion.converter()).toBaseCurrency(amount.value);
      if (!base.ok) return base;

      const transferGroupId = this.ids.next();
      const result = this.service.execute({
        transferGroupId,
        outgoingId: this.ids.next(),
        incomingId: this.ids.next(),
        from,
        to,
        date: date.value,
        amount: amount.value,
        receivedAmount: received,
        baseAmount: base.value,
        description: input.description ?? null,
        createdAt: this.clock.nowISO(),
      });
      if (!result.ok) return result;

      await this.accounts.save(from);
      await this.accounts.save(to);
      await this.transactions.saveMany([result.value.outgoing, result.value.incoming]);
      return ok({ transferGroupId });
    });
  }
}
