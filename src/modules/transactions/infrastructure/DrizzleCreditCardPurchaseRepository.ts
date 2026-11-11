import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { Currency, LocalDate, YearMonth } from "@/shared/domain";
import type { AppDatabase } from "@/shared/infrastructure/persistence/database";
import { toMinor, toMoney } from "@/shared/infrastructure/persistence/mappers";
import { creditCardPurchases, installments } from "@/shared/infrastructure/persistence/schema";
import {
  CreditCardPurchase,
  Installment,
  InstallmentPlan,
  type ICreditCardPurchaseReader,
  type ICreditCardPurchaseWriter,
} from "../domain";

type PurchaseRow = typeof creditCardPurchases.$inferSelect;
type InstallmentRow = typeof installments.$inferSelect;

function toDomain(p: PurchaseRow, rows: InstallmentRow[]): CreditCardPurchase {
  const list = rows.map(
    (r) =>
      new Installment(
        r.number,
        p.installmentsCount,
        YearMonth.fromString(r.dueMonth),
        toMoney(r.amountMinor, p.currency),
        toMoney(r.baseAmountMinor, p.baseCurrency),
      ),
  );
  return CreditCardPurchase.restore({
    id: p.id,
    accountId: p.accountId,
    description: p.description,
    categoryId: p.categoryId,
    purchaseDate: LocalDate.fromISO(p.purchaseDate),
    plan: new InstallmentPlan(list, Currency.fromCode(p.currency), Currency.fromCode(p.baseCurrency)),
  });
}

export class DrizzleCreditCardPurchaseRepository implements ICreditCardPurchaseReader, ICreditCardPurchaseWriter {
  constructor(private readonly db: AppDatabase) {}

  private hydrate(purchases: PurchaseRow[]): CreditCardPurchase[] {
    if (purchases.length === 0) return [];
    const rows = this.db
      .select()
      .from(installments)
      .where(inArray(installments.purchaseId, purchases.map((p) => p.id)))
      .orderBy(asc(installments.number))
      .all();
    return purchases.map((p) => toDomain(p, rows.filter((r) => r.purchaseId === p.id)));
  }

  async findById(id: string) {
    const p = this.db.select().from(creditCardPurchases).where(eq(creditCardPurchases.id, id)).get();
    return p ? this.hydrate([p])[0] : null;
  }

  async listOverlapping(from: YearMonth, to: YearMonth) {
    const ids = this.db
      .selectDistinct({ id: installments.purchaseId })
      .from(installments)
      .where(and(gte(installments.dueMonth, from.toString()), lte(installments.dueMonth, to.toString())))
      .all()
      .map((r) => r.id);
    if (ids.length === 0) return [];
    const purchases = this.db
      .select()
      .from(creditCardPurchases)
      .where(inArray(creditCardPurchases.id, ids))
      .orderBy(asc(creditCardPurchases.purchaseDate))
      .all();
    return this.hydrate(purchases);
  }

  async save(purchase: CreditCardPurchase) {
    const first = purchase.installments[0];
    const values = {
      id: purchase.id,
      accountId: purchase.accountId,
      description: purchase.description,
      categoryId: purchase.categoryId,
      purchaseDate: purchase.purchaseDate.toISO(),
      currency: first.amount.currency.code,
      baseCurrency: first.baseAmount.currency.code,
      installmentsCount: purchase.installments.length,
    };
    this.db.insert(creditCardPurchases).values(values).onConflictDoUpdate({ target: creditCardPurchases.id, set: values }).run();
    this.db.delete(installments).where(eq(installments.purchaseId, purchase.id)).run();
    for (const i of purchase.installments) {
      this.db
        .insert(installments)
        .values({
          purchaseId: purchase.id,
          number: i.number,
          dueMonth: i.dueMonth.toString(),
          amountMinor: toMinor(i.amount),
          baseAmountMinor: toMinor(i.baseAmount),
        })
        .run();
    }
  }

  async delete(id: string) {
    this.db.delete(creditCardPurchases).where(eq(creditCardPurchases.id, id)).run();
  }
}
