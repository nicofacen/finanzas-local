import type { Currency, ExchangeRate } from "@/shared/domain";
import type { Account } from "./Account";

/** SOLID ISP: lectores y escritores separados; cada caso de uso pide sólo lo que usa. */
export interface IAccountReader {
  findById(id: string): Promise<Account | null>;
  findAll(options?: { includeArchived?: boolean }): Promise<Account[]>;
}

export interface IAccountWriter {
  save(account: Account): Promise<void>;
}

export type IAccountRepository = IAccountReader & IAccountWriter;

export interface IExchangeRateReader {
  /** Último tipo de cambio cargado por moneda. */
  findLatestAll(): Promise<ExchangeRate[]>;
  history(currency: Currency, limit: number): Promise<ExchangeRate[]>;
}

export interface IExchangeRateWriter {
  save(rate: ExchangeRate): Promise<void>;
}
