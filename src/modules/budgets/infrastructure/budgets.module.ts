import type { CurrencyConversionService } from "@/modules/accounts/application/CurrencyConversionService";
import type { IAccountReader } from "@/modules/accounts/domain";
import type { SharedKernel } from "@/shared/infrastructure/di/SharedKernel";
import { GetBudgetOverviewUseCase } from "../application/GetBudgetOverviewUseCase";
import type { IExpenseRecorder } from "../application/ports";
import {
  AssignToEnvelopeUseCase,
  ContributeToGoalUseCase,
  CreateCategoryUseCase,
  CreateSavingsGoalUseCase,
  CreateSubscriptionUseCase,
  GetSubscriptionCalendarUseCase,
  ListCategoriesUseCase,
  ListSavingsGoalsUseCase,
  PaySubscriptionUseCase,
  SetBudgetMethodologyUseCase,
  SubscriptionPaymentCleanup,
} from "../application/useCases";
import { BudgetingStrategyRegistry, type IBudgetDataSource } from "../domain";
import { BudgetLedgerAdapter } from "./BudgetLedgerAdapter";
import {
  DrizzleCategoryRepository,
  DrizzleEnvelopeRepository,
  DrizzleSavingsGoalRepository,
  DrizzleSubscriptionPaymentRepository,
  DrizzleSubscriptionRepository,
} from "./DrizzleBudgetRepositories";

/** Repositorios del módulo: se crean primero porque otros módulos consumen sus puertos. */
export function createBudgetsPorts(k: SharedKernel) {
  const categories = new DrizzleCategoryRepository(k.database.db);
  const envelopes = new DrizzleEnvelopeRepository(k.database.db);
  const subscriptions = new DrizzleSubscriptionRepository(k.database.db);
  const payments = new DrizzleSubscriptionPaymentRepository(k.database.db);
  const goals = new DrizzleSavingsGoalRepository(k.database.db);
  return {
    categories,
    envelopes,
    subscriptions,
    payments,
    goals,
    ledger: new BudgetLedgerAdapter(envelopes, categories),
    subscriptionCleanup: new SubscriptionPaymentCleanup(payments),
  };
}

export type BudgetsPorts = ReturnType<typeof createBudgetsPorts>;

export function createBudgetsModule(
  k: SharedKernel,
  ports: BudgetsPorts,
  deps: {
    accounts: IAccountReader;
    conversion: CurrencyConversionService;
    dataSource: IBudgetDataSource;
    expenseRecorder: IExpenseRecorder;
  },
) {
  const strategies = new BudgetingStrategyRegistry();
  return {
    ports,
    useCases: {
      createCategory: new CreateCategoryUseCase(ports.categories, k.ids),
      listCategories: new ListCategoriesUseCase(ports.categories),
      assignToEnvelope: new AssignToEnvelopeUseCase(k.uow, ports.categories, ports.envelopes, k.settings),
      setMethodology: new SetBudgetMethodologyUseCase(k.settings),
      getOverview: new GetBudgetOverviewUseCase(
        k.settings,
        ports.categories,
        ports.envelopes,
        ports.subscriptions,
        ports.payments,
        ports.goals,
        deps.dataSource,
        strategies,
        deps.conversion,
        k.clock,
      ),
      createSubscription: new CreateSubscriptionUseCase(ports.subscriptions, deps.accounts, k.ids, k.clock),
      getSubscriptionCalendar: new GetSubscriptionCalendarUseCase(ports.subscriptions, ports.payments, deps.accounts, k.clock),
      paySubscription: new PaySubscriptionUseCase(k.uow, ports.subscriptions, ports.payments, deps.expenseRecorder, k.clock),
      createSavingsGoal: new CreateSavingsGoalUseCase(ports.goals, k.settings, k.ids),
      contributeToGoal: new ContributeToGoalUseCase(ports.goals, k.settings),
      listSavingsGoals: new ListSavingsGoalsUseCase(ports.goals, k.clock),
    },
  };
}

export type BudgetsModule = ReturnType<typeof createBudgetsModule>;
