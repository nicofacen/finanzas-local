import { DomainError } from "../DomainError";
import { err, ok, type Result } from "../Result";

interface CurrencyDefinition {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  /** Cantidad de decimales de la unidad menor (ARS/USD = 2 → centavos; CLP = 0). */
  readonly decimals: number;
}

const DEFINITIONS: Record<string, CurrencyDefinition> = {
  ARS: { code: "ARS", name: "Peso argentino", symbol: "$", decimals: 2 },
  USD: { code: "USD", name: "Dólar estadounidense", symbol: "US$", decimals: 2 },
  EUR: { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  BRL: { code: "BRL", name: "Real brasileño", symbol: "R$", decimals: 2 },
  UYU: { code: "UYU", name: "Peso uruguayo", symbol: "$U", decimals: 2 },
  CLP: { code: "CLP", name: "Peso chileno", symbol: "CLP$", decimals: 0 },
  MXN: { code: "MXN", name: "Peso mexicano", symbol: "MX$", decimals: 2 },
};

/** Value Object inmutable. Instancias canónicas (flyweight): se comparan por código. */
export class Currency {
  private static readonly cache = new Map<string, Currency>();

  private constructor(
    readonly code: string,
    readonly name: string,
    readonly symbol: string,
    readonly decimals: number,
  ) {
    Object.freeze(this);
  }

  static of(code: string): Result<Currency, DomainError> {
    const upper = code.trim().toUpperCase();
    const def = DEFINITIONS[upper];
    if (!def) return err(DomainError.validation(`Moneda no soportada: ${code}`));
    let c = Currency.cache.get(upper);
    if (!c) {
      c = new Currency(def.code, def.name, def.symbol, def.decimals);
      Currency.cache.set(upper, c);
    }
    return ok(c);
  }

  /** Para códigos que ya fueron validados (persistencia, constantes). */
  static fromCode(code: string): Currency {
    const r = Currency.of(code);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }

  static supported(): Currency[] {
    return Object.keys(DEFINITIONS).map((c) => Currency.fromCode(c));
  }

  static get ARS() {
    return Currency.fromCode("ARS");
  }
  static get USD() {
    return Currency.fromCode("USD");
  }

  /** 10^decimals como bigint (100n para ARS). */
  get minorFactor(): bigint {
    return 10n ** BigInt(this.decimals);
  }

  equals(other: Currency): boolean {
    return this.code === other.code;
  }

  toString() {
    return this.code;
  }
}
