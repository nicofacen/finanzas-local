import { createAccountsModule } from "@/modules/accounts/infrastructure/accounts.module";
import { createAnalyticsModule } from "@/modules/analytics/infrastructure/analytics.module";
import type { IExpenseRecorder } from "@/modules/budgets/application/ports";
import { createBudgetsModule, createBudgetsPorts } from "@/modules/budgets/infrastructure/budgets.module";
import { createRulesModule } from "@/modules/rules/infrastructure/rules.module";
import { createTransactionsModule } from "@/modules/transactions/infrastructure/transactions.module";
import {
  ExportBackupUseCase,
  ResetDataUseCase,
  RestoreBackupUseCase,
  SnapshotDatabaseUseCase,
} from "@/shared/application/maintenance";
import type { IClock } from "@/shared/domain";
import { SqliteBackupService } from "../backup/SqliteBackupService";
import { openDatabase } from "../persistence/database";
import { DrizzleSettingsStore } from "../persistence/DrizzleSettingsStore";
import { SqliteUnitOfWork } from "../persistence/SqliteUnitOfWork";
import { SeedDemoDataUseCase } from "../seed/SeedDemoDataUseCase";
import { SystemClock, UuidGenerator } from "../system";
import type { SharedKernel } from "./SharedKernel";

export interface ContainerOptions {
  databasePath?: string;
  clock?: IClock;
}

/**
 * COMPOSITION ROOT — el único lugar del sistema que conoce todas las
 * implementaciones concretas. Ensambla los módulos respetando el orden de
 * dependencias y cablea los puertos cruzados:
 *
 *   accounts ──► rules ──► transactions ──► budgets ──► analytics
 *                 ▲            │  ▲             │
 *                 └ suggester ─┘  └── ledger ◄──┘ (IBudgetLedgerPort)
 */
export function buildContainer(options: ContainerOptions = {}) {
  const database = openDatabase(options.databasePath);
  const kernel: SharedKernel = {
    database,
    uow: new SqliteUnitOfWork(database.sqlite),
    ids: new UuidGenerator(),
    clock: options.clock ?? new SystemClock(),
    settings: new DrizzleSettingsStore(database.db),
  };

  const accounts = createAccountsModule(kernel);
  const budgetsPorts = createBudgetsPorts(kernel);
  const rules = createRulesModule(kernel, { categories: budgetsPorts.categories });

  const transactions = createTransactionsModule(kernel, {
    accounts: accounts.ports.accountRepository,
    conversion: accounts.ports.conversion,
    categories: budgetsPorts.categories,
    ledger: budgetsPorts.ledger,
    suggester: rules.ports.suggester,
    deletionHandlers: [budgetsPorts.subscriptionCleanup],
  });

  // Adaptador del puerto IExpenseRecorder de budgets → caso de uso de transactions.
  const expenseRecorder: IExpenseRecorder = {
    recordExpense: async (input) => {
      const r = await transactions.useCases.recordExpense.execute({ ...input, autoCategorize: false });
      return r.ok ? { ok: true, value: { transactionId: r.value.transactionId } } : r;
    },
  };

  const budgets = createBudgetsModule(kernel, budgetsPorts, {
    accounts: accounts.ports.accountRepository,
    conversion: accounts.ports.conversion,
    dataSource: transactions.ports.budgetDataSource,
    expenseRecorder,
  });

  const analytics = createAnalyticsModule(kernel, {
    accounts: accounts.ports.accountRepository,
    categories: budgetsPorts.categories,
    envelopes: budgetsPorts.envelopes,
    conversion: accounts.ports.conversion,
  });

  const backup = new SqliteBackupService(database.sqlite, database.filePath);
  const writeSide = {
    accounts: accounts.useCases,
    transactions: transactions.useCases,
    budgets: budgets.useCases,
    rules: rules.useCases,
  };

  return {
    kernel,
    ...writeSide,
    csvAdapters: transactions.ports.csvAdapters,
    analytics: analytics.useCases,
    system: {
      exportBackup: new ExportBackupUseCase(backup),
      restoreBackup: new RestoreBackupUseCase(backup),
      snapshotDatabase: new SnapshotDatabaseUseCase(backup),
      resetData: new ResetDataUseCase(backup),
      seedDemoData: new SeedDemoDataUseCase(writeSide, kernel, backup),
    },
  };
}

export type AppContainer = ReturnType<typeof buildContainer>;

const globalForContainer = globalThis as unknown as { __finanzasContainer?: AppContainer };

/** Singleton por proceso (sobrevive al hot-reload de Next.js en desarrollo). */
export function getContainer(): AppContainer {
  if (!globalForContainer.__finanzasContainer) globalForContainer.__finanzasContainer = buildContainer();
  return globalForContainer.__finanzasContainer;
}
