import { z } from "zod";
import { CATEGORY_KINDS } from "../domain/Category";
import { runAction, zAmount, zId, zMonth, zOptionalId } from "@/shared/presentation/action";

export async function createCategoryAction(input: unknown) {
  const schema = z.object({
    name: z.string().trim().min(2).max(50),
    group: z.string().trim().max(50).default("General"),
    kind: z.enum(CATEGORY_KINDS),
  });
  return runAction(schema, input, (dto, c) => c.budgets.createCategory.execute(dto));
}

export async function assignToEnvelopeAction(input: unknown) {
  const schema = z.object({ categoryId: zId, month: zMonth, amount: z.string().trim().max(30).default("0") });
  return runAction(schema, input, (dto, c) => c.budgets.assignToEnvelope.execute(dto));
}

export async function setMethodologyAction(input: unknown) {
  const schema = z.object({ methodology: z.enum(["zero-based", "safe-to-spend"]) });
  return runAction(schema, input, (dto, c) => c.budgets.setMethodology.execute(dto));
}

export async function createSubscriptionAction(input: unknown) {
  const schema = z.object({
    name: z.string().trim().min(2).max(60),
    amount: zAmount,
    accountId: zId,
    categoryId: zOptionalId,
    billingDay: z.coerce.number().int().min(1, "Día entre 1 y 31").max(31, "Día entre 1 y 31"),
    startMonth: zMonth.optional(),
  });
  return runAction(schema, input, (dto, c) => c.budgets.createSubscription.execute(dto));
}

export async function paySubscriptionAction(input: unknown) {
  return runAction(z.object({ subscriptionId: zId, month: zMonth }), input, (dto, c) =>
    c.budgets.paySubscription.execute(dto),
  );
}

export async function createSavingsGoalAction(input: unknown) {
  const schema = z.object({
    name: z.string().trim().min(2).max(60),
    target: zAmount,
    saved: z.string().trim().optional(),
    monthlyContribution: zAmount,
    targetMonth: zMonth.optional().nullable().or(z.literal("").transform(() => null)),
  });
  return runAction(schema, input, (dto, c) => c.budgets.createSavingsGoal.execute(dto));
}

export async function contributeToGoalAction(input: unknown) {
  return runAction(z.object({ goalId: zId, amount: zAmount }), input, (dto, c) =>
    c.budgets.contributeToGoal.execute(dto),
  );
}
