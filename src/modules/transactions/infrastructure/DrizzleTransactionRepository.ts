import { and, between, desc, eq, inArray, like, type SQL } from "drizzle-orm";
import { LocalDate, type YearMonth } from "@/shared/domain";
import type { AppDatabase } from "@/shared/infrastructure/persistence/database";
import { toMinor, toMoney } from "@/shared/infrastructure/persistence/mappers";
import { transactions } from "@/shared/infrastructure/persistence/schema";
import {
  TRANSACTION_KINDS,
  Transaction,
  type ITransactionReader,
  type ITransactionWriter,
  type TransactionFilter,
  type TransactionKind,
} from "../domain";

type Row = typeof transactions.$inferSelect;

function toDomain(r: Row): Transaction {
  if (!(TRANSACTION_KINDS as readonly string[]).includes(r.kind)) throw new Error(`Tipo de transacción desconocido: ${r.kind}`);
  return Transaction.restore({
    id: r.id,
    accountId: r.accountId,
    date: LocalDate.fromISO(r.date),
    amount: toMoney(r.amountMinor, r.currency),
    baseAmount: toMoney(r.baseAmountMinor, r.baseCurrency),
    description: r.description,
    categoryId: r.categoryId,
    kind: r.kind as TransactionKind,
    transferGroupId: r.transferGroupId,
    purchaseId: r.purchaseId,
    subscriptionId: r.subscriptionId,
    importHash: r.importHash,
    notes: r.notes,
    createdAt: r.createdAt,
  });
}

function toRow(t: Transaction): Row {
  const s = t.toSnapshot();
  return {
    id: s.id,
    accountId: s.accountId,
    date: s.date.toISO(),
    amountMinor: toMinor(s.amount),
    currency: s.amount.currency.code,
    baseAmountMinor: toMinor(s.baseAmount),
    baseCurrency: s.baseAmount.currency.code,
    description: s.description,
    categoryId: s.categoryId,
    kind: s.kind,
    transferGroupId: s.transferGroupId,
    purchaseId: s.purchaseId,
    subscriptionId: s.subscriptionId,
    importHash: s.importHash,
    notes: s.notes,
    createdAt: s.createdAt,
  };
}

export class DrizzleTransactionRepository implements ITransactionReader, ITransactionWriter {
  constructor(private readonly db: AppDatabase) {}

  async findById(id: string) {
    const row = this.db.select().from(transactions).where(eq(transactions.id, id)).get();
    return row ? toDomain(row) : null;
  }

  async findByTransferGroup(groupId: string) {
    return this.db.select().from(transactions).where(eq(transactions.transferGroupId, groupId)).all().map(toDomain);
  }

  async findByPurchase(purchaseId: string) {
    const row = this.db.select().from(transactions).where(eq(transactions.purchaseId, purchaseId)).get();
    return row ? toDomain(row) : null;
  }

  async listByMonth(month: YearMonth, filter: TransactionFilter = {}) {
    const conditions: SQL[] = [between(transactions.date, month.firstDayISO(), month.lastDayISO())];
    if (filter.accountId) conditions.push(eq(transactions.accountId, filter.accountId));
    if (filter.categoryId) conditions.push(eq(transactions.categoryId, filter.categoryId));
    if (filter.search) conditions.push(like(transactions.description, `%${filter.search}%`));
    return this.db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .all()
      .map(toDomain);
  }

  async listBetween(from: LocalDate, to: LocalDate) {
    return this.db
      .select()
      .from(transactions)
      .where(between(transactions.date, from.toISO(), to.toISO()))
      .orderBy(desc(transactions.date))
      .all()
      .map(toDomain);
  }

  async existingImportHashes(hashes: readonly string[]) {
    if (hashes.length === 0) return new Set<string>();
    const found = new Set<string>();
    // SQLite limita la cantidad de parámetros: se consulta por lotes.
    for (let i = 0; i < hashes.length; i += 500) {
      const chunk = hashes.slice(i, i + 500);
      this.db
        .select({ h: transactions.importHash })
        .from(transactions)
        .where(inArray(transactions.importHash, chunk))
        .all()
        .forEach((r) => r.h && found.add(r.h));
    }
    return found;
  }

  async save(t: Transaction) {
    const row = toRow(t);
    this.db.insert(transactions).values(row).onConflictDoUpdate({ target: transactions.id, set: row }).run();
  }

  async saveMany(list: readonly Transaction[]) {
    for (const t of list) await this.save(t);
  }

  async delete(id: string) {
    this.db.delete(transactions).where(eq(transactions.id, id)).run();
  }
}
