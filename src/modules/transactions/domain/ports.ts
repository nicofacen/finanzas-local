import type { DomainError, LocalDate, Money, Result, YearMonth } from "@/shared/domain";
import type { CreditCardPurchase } from "./CreditCardPurchase";
import type { Transaction } from "./Transaction";

// ─────────────── Repositorios (SOLID ISP: lectura / escritura separadas) ───────────────

export interface TransactionFilter {
  accountId?: string;
  categoryId?: string;
  search?: string;
}

export interface ITransactionReader {
  findById(id: string): Promise<Transaction | null>;
  findByTransferGroup(groupId: string): Promise<Transaction[]>;
  findByPurchase(purchaseId: string): Promise<Transaction | null>;
  listByMonth(month: YearMonth, filter?: TransactionFilter): Promise<Transaction[]>;
  listBetween(from: LocalDate, to: LocalDate): Promise<Transaction[]>;
  /** Devuelve cuáles de las huellas ya existen (deduplicación de importaciones). */
  existingImportHashes(hashes: readonly string[]): Promise<Set<string>>;
}

export interface ITransactionWriter {
  save(transaction: Transaction): Promise<void>;
  saveMany(transactions: readonly Transaction[]): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ICreditCardPurchaseReader {
  findById(id: string): Promise<CreditCardPurchase | null>;
  /** Compras con al menos una cuota en [from, to]. */
  listOverlapping(from: YearMonth, to: YearMonth): Promise<CreditCardPurchase[]>;
}

export interface ICreditCardPurchaseWriter {
  save(purchase: CreditCardPurchase): Promise<void>;
  delete(id: string): Promise<void>;
}

// ─────────────── Puertos hacia otros módulos (hexagonal) ───────────────

/**
 * Puerto de salida hacia el módulo budgets: el módulo de transacciones sólo
 * sabe que existe "un libro de sobres" donde registrar actividad.
 */
export interface IBudgetLedgerPort {
  recordActivity(categoryId: string, month: YearMonth, delta: Money): Promise<void>;
}

// ─────────────── Importación de extractos (Protected Variations) ───────────────

export interface StatementLine {
  date: LocalDate;
  description: string;
  /** Decimal canónico con signo: negativo = egreso. */
  amount: string;
  reference: string | null;
}

/**
 * Cada banco/billetera exporta un CSV distinto. Los casos de uso dependen sólo
 * de este contrato; agregar un banco nuevo = agregar un adaptador.
 */
export interface ICsvParserAdapter {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  parse(content: string): Result<StatementLine[], DomainError>;
}

export interface ICsvParserRegistry {
  get(id: string): ICsvParserAdapter | undefined;
  list(): readonly ICsvParserAdapter[];
}
