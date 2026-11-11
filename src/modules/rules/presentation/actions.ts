"use server";

import { z } from "zod";
import { CONDITION_FIELDS, CONDITION_OPERATORS } from "../domain/RuleSpecifications";
import { Currency, Money } from "@/shared/domain";
import { parseLocalizedAmount } from "@/modules/transactions/domain/LocalizedAmount";
import { getContainer } from "@/shared/infrastructure/di/container";
import { runAction, zId } from "@/shared/presentation/action";

const conditionSchema = z.object({
  field: z.enum(CONDITION_FIELDS),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.string().trim().min(1, "Completá el valor de la condición").max(200),
});

export async function createRuleAction(input: unknown) {
  const schema = z.object({
    name: z.string().trim().min(2).max(60),
    matchMode: z.enum(["all", "any"]),
    conditions: z.array(conditionSchema).min(1).max(5),
    categoryId: zId,
    renameTo: z.string().trim().max(100).optional().nullable(),
    priority: z.coerce.number().int().min(0).max(10_000).optional(),
  });
  return runAction(schema, input, (dto) =>
    getContainer().rules.createRule.execute({
      ...dto,
      // Las condiciones de monto se normalizan a decimal canónico ("5.000" → "5000").
      conditions: dto.conditions.map((c) =>
        c.field === "amount" ? { ...c, value: parseLocalizedAmount(c.value)?.replace("-", "") ?? c.value } : c,
      ),
    }),
  );
}

export async function toggleRuleAction(input: unknown) {
  return runAction(z.object({ id: zId, active: z.boolean() }), input, (dto) => getContainer().rules.toggleRule.execute(dto));
}

export async function deleteRuleAction(input: unknown) {
  return runAction(z.object({ id: zId }), input, (dto) => getContainer().rules.deleteRule.execute(dto));
}

export async function testRulesAction(input: unknown) {
  const schema = z.object({ description: z.string().trim().min(1).max(200), amount: z.string().trim().default("1000") });
  return runAction(
    schema,
    input,
    async ({ description, amount }) => {
      const parsed = Money.fromDecimal(parseLocalizedAmount(amount) ?? "0", Currency.ARS);
      const minor = parsed.ok ? parsed.value.abs().minor : 0n;
      return getContainer().rules.testRules.execute({ description, amountMinor: minor });
    },
    { revalidate: false },
  );
}
