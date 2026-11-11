import { describe, expect, it } from "vitest";
import { LocalDate, normalizeText, Results } from "@/shared/domain";
import { parseLocalizedAmount } from "./LocalizedAmount";
import { QuickEntryParser, type AccountMatcher } from "./QuickEntryParser";

const account = (id: string, name: string, aliases: string[]): AccountMatcher => ({
  id,
  name,
  matchesAlias: (t) => [name, ...aliases].some((a) => normalizeText(a) === normalizeText(t)),
});

const ctx = {
  accounts: [
    account("deb", "Banco Galicia", ["débito", "galicia"]),
    account("visa", "Visa Galicia", ["visa"]),
    account("mp", "Mercado Pago", ["mp"]),
  ],
  categories: [
    { id: "super", name: "Supermercado" },
    { id: "salario", name: "Sueldo" },
  ],
  today: LocalDate.fromISO("2026-11-11"),
};

const parser = new QuickEntryParser();
const parse = (s: string) => Results.unwrap(parser.parse(s, ctx));

describe("parseLocalizedAmount", () => {
  it.each([
    ["15000", "15000"],
    ["15.000", "15000"],
    ["15.000,50", "15000.50"],
    ["1,234.56", "1234.56"],
    ["1.234.567", "1234567"],
    ["12,5", "12.5"],
    ["$2.500", "2500"],
    ["-1.500,00", "-1500.00"],
    ["(1.234,00)", "-1234.00"],
  ])("%s → %s", (input, expected) => {
    expect(parseLocalizedAmount(input)).toBe(expected);
  });

  it("devuelve null para texto que no es monto", () => {
    expect(parseLocalizedAmount("super")).toBeNull();
    expect(parseLocalizedAmount("1.23.4")).toBeNull();
  });
});

describe("QuickEntryParser (barra Ctrl+K)", () => {
  it('interpreta "15000 Supermercado Débito"', () => {
    const r = parse("15000 Supermercado Débito");
    expect(r).toMatchObject({
      kind: "expense",
      amount: "15000",
      description: "Supermercado",
      accountId: "deb",
      categoryId: "super",
      installments: null,
    });
    expect(r.date.toISO()).toBe("2026-11-11");
  });

  it("detecta ingresos con +", () => {
    const r = parse("+850.000 Sueldo Galicia");
    expect(r.kind).toBe("income");
    expect(r.amount).toBe("850000");
    expect(r.categoryId).toBe("salario");
    expect(r.accountId).toBe("deb");
  });

  it("detecta moneda, cuotas y fecha relativa", () => {
    const r = parse("usd 120 Zapatillas Visa 6c ayer");
    expect(r.currencyCode).toBe("USD");
    expect(r.amount).toBe("120");
    expect(r.installments).toBe(6);
    expect(r.accountId).toBe("visa");
    expect(r.description).toBe("Zapatillas");
    expect(r.date.toISO()).toBe("2026-11-10");
  });

  it("acepta cuenta compuesta por dos palabras", () => {
    const r = parse("3500 Café Mercado Pago");
    expect(r.accountId).toBe("mp");
    expect(r.description).toBe("Café");
  });

  it("acepta fechas dd/mm", () => {
    expect(parse("2000 Kiosco 03/11").date.toISO()).toBe("2026-11-03");
    expect(parse("2000 Regalo 28/12").date.toISO()).toBe("2025-12-28");
  });

  it("falla con un mensaje claro si no hay monto", () => {
    const r = parser.parse("Supermercado Débito", ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PARSE_ERROR");
  });
});
