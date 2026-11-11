import { Currency, InvariantViolation, Money } from "@/shared/domain";

/** SQLite INTEGER → Money. */
export function toMoney(minor: number, currencyCode: string): Money {
  return Money.fromMinor(minor, Currency.fromCode(currencyCode));
}

/** Money → SQLite INTEGER (verifica que entre en un entero seguro de JS). */
export function toMinor(money: Money): number {
  const n = Number(money.minor);
  if (!Number.isSafeInteger(n)) throw new InvariantViolation(`Monto fuera de rango para SQLite: ${money.toString()}`);
  return n;
}
