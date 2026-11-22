import { describe, expect, it } from "vitest";
import { InvariantViolation } from "../DomainError";
import { Results } from "../Result";
import { LocalDate } from "../time/LocalDate";
import { Currency } from "./Currency";
import { CurrencyConverter } from "./CurrencyConverter";
import { ExchangeRate } from "./ExchangeRate";
import { Money } from "./Money";
import { divideRounded } from "./rounding";

const ARS = Currency.ARS;
const USD = Currency.USD;
const ars = (v: string | number) => Results.unwrap(Money.fromDecimal(v, ARS));

describe("Money (Value Object)", () => {
  it("evita el error clásico de IEEE 754: 0.1 + 0.2 === 0.3", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // el problema que resolvemos
    const sum = ars("0.1").add(ars("0.2"));
    expect(sum.equals(ars("0.3"))).toBe(true);
    expect(sum.minor).toBe(30n);
  });

  it("opera en unidades menores enteras (bigint)", () => {
    const m = ars("1234.56");
    expect(m.minor).toBe(123456n);
    expect(m.toDecimalString()).toBe("1234.56");
  });

  it("redondea con HALF_EVEN cuando hay más decimales que la moneda", () => {
    expect(ars("0.125").minor).toBe(12n); // 12.5 → par más cercano 12
    expect(ars("0.135").minor).toBe(14n); // 13.5 → 14
    expect(Results.unwrap(Money.fromDecimal("0.125", ARS, "HALF_UP")).minor).toBe(13n);
  });

  it("respeta monedas sin decimales (CLP)", () => {
    const clp = Results.unwrap(Money.fromDecimal("1500", Currency.fromCode("CLP")));
    expect(clp.minor).toBe(1500n);
    expect(clp.toDecimalString()).toBe("1500");
  });

  it("rechaza entradas inválidas devolviendo Err (sin lanzar)", () => {
    const r = Money.fromDecimal("12,50abc", ARS);
    expect(r.ok).toBe(false);
  });

  it("es inmutable", () => {
    const m = ars(100);
    expect(Object.isFrozen(m)).toBe(true);
    m.add(ars(1));
    expect(m.minor).toBe(10000n);
  });

  it("lanza InvariantViolation al operar monedas distintas", () => {
    const usd = Results.unwrap(Money.fromDecimal("10", USD));
    expect(() => ars(10).add(usd)).toThrow(InvariantViolation);
  });

  it("allocate reparte sin perder centavos", () => {
    const parts = ars("100").allocate(3);
    expect(parts.map((p) => p.toDecimalString())).toEqual(["33.34", "33.33", "33.33"]);
    expect(Money.sum(parts, ARS).equals(ars("100"))).toBe(true);
  });

  it("allocate funciona con montos negativos", () => {
    const parts = ars("-10").allocate(3);
    expect(parts.map((p) => p.minor)).toEqual([-334n, -333n, -333n]);
  });

  it("allocateByRatios respeta proporciones", () => {
    const [a, b] = ars("1000").allocateByRatios([70, 30]);
    expect(a.toDecimalString()).toBe("700.00");
    expect(b.toDecimalString()).toBe("300.00");
  });

  it("percentage usa puntos básicos", () => {
    expect(ars("1000").percentage(2100).toDecimalString()).toBe("210.00"); // 21% IVA
  });

  it("ratioInBasisPoints devuelve cocientes sin floats", () => {
    expect(ars("250").ratioInBasisPoints(ars("1000"))).toBe(2500);
    expect(ars("1").ratioInBasisPoints(ars("0"))).toBeNull();
  });

  it("formatea al estilo es-AR", () => {
    expect(ars("1234567.8").format()).toBe("$ 1.234.567,80");
    expect(ars("-50").format()).toBe("-$ 50,00");
  });

  it("serializa a DTO con string y se reconstruye sin pérdida", () => {
    const big = Money.fromMinor(9_007_199_254_740_993n, ARS); // > Number.MAX_SAFE_INTEGER
    const back = Money.fromDTO(JSON.parse(JSON.stringify(big)));
    expect(back.equals(big)).toBe(true);
  });
});

describe("divideRounded", () => {
  it("redondea negativos simétricamente", () => {
    expect(divideRounded(-5n, 2n, "HALF_UP")).toBe(-3n);
    expect(divideRounded(-5n, 2n, "HALF_EVEN")).toBe(-2n);
    expect(divideRounded(7n, 2n, "DOWN")).toBe(3n);
  });
});

describe("ExchangeRate y CurrencyConverter", () => {
  const today = LocalDate.fromISO("2026-11-11");
  const usdArs = Results.unwrap(ExchangeRate.create(USD, ARS, "1050.25", today));

  it("convierte USD→ARS con precisión exacta", () => {
    const usd = Results.unwrap(Money.fromDecimal("20", USD));
    expect(usdArs.convert(usd).toDecimalString()).toBe("21005.00");
  });

  it("rechaza tipos de cambio inválidos", () => {
    expect(ExchangeRate.create(USD, ARS, "0", today).ok).toBe(false);
    expect(ExchangeRate.create(USD, USD, "1", today).ok).toBe(false);
    expect(ExchangeRate.create(USD, ARS, "abc", today).ok).toBe(false);
  });

  it("convierte vía moneda base como pivote (EUR→USD pasando por ARS)", () => {
    const eurArs = Results.unwrap(ExchangeRate.create(Currency.fromCode("EUR"), ARS, "1200", today));
    const converter = new CurrencyConverter(ARS, [usdArs, eurArs]);
    const eur = Results.unwrap(Money.fromDecimal("100", Currency.fromCode("EUR")));
    const result = Results.unwrap(converter.convert(eur, USD));
    expect(result.currency.code).toBe("USD");
    expect(result.toDecimalString()).toBe("114.26"); // 120000 / 1050.25
  });

  it("usa el tipo de cambio más reciente", () => {
    const older = Results.unwrap(ExchangeRate.create(USD, ARS, "900", LocalDate.fromISO("2026-01-01")));
    const converter = new CurrencyConverter(ARS, [usdArs, older]);
    const usd = Results.unwrap(Money.fromDecimal("1", USD));
    expect(Results.unwrap(converter.toBaseCurrency(usd)).toDecimalString()).toBe("1050.25");
  });

  it("devuelve Err si falta el tipo de cambio", () => {
    const converter = new CurrencyConverter(ARS, []);
    const usd = Results.unwrap(Money.fromDecimal("1", USD));
    const r = converter.toBaseCurrency(usd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("CURRENCY_MISMATCH");
  });
});
