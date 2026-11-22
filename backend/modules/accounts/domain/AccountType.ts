export const ACCOUNT_TYPES = ["cash", "checking", "savings", "wallet", "credit_card", "investment"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

interface AccountTypePolicy {
  readonly label: string;
  /** Pasivo: su saldo negativo representa deuda (tarjetas). */
  readonly isLiability: boolean;
  /** Si puede quedar en negativo (descubierto bancario / deuda de tarjeta). */
  readonly allowsNegativeBalance: boolean;
}

export const ACCOUNT_TYPE_POLICIES: Record<AccountType, AccountTypePolicy> = {
  cash: { label: "Efectivo", isLiability: false, allowsNegativeBalance: false },
  checking: { label: "Cuenta bancaria", isLiability: false, allowsNegativeBalance: true },
  savings: { label: "Caja de ahorro", isLiability: false, allowsNegativeBalance: false },
  wallet: { label: "Billetera virtual", isLiability: false, allowsNegativeBalance: false },
  credit_card: { label: "Tarjeta de crédito", isLiability: true, allowsNegativeBalance: true },
  investment: { label: "Inversiones", isLiability: false, allowsNegativeBalance: false },
};

export function isAccountType(value: string): value is AccountType {
  return (ACCOUNT_TYPES as readonly string[]).includes(value);
}
