import type { CurrencyConversionService } from "@/modules/accounts/application/CurrencyConversionService";
import type { IAccountRepository } from "@/modules/accounts/domain";
import type { ICategoryReader } from "@/modules/budgets/domain";
import type { SharedKernel } from "@/shared/infrastructure/di/SharedKernel";
import { CreateInstallmentPurchaseUseCase } from "../application/CreateInstallmentPurchaseUseCase";
import { DeleteTransactionUseCase, RecategorizeTransactionUseCase } from "../application/EditTransactionUseCases";
import {
  ImportBankStatementUseCase,
  PreviewBankStatementUseCase,
  StatementAnalyzer,
} from "../application/ImportBankStatementUseCases";
import type { ICategorySuggester, ITransactionDeletedHandler } from "../application/ports";
import { GetInstallmentsOverviewUseCase, ListTransactionsUseCase } from "../application/queries";
import { PreviewQuickEntryUseCase, QuickEntryInterpreter, QuickEntryUseCase } from "../application/QuickEntryUseCases";
import { RecordExpenseUseCase, RecordIncomeUseCase } from "../application/RecordMovementUseCases";
import { TransactionPostingService } from "../application/TransactionPostingService";
import { TransferBetweenAccountsUseCase } from "../application/TransferBetweenAccountsUseCase";
import type { IBudgetLedgerPort } from "../domain";
import { CsvParserRegistry } from "./csv/adapters";
import { DrizzleCreditCardPurchaseRepository } from "./DrizzleCreditCardPurchaseRepository";
import { DrizzleTransactionRepository } from "./DrizzleTransactionRepository";
import { SqlBudgetDataSource } from "./SqlBudgetDataSource";

export function createTransactionsModule(
  k: SharedKernel,
  deps: {
    accounts: IAccountRepository;
    conversion: CurrencyConversionService;
    categories: ICategoryReader;
    ledger: IBudgetLedgerPort;
    suggester: ICategorySuggester;
    deletionHandlers: ITransactionDeletedHandler[];
  },
) {
  const transactions = new DrizzleTransactionRepository(k.database.db);
  const purchases = new DrizzleCreditCardPurchaseRepository(k.database.db);
  const csvRegistry = new CsvParserRegistry();
  const posting = new TransactionPostingService(deps.accounts, transactions, deps.ledger);
  const baseCurrency = async () => (await k.settings.get()).baseCurrency;

  const movementDeps = {
    uow: k.uow,
    accounts: deps.accounts,
    posting,
    conversion: deps.conversion,
    suggester: deps.suggester,
    ids: k.ids,
    clock: k.clock,
  };
  const recordExpense = new RecordExpenseUseCase(movementDeps);
  const recordIncome = new RecordIncomeUseCase(movementDeps);
  const createInstallmentPurchase = new CreateInstallmentPurchaseUseCase(
    k.uow,
    deps.accounts,
    purchases,
    transactions,
    deps.ledger,
    deps.conversion,
    deps.suggester,
    k.ids,
    k.clock,
  );
  const analyzer = new StatementAnalyzer(deps.accounts, csvRegistry, transactions, deps.suggester, deps.conversion);
  const interpreter = new QuickEntryInterpreter(deps.accounts, deps.categories, deps.suggester, deps.conversion, k.clock);

  return {
    ports: {
      budgetDataSource: new SqlBudgetDataSource(k.database.db, baseCurrency),
      csvAdapters: csvRegistry,
    },
    useCases: {
      recordExpense,
      recordIncome,
      createInstallmentPurchase,
      transfer: new TransferBetweenAccountsUseCase(k.uow, deps.accounts, transactions, deps.conversion, k.ids, k.clock),
      deleteTransaction: new DeleteTransactionUseCase(
        k.uow,
        transactions,
        deps.accounts,
        purchases,
        purchases,
        posting,
        deps.ledger,
        deps.deletionHandlers,
      ),
      recategorize: new RecategorizeTransactionUseCase(k.uow, transactions, transactions, deps.ledger),
      previewStatement: new PreviewBankStatementUseCase(analyzer),
      importStatement: new ImportBankStatementUseCase(k.uow, analyzer, recordExpense, recordIncome),
      previewQuickEntry: new PreviewQuickEntryUseCase(interpreter),
      quickEntry: new QuickEntryUseCase(interpreter, recordExpense, recordIncome, createInstallmentPurchase),
      listTransactions: new ListTransactionsUseCase(transactions, deps.accounts, deps.categories, k.settings),
      installmentsOverview: new GetInstallmentsOverviewUseCase(purchases, deps.accounts, deps.categories, k.settings, k.clock),
    },
  };
}

export type TransactionsModule = ReturnType<typeof createTransactionsModule>;
