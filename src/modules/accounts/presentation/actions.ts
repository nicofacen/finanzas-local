"use server";

import { z } from "zod";
import { ACCOUNT_TYPES } from "../domain/AccountType";
import { getContainer } from "@/shared/infrastructure/di/container";
import { runAction, zDate } from "@/shared/presentation/action";

const createAccountSchema = z.object({
  name: z.string().trim().min(2, "Nombre demasiado corto").max(60),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.string().length(3),
  openingBalance: z.string().trim().default("0"),
  creditLimit: z.string().trim().optional().nullable(),
  closingDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  aliases: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [])),
});

export async function createAccountAction(input: unknown) {
  return runAction(createAccountSchema, input, (dto) => getContainer().accounts.createAccount.execute(dto));
}

const rateSchema = z.object({
  currency: z.string().length(3),
  rate: z.string().trim().regex(/^\d+([.,]\d{1,8})?$/, "Tipo de cambio inválido (ej. 1450 o 1450,50)"),
  effectiveDate: zDate.optional(),
});

export async function setExchangeRateAction(input: unknown) {
  return runAction(rateSchema, input, (dto) => getContainer().accounts.setExchangeRate.execute(dto));
}
