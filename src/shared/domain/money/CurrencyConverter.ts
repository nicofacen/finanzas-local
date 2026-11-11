import { DomainError } from "../DomainError";
import { err, ok, type Result } from "../Result";
import type { Currency } from "./Currency";
import type { ExchangeRate } from "./ExchangeRate";
import type { Money } from "./Money";

/**
 * Servicio de dominio puro: convierte entre monedas usando los tipos de cambio
 * manuales cargados por el usuario. Usa la moneda base como pivote
 * (USD→ARS→EUR) cuando no hay un par directo.
 */
export class CurrencyConverter {
  private readonly toBase = new Map<string, ExchangeRate>();

  constructor(
    readonly baseCurrency: Currency,
    rates: readonly ExchangeRate[],
  ) {
    for (const rate of rates) {
      if (rate.to.equals(baseCurrency)) this.keepLatest(rate);
      else if (rate.from.equals(baseCurrency)) this.keepLatest(rate.inverse());
    }
  }

  private keepLatest(rate: ExchangeRate) {
    const current = this.toBase.get(rate.from.code);
    if (!current || rate.effectiveDate.compare(current.effectiveDate) >= 0) {
      this.toBase.set(rate.from.code, rate);
    }
  }

  canConvert(from: Currency, to: Currency): boolean {
    if (from.equals(to)) return true;
    const fromOk = from.equals(this.baseCurrency) || this.toBase.has(from.code);
    const toOk = to.equals(this.baseCurrency) || this.toBase.has(to.code);
    return fromOk && toOk;
  }

  convert(money: Money, to: Currency): Result<Money, DomainError> {
    if (money.currency.equals(to)) return ok(money);
    if (!this.canConvert(money.currency, to)) {
      return err(
        new DomainError(
          "CURRENCY_MISMATCH",
          `No hay tipo de cambio cargado para ${money.currency.code}→${to.code}. Cargalo en Cuentas → Tipos de cambio.`,
        ),
      );
    }
    const inBase = money.currency.equals(this.baseCurrency) ? money : this.toBase.get(money.currency.code)!.convert(money);
    if (to.equals(this.baseCurrency)) return ok(inBase);
    return ok(this.toBase.get(to.code)!.inverse().convert(inBase));
  }

  toBaseCurrency(money: Money): Result<Money, DomainError> {
    return this.convert(money, this.baseCurrency);
  }

  rates(): ExchangeRate[] {
    return [...this.toBase.values()];
  }
}
