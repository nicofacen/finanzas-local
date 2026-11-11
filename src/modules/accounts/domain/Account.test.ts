import { describe, expect, it } from "vitest";
import { Currency, Money, Results } from "@/shared/domain";
import { Account } from "./Account";

const ARS = Currency.ARS;
const ars = (v: string) => Results.unwrap(Money.fromDecimal(v, ARS));

function open(type: "cash" | "checking" | "credit_card", balance = "1000", limit: string | null = null) {
  return Results.unwrap(
    Account.open({
      id: "a1",
      name: "Cuenta",
      type,
      currency: ARS,
      openingBalance: ars(balance),
      creditLimit: limit ? ars(limit) : null,
      aliases: ["débito"],
      createdAt: "2026-11-01T00:00:00Z",
    }),
  );
}

describe("Account (entidad)", () => {
  it("el efectivo no puede quedar en negativo", () => {
    const acc = open("cash", "1000");
    const r = acc.withdraw(ars("1500"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INSUFFICIENT_FUNDS");
    expect(acc.balance.equals(ars("1000"))).toBe(true); // no muta si falla
  });

  it("la cuenta bancaria admite descubierto", () => {
    const acc = open("checking", "100");
    expect(acc.withdraw(ars("300")).ok).toBe(true);
    expect(acc.balance.toDecimalString()).toBe("-200.00");
  });

  it("la tarjeta respeta su límite de crédito", () => {
    const card = open("credit_card", "0", "50000");
    expect(card.withdraw(ars("30000")).ok).toBe(true);
    expect(card.availableToSpend().toDecimalString()).toBe("20000.00");
    const r = card.withdraw(ars("25000"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("CREDIT_LIMIT_EXCEEDED");
  });

  it("rechaza montos en otra moneda", () => {
    const acc = open("cash");
    const usd = Results.unwrap(Money.fromDecimal("1", Currency.USD));
    const r = acc.deposit(usd);
    expect(r.ok).toBe(false);
  });

  it("reconoce sus alias sin importar tildes ni mayúsculas", () => {
    const acc = open("checking");
    expect(acc.matchesAlias("DEBITO")).toBe(true);
    expect(acc.matchesAlias("visa")).toBe(false);
  });
});
