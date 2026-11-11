import { DomainError, InvariantViolation } from "../DomainError";
import { err, ok, type Result } from "../Result";
import { Currency } from "./Currency";
import { divideRounded, type RoundingMode } from "./rounding";

export interface MoneyDTO {
  /** Unidades menores (centavos) serializadas como string para no perder precisión en JSON. */
  readonly minor: string;
  readonly currency: string;
}

const DECIMAL_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?$/;

/**
 * Value Object Money — inmutable, opera EXCLUSIVAMENTE con enteros (bigint)
 * en la unidad menor de su moneda. Nunca usa aritmética de punto flotante.
 */
export class Money {
  private constructor(
    readonly minor: bigint,
    readonly currency: Currency,
  ) {
    Object.freeze(this);
  }

  // ───────────────────────────── Factorías ─────────────────────────────

  static fromMinor(minor: bigint | number, currency: Currency): Money {
    if (typeof minor === "number") {
      if (!Number.isSafeInteger(minor)) {
        throw new InvariantViolation(`Money.fromMinor requiere un entero seguro, recibió ${minor}`);
      }
      minor = BigInt(minor);
    }
    return new Money(minor, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  /**
   * Parsea un decimal canónico ("1234.56", "-0.5", 1234.5).
   * Si trae más decimales que la moneda, redondea con `rounding`.
   * Los `number` se convierten vía su representación decimal más corta (String(n)),
   * que es exacta para cualquier valor escrito por un humano.
   */
  static fromDecimal(
    input: string | number,
    currency: Currency,
    rounding: RoundingMode = "HALF_EVEN",
  ): Result<Money, DomainError> {
    if (typeof input === "number") {
      if (!Number.isFinite(input)) return err(DomainError.validation("Monto inválido"));
      input = Money.numberToPlainString(input);
    }
    const match = DECIMAL_PATTERN.exec(input.trim());
    if (!match) return err(DomainError.validation(`Monto inválido: "${input}"`));
    const [, sign, intPart, fracPart = ""] = match;

    const digits = BigInt(intPart + fracPart);
    const scale = 10n ** BigInt(fracPart.length);
    let minor = divideRounded(digits * currency.minorFactor, scale, rounding);
    if (sign === "-") minor = -minor;
    return ok(new Money(minor, currency));
  }

  static sum(items: readonly Money[], currency: Currency): Money {
    return items.reduce((acc, m) => acc.add(m), Money.zero(currency));
  }

  static fromDTO(dto: MoneyDTO): Money {
    return new Money(BigInt(dto.minor), Currency.fromCode(dto.currency));
  }

  private static numberToPlainString(n: number): string {
    const s = String(n);
    if (!/e/i.test(s)) return s;
    // Notación científica: se resuelve con toFixed acotado (sólo ocurre en extremos).
    return n.toFixed(20).replace(/\.?0+$/, "");
  }

  // ───────────────────────────── Aritmética ─────────────────────────────

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor - other.minor, this.currency);
  }

  /** Multiplicación por un entero (cantidades). */
  multiply(factor: bigint | number): Money {
    if (typeof factor === "number") {
      if (!Number.isInteger(factor)) {
        throw new InvariantViolation("Money.multiply sólo acepta enteros; use multiplyByRatio para fracciones");
      }
      factor = BigInt(factor);
    }
    return new Money(this.minor * factor, this.currency);
  }

  /** Multiplicación por una fracción exacta numerator/denominator con redondeo explícito. */
  multiplyByRatio(numerator: bigint, denominator: bigint, rounding: RoundingMode = "HALF_EVEN"): Money {
    return new Money(divideRounded(this.minor * numerator, denominator, rounding), this.currency);
  }

  /** Porcentaje expresado en puntos básicos (1% = 100 bps) para no usar floats. */
  percentage(basisPoints: bigint | number, rounding: RoundingMode = "HALF_EVEN"): Money {
    return this.multiplyByRatio(BigInt(basisPoints), 10_000n, rounding);
  }

  negate(): Money {
    return new Money(-this.minor, this.currency);
  }

  abs(): Money {
    return this.minor < 0n ? this.negate() : this;
  }

  /**
   * Reparte el monto en `parts` porciones que suman EXACTAMENTE el total.
   * El resto (centavos sobrantes) se distribuye uno a uno en las primeras porciones.
   * Ej: $100,00 / 3 → [33,34; 33,33; 33,33]
   */
  allocate(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts <= 0) {
      throw new InvariantViolation(`allocate requiere un entero positivo, recibió ${parts}`);
    }
    return this.allocateByRatios(Array.from({ length: parts }, () => 1));
  }

  /** Reparte según proporciones enteras (ej. [70, 30]) sin perder centavos. */
  allocateByRatios(ratios: readonly number[]): Money[] {
    if (ratios.length === 0 || ratios.some((r) => !Number.isInteger(r) || r < 0)) {
      throw new InvariantViolation("allocateByRatios requiere proporciones enteras no negativas");
    }
    const total = ratios.reduce((a, b) => a + b, 0);
    if (total === 0) throw new InvariantViolation("La suma de proporciones no puede ser cero");

    const sign = this.minor < 0n ? -1n : 1n;
    const absMinor = this.minor * sign;
    const totalBig = BigInt(total);
    const shares = ratios.map((r) => (absMinor * BigInt(r)) / totalBig);
    let remainder = absMinor - shares.reduce((a, b) => a + b, 0n);
    for (let i = 0; remainder > 0n; i = (i + 1) % shares.length) {
      if (ratios[i] === 0) continue;
      shares[i] += 1n;
      remainder -= 1n;
    }
    return shares.map((s) => new Money(s * sign, this.currency));
  }

  // ───────────────────────────── Comparación ─────────────────────────────

  isZero() {
    return this.minor === 0n;
  }
  isPositive() {
    return this.minor > 0n;
  }
  isNegative() {
    return this.minor < 0n;
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.minor < other.minor ? -1 : this.minor > other.minor ? 1 : 0;
  }
  greaterThan(other: Money) {
    return this.compare(other) === 1;
  }
  greaterThanOrEqual(other: Money) {
    return this.compare(other) >= 0;
  }
  lessThan(other: Money) {
    return this.compare(other) === -1;
  }
  lessThanOrEqual(other: Money) {
    return this.compare(other) <= 0;
  }

  equals(other: Money): boolean {
    return this.currency.equals(other.currency) && this.minor === other.minor;
  }

  max(other: Money): Money {
    return this.greaterThanOrEqual(other) ? this : other;
  }
  min(other: Money): Money {
    return this.lessThanOrEqual(other) ? this : other;
  }

  hasSameCurrency(other: Money): boolean {
    return this.currency.equals(other.currency);
  }

  /** Cociente this/other en puntos básicos (ratios para analítica sin floats). */
  ratioInBasisPoints(other: Money): number | null {
    this.assertSameCurrency(other);
    if (other.minor === 0n) return null;
    return Number(divideRounded(this.minor * 10_000n, other.minor));
  }

  // ───────────────────────────── Representación ─────────────────────────────

  /** "1234.56" — representación decimal exacta. */
  toDecimalString(): string {
    const factor = this.currency.minorFactor;
    const negative = this.minor < 0n;
    const abs = negative ? -this.minor : this.minor;
    const intPart = abs / factor;
    const sign = negative ? "-" : "";
    if (this.currency.decimals === 0) return `${sign}${intPart}`;
    const frac = (abs % factor).toString().padStart(this.currency.decimals, "0");
    return `${sign}${intPart}.${frac}`;
  }

  /**
   * Conversión con pérdida a number — SÓLO para graficar (Recharts) o mostrar.
   * Nunca usar el resultado para volver a calcular dinero.
   */
  toNumberForDisplay(): number {
    return Number(this.toDecimalString());
  }

  /** Formato localizado sin pasar por float: separa miles/decimales a mano. */
  format(options: { showSymbol?: boolean; showCode?: boolean } = {}): string {
    const { showSymbol = true, showCode = false } = options;
    const [intRaw, frac] = this.toDecimalString().replace("-", "").split(".");
    const grouped = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const body = frac ? `${grouped},${frac}` : grouped;
    const sign = this.minor < 0n ? "-" : "";
    const prefix = showSymbol ? `${this.currency.symbol} ` : "";
    const suffix = showCode ? ` ${this.currency.code}` : "";
    return `${sign}${prefix}${body}${suffix}`;
  }

  toDTO(): MoneyDTO {
    return { minor: this.minor.toString(), currency: this.currency.code };
  }

  toJSON(): MoneyDTO {
    return this.toDTO();
  }

  toString() {
    return `${this.toDecimalString()} ${this.currency.code}`;
  }

  private assertSameCurrency(other: Money) {
    if (!this.currency.equals(other.currency)) {
      throw new InvariantViolation(
        `Operación entre monedas distintas (${this.currency.code} vs ${other.currency.code}); convertir primero con ExchangeRate`,
      );
    }
  }
}
