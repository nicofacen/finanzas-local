import { and, between, eq, gte, lte, sql, sum } from "drizzle-orm";
import { LocalDate, Money, YearMonth, type Currency } from "@/shared/domain";
import type { AppDatabase } from "@/shared/infrastructure/persistence/database";
import { creditCardPurchases, installments, transactions } from "@/shared/infrastructure/persistence/schema";
import type { IAnalyticsReadModel, MonthlyFlow, SpendingRecord } from "../domain";

export class SqlAnalyticsReadModel implements IAnalyticsReadModel {
  constructor(
    private readonly db: AppDatabase,
    private readonly baseCurrency: () => Promise<Currency>,
  ) {}

  async monthlyFlows(from: YearMonth, to: YearMonth): Promise<MonthlyFlow[]> {
    const currency = await this.baseCurrency();
    const monthExpr = sql<string>`substr(${transactions.date}, 1, 7)`;
    const rows = this.db
      .select({
        month: monthExpr,
        income: sql<number>`coalesce(sum(case when ${transactions.kind} = 'income' then ${transactions.baseAmountMinor} else 0 end), 0)`,
        expenses: sql<number>`coalesce(sum(case when ${transactions.kind} = 'expense' then -${transactions.baseAmountMinor} else 0 end), 0)`,
      })
      .from(transactions)
      .where(between(transactions.date, from.firstDayISO(), to.lastDayISO()))
      .groupBy(monthExpr)
      .all();
    const inst = this.db
      .select({ month: installments.dueMonth, total: sum(installments.baseAmountMinor) })
      .from(installments)
      .where(and(gte(installments.dueMonth, from.toString()), lte(installments.dueMonth, to.toString())))
      .groupBy(installments.dueMonth)
      .all();

    return YearMonth.range(from, to).map((month) => {
      const key = month.toString();
      const r = rows.find((x) => x.month === key);
      const i = inst.find((x) => x.month === key);
      return {
        month,
        income: Money.fromMinor(BigInt(r?.income ?? 0), currency),
        expenses: Money.fromMinor(BigInt(r?.expenses ?? 0) + BigInt(i?.total ?? 0), currency),
      };
    });
  }

  async spendingRecords(from: LocalDate, to: LocalDate): Promise<SpendingRecord[]> {
    const currency = await this.baseCurrency();
    const tx = this.db
      .select({
        date: transactions.date,
        description: transactions.description,
        categoryId: transactions.categoryId,
        amount: transactions.baseAmountMinor,
      })
      .from(transactions)
      .where(and(eq(transactions.kind, "expense"), between(transactions.date, from.toISO(), to.toISO())))
      .all()
      .map((r) => ({
        date: LocalDate.fromISO(r.date),
        description: r.description,
        categoryId: r.categoryId,
        amount: Money.fromMinor(-r.amount, currency),
      }));

    // Las cuotas se imputan el día 1 de su mes de vencimiento.
    const inst = this.db
      .select({
        dueMonth: installments.dueMonth,
        number: installments.number,
        count: creditCardPurchases.installmentsCount,
        description: creditCardPurchases.description,
        categoryId: creditCardPurchases.categoryId,
        amount: installments.baseAmountMinor,
      })
      .from(installments)
      .innerJoin(creditCardPurchases, eq(installments.purchaseId, creditCardPurchases.id))
      .where(and(gte(installments.dueMonth, from.yearMonth.toString()), lte(installments.dueMonth, to.yearMonth.toString())))
      .all()
      .map((r) => ({
        date: LocalDate.fromISO(`${r.dueMonth}-01`),
        description: `${r.description} (cuota ${r.number}/${r.count})`,
        categoryId: r.categoryId,
        amount: Money.fromMinor(r.amount, currency),
      }))
      .filter((r) => !r.date.isBefore(from) && !r.date.isAfter(to));

    return [...tx, ...inst];
  }

  async installmentProjection(from: YearMonth, months: number) {
    const currency = await this.baseCurrency();
    const to = from.addMonths(months - 1);
    const rows = this.db
      .select({ month: installments.dueMonth, total: sum(installments.baseAmountMinor) })
      .from(installments)
      .where(and(gte(installments.dueMonth, from.toString()), lte(installments.dueMonth, to.toString())))
      .groupBy(installments.dueMonth)
      .all();
    return YearMonth.range(from, to).map((month) => ({
      month,
      amount: Money.fromMinor(BigInt(rows.find((r) => r.month === month.toString())?.total ?? 0), currency),
    }));
  }
}
