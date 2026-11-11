import {
  DomainError,
  err,
  ok,
  type IClock,
  type IIdGenerator,
  type IUnitOfWork,
  type Result,
} from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import type { CurrencyConversionService } from "@/modules/accounts/application/CurrencyConversionService";
import type { IAccountReader } from "@/modules/accounts/domain";
import { Transaction, type MovementInput } from "../domain";
import { parseDateOrToday, parsePositiveAmount } from "./helpers";
import type { ICategorySuggester } from "./ports";
import type { TransactionPostingService } from "./TransactionPostingService";

export interface RecordMovementInput {
  accountId: string;
  /** Monto positivo, admite formato local ("15.000,50"). */
  amount: string;
  date?: string | null;
  description: string;
  categoryId?: string | null;
  notes?: string | null;
  subscriptionId?: string | null;
  importHash?: string | null;
  /** Si no viene categoría, consultar el motor de reglas (default: true). */
  autoCategorize?: boolean;
}

export interface RecordMovementOutput {
  transactionId: string;
  categoryId: string | null;
  appliedRuleId: string | null;
}

export interface RecordMovementDeps {
  uow: IUnitOfWork;
  accounts: IAccountReader;
  posting: TransactionPostingService;
  conversion: CurrencyConversionService;
  suggester: ICategorySuggester;
  ids: IIdGenerator;
  clock: IClock;
}

/**
 * Template Method compartido por RecordExpense y RecordIncome: sólo cambia
 * la fábrica del dominio y el signo. Cada subclase es un caso de uso propio.
 */
abstract class RecordMovementUseCase implements UseCase<RecordMovementInput, RecordMovementOutput> {
  protected abstract readonly direction: -1 | 1;
  protected abstract create(input: MovementInput): Result<Transaction, DomainError>;

  constructor(private readonly deps: RecordMovementDeps) {}

  execute(input: RecordMovementInput): Promise<Result<RecordMovementOutput, DomainError>> {
    const { uow, accounts, posting, conversion, suggester, ids, clock } = this.deps;
    return uow.transaction(async () => {
      const account = await accounts.findById(input.accountId);
      if (!account) return err(DomainError.notFound("Cuenta", input.accountId));

      const amount = parsePositiveAmount(input.amount, account.currency);
      if (!amount.ok) return amount;
      const date = parseDateOrToday(input.date, clock);
      if (!date.ok) return date;
      const baseAmount = (await conversion.converter()).toBaseCurrency(amount.value);
      if (!baseAmount.ok) return baseAmount;

      let categoryId = input.categoryId || null;
      let description = input.description;
      let appliedRuleId: string | null = null;
      if (!categoryId && input.autoCategorize !== false) {
        const suggestion = await suggester.suggest({
          description,
          baseAmount: this.direction < 0 ? baseAmount.value.negate() : baseAmount.value,
          accountId: account.id,
        });
        if (suggestion) {
          categoryId = suggestion.categoryId;
          description = suggestion.description;
          appliedRuleId = suggestion.ruleId;
        }
      }

      const transaction = this.create({
        id: ids.next(),
        accountId: account.id,
        date: date.value,
        amount: amount.value,
        baseAmount: baseAmount.value,
        description,
        categoryId,
        notes: input.notes,
        subscriptionId: input.subscriptionId,
        importHash: input.importHash,
        createdAt: clock.nowISO(),
      });
      if (!transaction.ok) return transaction;

      const posted = await posting.post(transaction.value, account);
      if (!posted.ok) return posted;
      return ok({ transactionId: transaction.value.id, categoryId, appliedRuleId });
    });
  }
}

export class RecordExpenseUseCase extends RecordMovementUseCase {
  protected readonly direction = -1 as const;
  protected create(input: MovementInput) {
    return Transaction.expense(input);
  }
}

export class RecordIncomeUseCase extends RecordMovementUseCase {
  protected readonly direction = 1 as const;
  protected create(input: MovementInput) {
    return Transaction.income(input);
  }
}
