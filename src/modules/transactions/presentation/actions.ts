import { z } from "zod";
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
  return runAction(movementSchema, input, (dto, c) => c.transactions.recordExpense.execute(dto));
}

export async function recordIncomeAction(input: unknown) {
  return runAction(movementSchema, input, (dto, c) => c.transactions.recordIncome.execute(dto));
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
  return runAction(transferSchema, input, (dto, c) => c.transactions.transfer.execute(dto));
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
  return runAction(installmentSchema, input, (dto, c) => c.transactions.createInstallmentPurchase.execute(dto));
}

export async function deleteTransactionAction(input: unknown) {
  return runAction(z.object({ transactionId: zId }), input, (dto, c) => c.transactions.deleteTransaction.execute(dto));
}

export async function recategorizeAction(input: unknown) {
  return runAction(z.object({ transactionId: zId, categoryId: zOptionalId }), input, (dto, c) =>
    c.transactions.recategorize.execute(dto),
  );
}

// ─────────────── Carga rápida (Ctrl+K) ───────────────

const quickSchema = z.object({ text: z.string().trim().min(1).max(200), defaultAccountId: zOptionalId });

export async function previewQuickEntryAction(input: unknown) {
  return runAction(quickSchema, input, (dto, c) => c.transactions.previewQuickEntry.execute(dto), { revalidate: false });
}

export async function quickEntryAction(input: unknown) {
  return runAction(quickSchema, input, (dto, c) => c.transactions.quickEntry.execute(dto));
}

// ─────────────── Importación CSV ───────────────

const statementSchema = z.object({
  accountId: zId,
  adapterId: zId,
  content: z.string().min(1, "El archivo está vacío").max(5_000_000, "Archivo demasiado grande (máx. 5 MB)"),
});

export async function previewStatementAction(input: unknown) {
  return runAction(statementSchema, input, (dto, c) => c.transactions.previewStatement.execute(dto), { revalidate: false });
}

export async function importStatementAction(input: unknown) {
  const schema = statementSchema.extend({
    categoryOverrides: z.record(z.string(), z.string().nullable()).optional(),
    excluded: z.array(z.number().int().nonnegative()).optional(),
  });
  return runAction(schema, input, ({ categoryOverrides, ...dto }, c) =>
    c.transactions.importStatement.execute({
      ...dto,
      categoryOverrides: categoryOverrides
        ? Object.fromEntries(Object.entries(categoryOverrides).map(([k, v]) => [Number(k), v]))
        : undefined,
    }),
  );
}
