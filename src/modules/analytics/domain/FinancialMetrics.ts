import { Money, type Currency } from "@/shared/domain";

export interface SavingsRateResult {
  readonly income: Money;
  readonly expenses: Money;
  readonly saved: Money;
  /** (ingresos − gastos) / ingresos en puntos básicos; null si no hubo ingresos. */
  readonly rateBasisPoints: number | null;
}

export function savingsRate(income: Money, expenses: Money): SavingsRateResult {
  const saved = income.subtract(expenses);
  return {
    income,
    expenses,
    saved,
    rateBasisPoints: income.isPositive() ? saved.ratioInBasisPoints(income) : null,
  };
}

export interface BalanceEntry {
  readonly label: string;
  readonly group: string;
  /** Saldo convertido a moneda base. */
  readonly baseBalance: Money;
  readonly isLiability: boolean;
}

export interface NetWorthResult {
  readonly assets: Money;
  readonly liabilities: Money;
  readonly netWorth: Money;
  readonly byGroup: { group: string; amount: Money }[];
}

/** Patrimonio neto = activos − pasivos (las deudas de tarjeta son saldos negativos). */
export function netWorth(entries: readonly BalanceEntry[], currency: Currency): NetWorthResult {
  const zero = Money.zero(currency);
  let assets = zero;
  let liabilities = zero;
  const groups = new Map<string, Money>();
  for (const e of entries) {
    if (e.baseBalance.isNegative()) liabilities = liabilities.add(e.baseBalance.abs());
    else assets = assets.add(e.baseBalance);
    groups.set(e.group, (groups.get(e.group) ?? zero).add(e.baseBalance));
  }
  return {
    assets,
    liabilities,
    netWorth: assets.subtract(liabilities),
    byGroup: [...groups.entries()].map(([group, amount]) => ({ group, amount })),
  };
}
