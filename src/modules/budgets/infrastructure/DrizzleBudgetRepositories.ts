import { and, asc, eq, lte } from "drizzle-orm";
import { Currency, Money, YearMonth } from "@/shared/domain";
import type { AppDatabase } from "@/shared/infrastructure/persistence/database";
import { toMinor, toMoney } from "@/shared/infrastructure/persistence/mappers";
import {
  budgetEnvelopes,
  categories,
  savingsGoals,
  subscriptionPayments,
  subscriptions,
} from "@/shared/infrastructure/persistence/schema";
import {
  CATEGORY_KINDS,
  Category,
  SavingsGoal,
  Subscription,
  type CategoryKind,
  type EnvelopeRecord,
  type ICategoryReader,
  type ICategoryWriter,
  type IEnvelopeReader,
  type IEnvelopeWriter,
  type ISavingsGoalReader,
  type ISavingsGoalWriter,
  type ISubscriptionPaymentRepository,
  type ISubscriptionReader,
  type ISubscriptionWriter,
  type SubscriptionPayment,
} from "../domain";

// ─────────────── Categorías ───────────────

export class DrizzleCategoryRepository implements ICategoryReader, ICategoryWriter {
  constructor(private readonly db: AppDatabase) {}

  private toDomain(r: typeof categories.$inferSelect) {
    const kind = (CATEGORY_KINDS as readonly string[]).includes(r.kind) ? (r.kind as CategoryKind) : "variable";
    return Category.restore({ id: r.id, name: r.name, group: r.groupName, kind, archived: r.archived });
  }

  async findAll(options: { includeArchived?: boolean } = {}) {
    return this.db
      .select()
      .from(categories)
      .orderBy(asc(categories.groupName), asc(categories.name))
      .all()
      .filter((r) => options.includeArchived || !r.archived)
      .map((r) => this.toDomain(r));
  }

  async findById(id: string) {
    const r = this.db.select().from(categories).where(eq(categories.id, id)).get();
    return r ? this.toDomain(r) : null;
  }

  async save(c: Category) {
    const s = c.toSnapshot();
    const values = { id: s.id, name: s.name, groupName: s.group, kind: s.kind, archived: s.archived };
    this.db.insert(categories).values(values).onConflictDoUpdate({ target: categories.id, set: values }).run();
  }
}

// ─────────────── Sobres ───────────────

export class DrizzleEnvelopeRepository implements IEnvelopeReader, IEnvelopeWriter {
  constructor(private readonly db: AppDatabase) {}

  private toRecord(r: typeof budgetEnvelopes.$inferSelect): EnvelopeRecord {
    return {
      categoryId: r.categoryId,
      month: YearMonth.fromString(r.month),
      assigned: toMoney(r.assignedMinor, r.currency),
      activity: toMoney(r.activityMinor, r.currency),
    };
  }

  async listUntil(month: YearMonth) {
    return this.db
      .select()
      .from(budgetEnvelopes)
      .where(lte(budgetEnvelopes.month, month.toString()))
      .all()
      .map((r) => this.toRecord(r));
  }

  async find(categoryId: string, month: YearMonth) {
    const r = this.db
      .select()
      .from(budgetEnvelopes)
      .where(and(eq(budgetEnvelopes.categoryId, categoryId), eq(budgetEnvelopes.month, month.toString())))
      .get();
    return r ? this.toRecord(r) : null;
  }

  async save(record: EnvelopeRecord) {
    const values = {
      categoryId: record.categoryId,
      month: record.month.toString(),
      assignedMinor: toMinor(record.assigned),
      activityMinor: toMinor(record.activity),
      currency: record.assigned.currency.code,
    };
    this.db
      .insert(budgetEnvelopes)
      .values(values)
      .onConflictDoUpdate({ target: [budgetEnvelopes.categoryId, budgetEnvelopes.month], set: values })
      .run();
  }
}

// ─────────────── Suscripciones ───────────────

export class DrizzleSubscriptionRepository implements ISubscriptionReader, ISubscriptionWriter {
  constructor(private readonly db: AppDatabase) {}

  private toDomain(r: typeof subscriptions.$inferSelect) {
    return Subscription.restore({
      id: r.id,
      name: r.name,
      amount: toMoney(r.amountMinor, r.currency),
      accountId: r.accountId,
      categoryId: r.categoryId,
      billingDay: r.billingDay,
      startMonth: YearMonth.fromString(r.startMonth),
      active: r.active,
    });
  }

  async findAll() {
    return this.db
      .select()
      .from(subscriptions)
      .orderBy(asc(subscriptions.billingDay))
      .all()
      .map((r) => this.toDomain(r));
  }

  async findById(id: string) {
    const r = this.db.select().from(subscriptions).where(eq(subscriptions.id, id)).get();
    return r ? this.toDomain(r) : null;
  }

  async save(s: Subscription) {
    const p = s.toSnapshot();
    const values = {
      id: p.id,
      name: p.name,
      amountMinor: toMinor(p.amount),
      currency: p.amount.currency.code,
      accountId: p.accountId,
      categoryId: p.categoryId,
      billingDay: p.billingDay,
      startMonth: p.startMonth.toString(),
      active: p.active,
    };
    this.db.insert(subscriptions).values(values).onConflictDoUpdate({ target: subscriptions.id, set: values }).run();
  }
}

export class DrizzleSubscriptionPaymentRepository implements ISubscriptionPaymentRepository {
  constructor(private readonly db: AppDatabase) {}

  async listForMonth(month: YearMonth): Promise<SubscriptionPayment[]> {
    return this.db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.month, month.toString()))
      .all()
      .map((r) => ({ subscriptionId: r.subscriptionId, month, transactionId: r.transactionId, paidOn: r.paidOn }));
  }

  async save(p: SubscriptionPayment) {
    this.db
      .insert(subscriptionPayments)
      .values({ subscriptionId: p.subscriptionId, month: p.month.toString(), transactionId: p.transactionId, paidOn: p.paidOn })
      .run();
  }

  async deleteByTransaction(transactionId: string) {
    this.db.delete(subscriptionPayments).where(eq(subscriptionPayments.transactionId, transactionId)).run();
  }
}

// ─────────────── Metas de ahorro ───────────────

export class DrizzleSavingsGoalRepository implements ISavingsGoalReader, ISavingsGoalWriter {
  constructor(private readonly db: AppDatabase) {}

  private toDomain(r: typeof savingsGoals.$inferSelect) {
    const currency = Currency.fromCode(r.currency);
    return SavingsGoal.restore({
      id: r.id,
      name: r.name,
      target: Money.fromMinor(r.targetMinor, currency),
      saved: Money.fromMinor(r.savedMinor, currency),
      monthlyContribution: Money.fromMinor(r.monthlyContributionMinor, currency),
      targetMonth: r.targetMonth ? YearMonth.fromString(r.targetMonth) : null,
    });
  }

  async findAll() {
    return this.db.select().from(savingsGoals).orderBy(asc(savingsGoals.name)).all().map((r) => this.toDomain(r));
  }

  async findById(id: string) {
    const r = this.db.select().from(savingsGoals).where(eq(savingsGoals.id, id)).get();
    return r ? this.toDomain(r) : null;
  }

  async save(g: SavingsGoal) {
    const s = g.toSnapshot();
    const values = {
      id: s.id,
      name: s.name,
      currency: s.target.currency.code,
      targetMinor: toMinor(s.target),
      savedMinor: toMinor(s.saved),
      monthlyContributionMinor: toMinor(s.monthlyContribution),
      targetMonth: s.targetMonth?.toString() ?? null,
    };
    this.db.insert(savingsGoals).values(values).onConflictDoUpdate({ target: savingsGoals.id, set: values }).run();
  }
}
