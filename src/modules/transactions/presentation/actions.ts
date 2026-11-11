"use server";

import { z } from "zod";
import { getContainer } from "@/shared/infrastructure/di/container";
import { runAction, zAmount, zDate, zId, zOptionalId } from "@/shared/presentation/action";

const movementSchema = z.object({
  accountId: zId,
  amount: zAmount,
  date: zDate.optional(),
  description: z.string().trim().min(1, "Ingresá una descripción").max(200),
  categoryId: zOptionalId,
  notes: z.string().max(500).optional().nullable(),
});

export async function recordExpenseAction(input: unknown) {
  return runAction(movementSchema, input, (dto) => getContainer().transactions.recordExpense.execute(dto));
}

export async function recordIncomeAction(input: unknown) {
  return runAction(movementSchema, input, (dto) => getContainer().transactions.recordIncome.execute(dto));
}

const transferSchema = z
  .object({
    fromAccountId: zId,
    toAccountId: zId,
    amount: zAmount,
    receivedAmount: z.string().trim().optional().nullable(),
    date: zDate.optional(),
    description: z.string().max(200).optional().nullable(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, { message: "Elegí cuentas distintas", path: ["toAccountId"] });

export async function transferAction(input: unknown) {
  return runAction(transferSchema, input, (dto) => getContainer().transactions.transfer.execute(dto));
}

const installmentSchema = z.object({
  accountId: zId,
  total: zAmount,
  installments: z.coerce.number().int().min(1).max(72),
  description: z.string().trim().min(1, "Ingresá una descripción").max(200),
  categoryId: zOptionalId,
  purchaseDate: zDate.optional(),
});

export async function createInstallmentPurchaseAction(input: unknown) {
  return runAction(installmentSchema, input, (dto) => getContainer().transactions.createInstallmentPurchase.execute(dto));
}

export async function deleteTransactionAction(input: unknown) {
  return runAction(z.object({ transactionId: zId }), input, (dto) => getContainer().transactions.deleteTransaction.execute(dto));
}

export async function recategorizeAction(input: unknown) {
  return runAction(z.object({ transactionId: zId, categoryId: zOptionalId }), input, (dto) =>
    getContainer().transactions.recategorize.execute(dto),
  );
}

// ─────────────── Carga rápida (Ctrl+K) ───────────────

const quickSchema = z.object({ text: z.string().trim().min(1).max(200), defaultAccountId: zOptionalId });

export async function previewQuickEntryAction(input: unknown) {
  return runAction(quickSchema, input, (dto) => getContainer().transactions.previewQuickEntry.execute(dto), { revalidate: false });
}

export async function quickEntryAction(input: unknown) {
  return runAction(quickSchema, input, (dto) => getContainer().transactions.quickEntry.execute(dto));
}

// ─────────────── Importación CSV ───────────────

const statementSchema = z.object({
  accountId: zId,
  adapterId: zId,
  content: z.string().min(1, "El archivo está vacío").max(5_000_000, "Archivo demasiado grande (máx. 5 MB)"),
});

export async function previewStatementAction(input: unknown) {
  return runAction(statementSchema, input, (dto) => getContainer().transactions.previewStatement.execute(dto), { revalidate: false });
}

export async function importStatementAction(input: unknown) {
  const schema = statementSchema.extend({
    categoryOverrides: z.record(z.string(), z.string().nullable()).optional(),
    excluded: z.array(z.number().int().nonnegative()).optional(),
  });
  return runAction(schema, input, ({ categoryOverrides, ...dto }) =>
    getContainer().transactions.importStatement.execute({
      ...dto,
      categoryOverrides: categoryOverrides
        ? Object.fromEntries(Object.entries(categoryOverrides).map(([k, v]) => [Number(k), v]))
        : undefined,
    }),
  );
}
