import {
  Money,
  YearMonth,
  ok,
  type BudgetMethodology,
  type DomainError,
  type IClock,
  type ISettingsReader,
  type Result,
} from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import { bpsToPercent, toMoneyView, type MoneyView } from "@/shared/application/views";
import type { CurrencyConversionService } from "@/modules/accounts/application/CurrencyConversionService";
import {
  BudgetEnvelope,
  type BudgetSnapshot,
  type BudgetSummary,
  type BudgetingStrategyRegistry,
  type CategoryKind,
  type FixedCommitment,
  type IBudgetDataSource,
  type ICategoryReader,
  type IEnvelopeReader,
  type ISavingsGoalReader,
  type ISubscriptionPaymentRepository,
  type ISubscriptionReader,
} from "../domain";

export interface EnvelopeView {
  categoryId: string;
  name: string;
  group: string;
  kind: CategoryKind;
  carryover: MoneyView;
  assigned: MoneyView;
  activity: MoneyView;
  available: MoneyView;
  usagePercent: number | null;
  overspent: boolean;
}

export interface BudgetSummaryView {
  methodology: BudgetMethodology;
  title: string;
  headline: { label: string; amount: MoneyView; tone: string; hint: string | null };
  dailyAllowance: MoneyView | null;
  daysRemaining: number;
  lines: { label: string; amount: MoneyView; tone: string }[];
  warnings: string[];
}

export interface BudgetOverview {
  month: string;
  monthLabel: string;
  preferredMethodology: BudgetMethodology;
  /** Ambas metodologías calculadas: la UI puede alternar o combinarlas. */
  summaries: Record<BudgetMethodology, BudgetSummaryView>;
  envelopes: EnvelopeView[];
  commitments: { label: string; amount: MoneyView; source: string; paid: boolean }[];
}

/**
 * Arma la foto del mes (BudgetSnapshot) a partir de varios repositorios/puertos
 * y la entrega a TODAS las estrategias registradas (polimorfismo).
 */
export class GetBudgetOverviewUseCase implements UseCase<{ month: string }, BudgetOverview> {
  constructor(
    private readonly settings: ISettingsReader,
    private readonly categories: ICategoryReader,
    private readonly envelopes: IEnvelopeReader,
    private readonly subscriptions: ISubscriptionReader,
    private readonly payments: ISubscriptionPaymentRepository,
    private readonly goals: ISavingsGoalReader,
    private readonly data: IBudgetDataSource,
    private readonly strategies: BudgetingStrategyRegistry,
    private readonly conversion: CurrencyConversionService,
    private readonly clock: IClock,
  ) {}

  async execute({ month: monthRaw }: { month: string }): Promise<Result<BudgetOverview, DomainError>> {
    const parsed = YearMonth.parse(monthRaw);
    if (!parsed.ok) return parsed;
    const month = parsed.value;
    const today = this.clock.today();
    const settings = await this.settings.get();
    const currency = settings.baseCurrency;
    const zero = Money.zero(currency);

    const prevMonths = [1, 2, 3].map((n) => month.addMonths(-n));
    const [categories, records, subscriptions, payments, goals, incomeMap, cumulativeIncome, spending, installments, converter] =
      await Promise.all([
        this.categories.findAll(),
        this.envelopes.listUntil(month),
        this.subscriptions.findAll(),
        this.payments.listForMonth(month),
        this.goals.findAll(),
        this.data.incomeByMonth([month, ...prevMonths]),
        this.data.cumulativeIncomeUntil(month),
        this.data.spendingByCategory(month),
        this.data.installmentsDue(month),
        this.conversion.converter(),
      ]);

    // ── Sobres (con rollover) ──
    const envelopeLines = categories
      .filter((c) => c.hasEnvelope)
      .map((category) => ({
        category,
        envelope: BudgetEnvelope.projectFromHistory(category.id, records, month, currency),
      }));
    const cumulativeAssigned = Money.sum(records.map((r) => r.assigned), currency);

    // ── Ingresos esperados: promedio de los meses previos con ingresos ──
    const prevIncomes = prevMonths.map((m) => incomeMap.get(m.toString()) ?? zero).filter((m) => m.isPositive());
    const expectedIncome = prevIncomes.length
      ? Money.sum(prevIncomes, currency).multiplyByRatio(1n, BigInt(prevIncomes.length))
      : zero;

    // ── Compromisos fijos: suscripciones + cuotas + categorías fijas ──
    const paidIds = new Set(payments.map((p) => p.subscriptionId));
    const commitments: FixedCommitment[] = [];
    const subsByCategory = new Map<string, Money>();
    for (const s of subscriptions.filter((s) => s.isDueIn(month))) {
      const base = converter.toBaseCurrency(s.amount);
      const amount = base.ok ? base.value : zero;
      commitments.push({ label: s.name, amount, source: "subscription", paid: paidIds.has(s.id) });
      if (s.categoryId) subsByCategory.set(s.categoryId, (subsByCategory.get(s.categoryId) ?? zero).add(amount));
    }
    for (const i of installments) commitments.push({ label: i.label, amount: i.amount, source: "installment", paid: false });

    const spentBy = new Map(spending.map((s) => [s.categoryId ?? "__none__", s.amount]));
    for (const { category, envelope } of envelopeLines.filter((l) => l.category.kind === "fixed")) {
      const spent = spentBy.get(category.id) ?? zero;
      const plannedNet = envelope.assigned.subtract(subsByCategory.get(category.id) ?? zero);
      const amount = spent.max(plannedNet).max(zero);
      if (amount.isPositive()) {
        commitments.push({ label: category.name, amount, source: "fixed_category", paid: spent.greaterThanOrEqual(amount) });
      }
    }

    // ── Gasto variable realizado (excluye fijos, ahorro, cuotas y suscripciones) ──
    const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
    const variableSpent = Money.sum(
      spending
        .filter((s) => s.categoryId === null || kindOf.get(s.categoryId) === "variable" || !kindOf.has(s.categoryId))
        .map((s) => s.amount),
      currency,
    );

    const snapshot: BudgetSnapshot = {
      month,
      today,
      currency,
      incomeThisMonth: incomeMap.get(month.toString()) ?? zero,
      expectedIncome,
      cumulativeIncome,
      cumulativeAssigned,
      envelopes: envelopeLines,
      fixedCommitments: commitments,
      savingsGoals: goals,
      variableSpent,
    };

    const summaries = Object.fromEntries(
      this.strategies.all().map((s) => [s.id, toSummaryView(s.calculate(snapshot))]),
    ) as Record<BudgetMethodology, BudgetSummaryView>;

    return ok({
      month: month.toString(),
      monthLabel: month.label,
      preferredMethodology: settings.budgetMethodology,
      summaries,
      envelopes: envelopeLines.map(({ category, envelope }) => ({
        categoryId: category.id,
        name: category.name,
        group: category.group,
        kind: category.kind,
        carryover: toMoneyView(envelope.carryover),
        assigned: toMoneyView(envelope.assigned),
        activity: toMoneyView(envelope.activity),
        available: toMoneyView(envelope.available()),
        usagePercent: bpsToPercent(envelope.usageBasisPoints()),
        overspent: envelope.isOverspent(),
      })),
      commitments: commitments.map((c) => ({ ...c, amount: toMoneyView(c.amount) })),
    });
  }
}

function toSummaryView(s: BudgetSummary): BudgetSummaryView {
  return {
    methodology: s.methodology,
    title: s.title,
    headline: { label: s.headline.label, amount: toMoneyView(s.headline.amount), tone: s.headline.tone, hint: s.headline.hint ?? null },
    dailyAllowance: s.dailyAllowance ? toMoneyView(s.dailyAllowance) : null,
    daysRemaining: s.daysRemaining,
    lines: s.lines.map((l) => ({ label: l.label, amount: toMoneyView(l.amount), tone: l.tone })),
    warnings: [...s.warnings],
  };
}
