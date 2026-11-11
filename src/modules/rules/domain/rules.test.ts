import { describe, expect, it } from "vitest";
import { Results } from "@/shared/domain";
import { CategorizationEngine } from "./CategorizationEngine";
import { CategorizationRule, type CategorizationRuleProps } from "./CategorizationRule";
import { DescriptionContains, type CategorizationCandidate } from "./RuleSpecifications";

const rule = (p: Partial<CategorizationRuleProps>) =>
  Results.unwrap(
    CategorizationRule.create({
      id: p.id ?? "r",
      name: p.name ?? "Regla",
      priority: p.priority ?? 10,
      matchMode: p.matchMode ?? "all",
      conditions: p.conditions ?? [],
      categoryId: p.categoryId ?? "cat",
      renameTo: p.renameTo ?? null,
      active: p.active ?? true,
    }),
  );

const candidate = (description: string, amount = -100_000n, accountId: string | null = null): CategorizationCandidate => ({
  description,
  baseAmountMinor: amount,
  accountId,
});

describe("Specifications de categorización", () => {
  it("ignora tildes y mayúsculas", () => {
    expect(new DescriptionContains("cafe").isSatisfiedBy(candidate("CAFÉ MARTÍNEZ"))).toBe(true);
  });

  it("se componen con AND / OR / NOT", () => {
    const uber = new DescriptionContains("uber");
    const eats = new DescriptionContains("eats");
    expect(uber.and(eats.not()).isSatisfiedBy(candidate("UBER TRIP"))).toBe(true);
    expect(uber.and(eats.not()).isSatisfiedBy(candidate("UBER EATS"))).toBe(false);
  });
});

describe("CategorizationRule", () => {
  it("combina descripción y monto (modo 'all')", () => {
    const r = rule({
      conditions: [
        { field: "description", operator: "contains", value: "mercadopago" },
        { field: "amount", operator: "lte", value: "5000" },
      ],
    });
    expect(r.appliesTo(candidate("MERCADOPAGO*KIOSCO", -300_000n))).toBe(true); // $3.000
    expect(r.appliesTo(candidate("MERCADOPAGO*KIOSCO", -900_000n))).toBe(false); // $9.000
  });

  it("modo 'any' requiere sólo una condición", () => {
    const r = rule({
      matchMode: "any",
      conditions: [
        { field: "description", operator: "contains", value: "coto" },
        { field: "description", operator: "contains", value: "carrefour" },
      ],
    });
    expect(r.appliesTo(candidate("CARREFOUR EXPRESS"))).toBe(true);
  });

  it("valida regex y condiciones vacías", () => {
    const bad = CategorizationRule.create({
      id: "x", name: "Mala", priority: 1, matchMode: "all",
      conditions: [{ field: "description", operator: "regex", value: "([" }],
      categoryId: "c", renameTo: null, active: true,
    });
    expect(bad.ok).toBe(false);
    const empty = CategorizationRule.create({
      id: "x", name: "Vacía", priority: 1, matchMode: "all", conditions: [], categoryId: "c", renameTo: null, active: true,
    });
    expect(empty.ok).toBe(false);
  });
});

describe("CategorizationEngine", () => {
  const engine = new CategorizationEngine([
    rule({ id: "general", priority: 50, conditions: [{ field: "description", operator: "contains", value: "uber" }], categoryId: "transporte" }),
    rule({ id: "eats", priority: 10, conditions: [{ field: "description", operator: "contains", value: "uber eats" }], categoryId: "delivery", renameTo: "Uber Eats" }),
    rule({ id: "off", priority: 1, active: false, conditions: [{ field: "description", operator: "contains", value: "uber" }], categoryId: "nunca" }),
  ]);

  it("aplica la regla de mayor prioridad activa", () => {
    expect(engine.suggest(candidate("UBER EATS PEDIDO"))).toMatchObject({ ruleId: "eats", categoryId: "delivery", description: "Uber Eats" });
    expect(engine.suggest(candidate("UBER *TRIP"))).toMatchObject({ ruleId: "general", categoryId: "transporte" });
  });

  it("devuelve null si ninguna regla aplica", () => {
    expect(engine.suggest(candidate("FARMACIA"))).toBeNull();
  });
});
