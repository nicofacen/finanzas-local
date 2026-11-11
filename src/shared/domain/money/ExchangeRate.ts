import { DomainError, InvariantViolation } from "../DomainError";
import { err, ok, type Result } from "../Result";
import type { LocalDate } from "../time/LocalDate";
import { Currency } from "./Currency";
import { Money } from "./Money";
import { divideRounded, type RoundingMode } from "./rounding";

/** Precisión del tipo de cambio: 8 decimales almacenados como entero escalado. */
export const RATE_SCALE = 10n ** 8n;

/**
 * Tipo de cambio manual: 1 unidad de `from` = `rate` unidades de `to`.
 * El rate se guarda como bigint escalado (rate × 10^8) → cero floats.
 */
export class ExchangeRate {
  private constructor(
    readonly from: Currency,
    readonly to: Currency,
    readonly scaledRate: bigint,
    readonly effectiveDate: LocalDate,
  ) {
    Object.freeze(this);
  }

  static create(
    from: Currency,
    to: Currency,
    rate: string,
    effectiveDate: LocalDate,
  ): Result<ExchangeRate, DomainError> {
    if (from.equals(to)) return err(DomainError.validation("El tipo de cambio requiere dos monedas distintas"));
    const match = /^(\d+)(?:[.,](\d{1,8}))?$/.exec(rate.trim());
    if (!match) return err(DomainError.validation(`Tipo de cambio inválido: "${rate}" (máx. 8 decimales)`));
    const [, intPart, frac = ""] = match;
    const scaled = BigInt(intPart) * RATE_SCALE + BigInt(frac.padEnd(8, "0"));
    if (scaled <= 0n) return err(DomainError.validation("El tipo de cambio debe ser mayor a cero"));
    return ok(new ExchangeRate(from, to, scaled, effectiveDate));
  }

  static restore(from: Currency, to: Currency, scaledRate: bigint, effectiveDate: LocalDate): ExchangeRate {
    return new ExchangeRate(from, to, scaledRate, effectiveDate);
  }

  /**
   * Convierte `money` (en `from`) a `to`, ajustando la diferencia de decimales:
   * destino_minor = origen_minor × rate × 10^dec(to) / (10^dec(from) × SCALE)
   */
  convert(money: Money, rounding: RoundingMode = "HALF_EVEN"): Money {
    if (!money.currency.equals(this.from)) {
      throw new InvariantViolation(`ExchangeRate ${this.from.code}→${this.to.code} no aplica a ${money.currency.code}`);
    }
    const numerator = money.minor * this.scaledRate * this.to.minorFactor;
    const denominator = this.from.minorFactor * RATE_SCALE;
    return Money.fromMinor(divideRounded(numerator, denominator, rounding), this.to);
  }

  inverse(): ExchangeRate {
    const inverted = divideRounded(RATE_SCALE * RATE_SCALE, this.scaledRate);
    return new ExchangeRate(this.to, this.from, inverted, this.effectiveDate);
  }

  rateAsDecimalString(): string {
    const intPart = this.scaledRate / RATE_SCALE;
    const frac = (this.scaledRate % RATE_SCALE).toString().padStart(8, "0").replace(/0+$/, "");
    return frac ? `${intPart}.${frac}` : intPart.toString();
  }
}
