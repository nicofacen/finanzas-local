import type { Currency } from "../money/Currency";

export type BudgetMethodology = "zero-based" | "safe-to-spend";

export interface AppSettings {
  readonly baseCurrency: Currency;
  readonly budgetMethodology: BudgetMethodology;
  /** Umbral (en moneda base, unidades menores) para considerar un gasto "hormiga". */
  readonly antExpenseThresholdMinor: bigint;
}

export interface ISettingsReader {
  get(): Promise<AppSettings>;
}

export interface ISettingsWriter {
  update(patch: Partial<AppSettings>): Promise<void>;
}
