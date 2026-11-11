import {
  Currency,
  DomainError,
  Money,
  YearMonth,
  err,
  ok,
  type BudgetMethodology,
  type IClock,
  type IIdGenerator,
  type ISettingsReader,
  type ISettingsWriter,
  type IUnitOfWork,
  type Result,
} from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import { bpsToPercent, toMoneyView, type MoneyView } from "@/shared/application/views";
import type { IAccountReader } from "@/modules/accounts/domain";
import type { ITransactionDeletedHandler } from "@/modules/transactions/application/ports";
import { parseLocalizedAmount } from "@/modules/transactions/domain";
import {
  BudgetEnvelope,
  Category,
  SavingsGoal,
  Subscription,
  type CategoryKind,
  type ICategoryReader,
  type ICategoryWriter,
  type IEnvelopeReader,
  type IEnvelopeWriter,
  type ISavingsGoalReader,
  type ISavingsGoalWriter,
  type ISubscriptionPaymentRepository,
  type ISubscriptionReader,
  type ISubscriptionWriter,
  type SubscriptionStatus,
} from "../domain";
import type { IExpenseRecorder } from "./ports";

function parseMoney(raw: string, currency: Currency, allowZero = false): Result<Money, DomainError> {
  const canonical = parseLocalizedAmount(raw || "0");
  if (canonical === null) return err(DomainError.validation(`Monto inválido: "${raw}"`));
  const m = Money.fromDecimal(canonical, currency);
  if (!m.ok) return m;
  if (m.value.isNegative() || (!allowZero && m.value.isZero())) {
    return err(DomainError.validation("El monto debe ser mayor a cero"));
  }
  return m;
}

// ─────────────── Categorías ───────────────

export interface CategoryView {
  id: string;
  name: string;
  group: string;
  kind: CategoryKind;
}

export class CreateCategoryUseCase implements UseCase<{ name: string; group: string; kind: CategoryKind }, { id: string }> {
  constructor(
    private readonly categories: ICategoryReader & ICategoryWriter,
    private readonly ids: IIdGenerator,
  ) {}

  async execute(input: { name: string; group: string; kind: CategoryKind }): Promise<Result<{ id: string }, DomainError>> {
    const existing = await this.categories.findAll({ includeArchived: true });
    if (existing.some((c) => c.name.toLowerCase() === input.name.trim().toLowerCase())) {
      return err(DomainError.conflict(`Ya existe la categoría "${input.name.trim()}"`));
    }
    const category = Category.create({ id: this.ids.next(), ...input });
    if (!category.ok) return category;
    await this.categories.save(category.value);
    return ok({ id: category.value.id });
  }
}

export class ListCategoriesUseCase implements UseCase<void, CategoryView[]> {
  constructor(private readonly categories: ICategoryReader) {}
  async execute() {
    return ok((await this.categories.findAll()).map((c) => ({ id: c.id, name: c.name, group: c.group, kind: c.kind })));
  }
}

// ─────────────── Sobres ───────────────

export class AssignToEnvelopeUseCase implements UseCase<{ categoryId: string; month: string; amount: string }, void> {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly categories: ICategoryReader,
    private readonly envelopes: IEnvelopeReader & IEnvelopeWriter,
    private readonly settings: ISettingsReader,
  ) {}

  execute(input: { categoryId: string; month: string; amount: string }): Promise<Result<void, DomainError>> {
    return this.uow.transaction(async () => {
      const month = YearMonth.parse(input.month);
      if (!month.ok) return month;
      const category = await this.categories.findById(input.categoryId);
      if (!category) return err(DomainError.notFound("Categoría", input.categoryId));
      if (!category.hasEnvelope) return err(DomainError.validation("Las categorías de ingreso no tienen sobre"));

      const { baseCurrency } = await this.settings.get();
      const amount = parseMoney(input.amount, baseCurrency, true);
      if (!amount.ok) return amount;

      const record = await this.envelopes.find(category.id, month.value);
      const envelope = BudgetEnvelope.projectFromHistory(category.id, record ? [record] : [], month.value, baseCurrency);
      const assigned = envelope.assign(amount.value);
      if (!assigned.ok) return assigned;
      await this.envelopes.save(envelope.toRecord());
      return ok(undefined);
    });
  }
}

export class SetBudgetMethodologyUseCase implements UseCase<{ methodology: BudgetMethodology }, void> {
  constructor(private readonly settings: ISettingsWriter) {}
  async execute({ methodology }: { methodology: BudgetMethodology }): Promise<Result<void, DomainError>> {
    await this.settings.update({ budgetMethodology: methodology });
    return ok(undefined);
  }
}

// ─────────────── Suscripciones ───────────────

export interface CreateSubscriptionInput {
  name: string;
  amount: string;
  accountId: string;
  categoryId?: string | null;
  billingDay: number;
  startMonth?: string | null;
}

export class CreateSubscriptionUseCase implements UseCase<CreateSubscriptionInput, { id: string }> {
  constructor(
    private readonly subscriptions: ISubscriptionWriter,
    private readonly accounts: IAccountReader,
    private readonly ids: IIdGenerator,
    private readonly clock: IClock,
  ) {}

  async execute(input: CreateSubscriptionInput): Promise<Result<{ id: string }, DomainError>> {
    const account = await this.accounts.findById(input.accountId);
    if (!account) return err(DomainError.notFound("Cuenta", input.accountId));
    const amount = parseMoney(input.amount, account.currency);
    if (!amount.ok) return amount;
    const start = input.startMonth ? YearMonth.parse(input.startMonth) : ok(this.clock.today().yearMonth);
    if (!start.ok) return start;
    const sub = Subscription.create({
      id: this.ids.next(),
      name: input.name,
      amount: amount.value,
      accountId: account.id,
      categoryId: input.categoryId || null,
      billingDay: input.billingDay,
      startMonth: start.value,
    });
    if (!sub.ok) return sub;
    await this.subscriptions.save(sub.value);
    return ok({ id: sub.value.id });
  }
}

export interface SubscriptionCalendarItem {
  subscriptionId: string;
  name: string;
  amount: MoneyView;
  accountName: string;
  dueDate: string;
  day: number;
  status: Exclude<SubscriptionStatus, "not_due">;
}

export interface SubscriptionCalendar {
  month: string;
  monthLabel: string;
  items: SubscriptionCalendarItem[];
  totals: { paid: number; pending: number; overdue: number };
}

export class GetSubscriptionCalendarUseCase implements UseCase<{ month: string }, SubscriptionCalendar> {
  constructor(
    private readonly subscriptions: ISubscriptionReader,
    private readonly payments: ISubscriptionPaymentRepository,
    private readonly accounts: IAccountReader,
    private readonly clock: IClock,
  ) {}

  async execute({ month: raw }: { month: string }): Promise<Result<SubscriptionCalendar, DomainError>> {
    const month = YearMonth.parse(raw);
    if (!month.ok) return month;
    const [subs, payments, accounts] = await Promise.all([
      this.subscriptions.findAll(),
      this.payments.listForMonth(month.value),
      this.accounts.findAll({ includeArchived: true }),
    ]);
    const paid = new Set(payments.map((p) => p.subscriptionId));
    const names = new Map(accounts.map((a) => [a.id, a.name]));
    const today = this.clock.today();

    const items = subs
      .filter((s) => s.isDueIn(month.value))
      .map((s) => {
        const due = s.dueDateIn(month.value);
        return {
          subscriptionId: s.id,
          name: s.name,
          amount: toMoneyView(s.amount),
          accountName: names.get(s.accountId) ?? "—",
          dueDate: due.toISO(),
          day: due.day,
          status: s.statusFor(month.value, paid.has(s.id), today) as SubscriptionCalendarItem["status"],
        };
      })
      .sort((a, b) => a.day - b.day);

    return ok({
      month: month.value.toString(),
      monthLabel: month.value.label,
      items,
      totals: {
        paid: items.filter((i) => i.status === "paid").length,
        pending: items.filter((i) => i.status === "pending").length,
        overdue: items.filter((i) => i.status === "overdue").length,
      },
    });
  }
}

/** Registra el pago: crea el gasto (vía puerto) y marca el mes como pagado, atómicamente. */
export class PaySubscriptionUseCase implements UseCase<{ subscriptionId: string; month: string }, { transactionId: string }> {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly subscriptions: ISubscriptionReader,
    private readonly payments: ISubscriptionPaymentRepository,
    private readonly expenses: IExpenseRecorder,
    private readonly clock: IClock,
  ) {}

  execute(input: { subscriptionId: string; month: string }): Promise<Result<{ transactionId: string }, DomainError>> {
    return this.uow.transaction(async () => {
      const month = YearMonth.parse(input.month);
      if (!month.ok) return month;
      const sub = await this.subscriptions.findById(input.subscriptionId);
      if (!sub) return err(DomainError.notFound("Suscripción", input.subscriptionId));
      if (!sub.isDueIn(month.value)) return err(DomainError.validation("La suscripción no vence en ese mes"));
      const already = await this.payments.listForMonth(month.value);
      if (already.some((p) => p.subscriptionId === sub.id)) return err(DomainError.conflict(`${sub.name} ya está pagada`));

      const today = this.clock.today();
      const due = sub.dueDateIn(month.value);
      const date = due.isAfter(today) ? today : due;
      const recorded = await this.expenses.recordExpense({
        accountId: sub.accountId,
        amount: sub.amount.toDecimalString(),
        date: date.toISO(),
        description: sub.name,
        categoryId: sub.categoryId,
        subscriptionId: sub.id,
      });
      if (!recorded.ok) return recorded;
      await this.payments.save({
        subscriptionId: sub.id,
        month: month.value,
        transactionId: recorded.value.transactionId,
        paidOn: date.toISO(),
      });
      return ok({ transactionId: recorded.value.transactionId });
    });
  }
}

/** Observador: si se borra el gasto de una suscripción, el mes vuelve a "pendiente". */
export class SubscriptionPaymentCleanup implements ITransactionDeletedHandler {
  constructor(private readonly payments: ISubscriptionPaymentRepository) {}
  async onTransactionDeleted(transactionId: string) {
    await this.payments.deleteByTransaction(transactionId);
  }
}

// ─────────────── Metas de ahorro ───────────────

export interface SavingsGoalView {
  id: string;
  name: string;
  target: MoneyView;
  saved: MoneyView;
  remaining: MoneyView;
  monthlyContribution: MoneyView;
  progressPercent: number;
  monthsToComplete: number | null;
  targetMonth: string | null;
  requiredMonthly: MoneyView | null;
}

export class CreateSavingsGoalUseCase
  implements UseCase<{ name: string; target: string; saved?: string; monthlyContribution: string; targetMonth?: string | null }, { id: string }>
{
  constructor(
    private readonly goals: ISavingsGoalWriter,
    private readonly settings: ISettingsReader,
    private readonly ids: IIdGenerator,
  ) {}

  async execute(input: { name: string; target: string; saved?: string; monthlyContribution: string; targetMonth?: string | null }) {
    const { baseCurrency } = await this.settings.get();
    const target = parseMoney(input.target, baseCurrency);
    if (!target.ok) return target;
    const saved = parseMoney(input.saved ?? "0", baseCurrency, true);
    if (!saved.ok) return saved;
    const monthly = parseMoney(input.monthlyContribution, baseCurrency, true);
    if (!monthly.ok) return monthly;
    const targetMonth = input.targetMonth ? YearMonth.parse(input.targetMonth) : ok(null);
    if (!targetMonth.ok) return targetMonth;
    const goal = SavingsGoal.create({
      id: this.ids.next(),
      name: input.name,
      target: target.value,
      saved: saved.value,
      monthlyContribution: monthly.value,
      targetMonth: targetMonth.value,
    });
    if (!goal.ok) return goal;
    await this.goals.save(goal.value);
    return ok({ id: goal.value.id });
  }
}

export class ContributeToGoalUseCase implements UseCase<{ goalId: string; amount: string }, void> {
  constructor(
    private readonly goals: ISavingsGoalReader & ISavingsGoalWriter,
    private readonly settings: ISettingsReader,
  ) {}

  async execute(input: { goalId: string; amount: string }): Promise<Result<void, DomainError>> {
    const goal = await this.goals.findById(input.goalId);
    if (!goal) return err(DomainError.notFound("Meta", input.goalId));
    const { baseCurrency } = await this.settings.get();
    const amount = parseMoney(input.amount, baseCurrency);
    if (!amount.ok) return amount;
    const r = goal.contribute(amount.value);
    if (!r.ok) return r;
    await this.goals.save(goal);
    return ok(undefined);
  }
}

export class ListSavingsGoalsUseCase implements UseCase<void, SavingsGoalView[]> {
  constructor(
    private readonly goals: ISavingsGoalReader,
    private readonly clock: IClock,
  ) {}

  async execute() {
    const month = this.clock.today().yearMonth;
    return ok(
      (await this.goals.findAll()).map((g) => {
        const required = g.requiredMonthlyContribution(month);
        return {
          id: g.id,
          name: g.name,
          target: toMoneyView(g.target),
          saved: toMoneyView(g.saved),
          remaining: toMoneyView(g.remaining()),
          monthlyContribution: toMoneyView(g.monthlyContribution),
          progressPercent: bpsToPercent(g.progressBasisPoints()) ?? 0,
          monthsToComplete: g.monthsToComplete(),
          targetMonth: g.targetMonth?.toString() ?? null,
          requiredMonthly: required ? toMoneyView(required) : null,
        };
      }),
    );
  }
}
