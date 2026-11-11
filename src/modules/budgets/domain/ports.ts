import type { Money, YearMonth } from "@/shared/domain";
import type { EnvelopeRecord } from "./BudgetEnvelope";
import type { Category } from "./Category";
import type { SavingsGoal } from "./SavingsGoal";
import type { Subscription } from "./Subscription";

export interface ICategoryReader {
  findAll(options?: { includeArchived?: boolean }): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
}
export interface ICategoryWriter {
  save(category: Category): Promise<void>;
}

export interface IEnvelopeReader {
  /** Todos los registros de sobres con mes <= `month`. */
  listUntil(month: YearMonth): Promise<EnvelopeRecord[]>;
  find(categoryId: string, month: YearMonth): Promise<EnvelopeRecord | null>;
}
export interface IEnvelopeWriter {
  save(record: EnvelopeRecord): Promise<void>;
}

export interface ISubscriptionReader {
  findAll(): Promise<Subscription[]>;
  findById(id: string): Promise<Subscription | null>;
}
export interface ISubscriptionWriter {
  save(subscription: Subscription): Promise<void>;
}

export interface SubscriptionPayment {
  readonly subscriptionId: string;
  readonly month: YearMonth;
  readonly transactionId: string;
  readonly paidOn: string;
}
export interface ISubscriptionPaymentRepository {
  listForMonth(month: YearMonth): Promise<SubscriptionPayment[]>;
  save(payment: SubscriptionPayment): Promise<void>;
  deleteByTransaction(transactionId: string): Promise<void>;
}

export interface ISavingsGoalReader {
  findAll(): Promise<SavingsGoal[]>;
  findById(id: string): Promise<SavingsGoal | null>;
}
export interface ISavingsGoalWriter {
  save(goal: SavingsGoal): Promise<void>;
}

/**
 * Puerto de lectura hacia los datos transaccionales (lo implementa la
 * infraestructura del módulo transactions). Budgets no conoce sus tablas.
 */
export interface IBudgetDataSource {
  /** Ingresos por mes (moneda base). */
  incomeByMonth(months: readonly YearMonth[]): Promise<Map<string, Money>>;
  cumulativeIncomeUntil(month: YearMonth): Promise<Money>;
  /** Gastos del mes por categoría (moneda base, positivos), excluye pagos de suscripciones. */
  spendingByCategory(month: YearMonth): Promise<{ categoryId: string | null; amount: Money }[]>;
  installmentsDue(month: YearMonth): Promise<{ label: string; amount: Money }[]>;
}
