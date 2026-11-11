import { and, between, eq, isNull, lte, sql, sum } from "drizzle-orm";
import { Money, type Currency, type YearMonth } from "@/shared/domain";
import type { IBudgetDataSource } from "@/modules/budgets/domain";
import type { AppDatabase } from "@/shared/infrastructure/persistence/database";
import { creditCardPurchases, installments, transactions } from "@/shared/infrastructure/persistence/schema";

/**
 * Adaptador: implementa el puerto de lectura que define budgets usando las
 * tablas de transactions. Los cálculos son SUM sobre enteros (sin floats).
 */
export class SqlBudgetDataSource implements IBudgetDataSource {
  constructor(
    private readonly db: AppDatabase,
    private readonly baseCurrency: () => Promise<Currency>,
  ) {}

  private async money(value: number | string | null): Promise<Money> {
    const currency = await this.baseCurrency();
    return Money.fromMinor(BigInt(value ?? 0), currency);
  }

  async incomeByMonth(months: readonly YearMonth[]) {
    const result = new Map<string, Money>();
    if (months.length === 0) return result;
    const sorted = [...months].sort((a, b) => a.compare(b));
    const rows = this.db
      .select({ month: sql<string>`substr(${transactions.date}, 1, 7)`, total: sum(transactions.baseAmountMinor) })
      .from(transactions)
      .where(
        and(
          eq(transactions.kind, "income"),
          between(transactions.date, sorted[0].firstDayISO(), sorted[sorted.length - 1].lastDayISO()),
        ),
      )
      .groupBy(sql`substr(${transactions.date}, 1, 7)`)
      .all();
    for (const m of months) result.set(m.toString(), await this.money(rows.find((r) => r.month === m.toString())?.total ?? 0));
    return result;
  }

  async cumulativeIncomeUntil(month: YearMonth) {
    const row = this.db
      .select({ total: sum(transactions.baseAmountMinor) })
      .from(transactions)
      .where(and(eq(transactions.kind, "income"), lte(transactions.date, month.lastDayISO())))
      .get();
    return this.money(row?.total ?? 0);
  }

  async spendingByCategory(month: YearMonth) {
    const rows = this.db
      .select({ categoryId: transactions.categoryId, total: sum(transactions.baseAmountMinor) })
      .from(transactions)
      .where(
        and(
          eq(transactions.kind, "expense"),
          isNull(transactions.subscriptionId),
          between(transactions.date, month.firstDayISO(), month.lastDayISO()),
        ),
      )
      .groupBy(transactions.categoryId)
      .all();
    return Promise.all(
      rows.map(async (r) => ({ categoryId: r.categoryId, amount: (await this.money(r.total ?? 0)).negate() })),
    );
  }

  async installmentsDue(month: YearMonth) {
    const rows = this.db
      .select({
        description: creditCardPurchases.description,
        number: installments.number,
        count: creditCardPurchases.installmentsCount,
        amount: installments.baseAmountMinor,
      })
      .from(installments)
      .innerJoin(creditCardPurchases, eq(installments.purchaseId, creditCardPurchases.id))
      .where(eq(installments.dueMonth, month.toString()))
      .all();
    return Promise.all(
      rows.map(async (r) => ({ label: `${r.description} (${r.number}/${r.count})`, amount: await this.money(r.amount) })),
    );
  }
}
