import { LocalDate, Money, YearMonth, ok, type DomainError, type IClock, type ISettingsReader, type Result } from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import { bpsToPercent, toMoneyView, type MoneyView } from "@/shared/application/views";
import type { CurrencyConversionService } from "@/modules/accounts/application/CurrencyConversionService";
import { ACCOUNT_TYPE_POLICIES, type IAccountReader } from "@/modules/accounts/domain";
import type { ICategoryReader, IEnvelopeReader } from "@/modules/budgets/domain";
import {
  SpendingPace,
  netWorth,
  savingsRate,
  type IAnalyticsReadModel,
  type ISpendingInsightDetector,
  type PaceStatus,
  type SpendingRecord,
} from "../domain";

export interface DashboardView {
  month: string;
  monthLabel: string;
  isCurrentMonth: boolean;
  netWorth: { assets: MoneyView; liabilities: MoneyView; net: MoneyView; byGroup: { group: string; amount: MoneyView }[] };
  missingRates: string[];
  savings: { income: MoneyView; expenses: MoneyView; saved: MoneyView; ratePercent: number | null };
  flows: { month: string; label: string; income: number; expenses: number; ratePercent: number | null }[];
  pace: {
    status: PaceStatus;
    pacePercent: number | null;
    spent: MoneyView;
    budget: MoneyView;
    budgetSource: "envelopes" | "average" | "none";
    idealToDate: MoneyView;
    projected: MoneyView;
    daysElapsed: number;
    daysRemaining: number;
    dailyAverage: MoneyView;
    series: { day: number; actual: number | null; ideal: number }[];
  };
  categories: { categoryId: string | null; name: string; amount: MoneyView; value: number }[];
  insights: { kind: string; severity: string; title: string; message: string; amount: MoneyView }[];
  installmentProjection: { month: string; label: string; amount: number; formatted: string }[];
}

export class GetDashboardUseCase implements UseCase<{ month: string }, DashboardView> {
  constructor(
    private readonly readModel: IAnalyticsReadModel,
    private readonly accounts: IAccountReader,
    private readonly categories: ICategoryReader,
    private readonly envelopes: IEnvelopeReader,
    private readonly conversion: CurrencyConversionService,
    private readonly settings: ISettingsReader,
    private readonly detectors: readonly ISpendingInsightDetector[],
    private readonly clock: IClock,
  ) {}

  async execute({ month: raw }: { month: string }): Promise<Result<DashboardView, DomainError>> {
    const parsed = YearMonth.parse(raw);
    if (!parsed.ok) return parsed;
    const month = parsed.value;
    const today = this.clock.today();
    const settings = await this.settings.get();
    const currency = settings.baseCurrency;
    const zero = Money.zero(currency);
    const from3 = month.addMonths(-3);

    const [accounts, converter, categories, records, flows, records4m, projection] = await Promise.all([
      this.accounts.findAll(),
      this.conversion.converter(),
      this.categories.findAll({ includeArchived: true }),
      this.envelopes.listUntil(month),
      this.readModel.monthlyFlows(month.addMonths(-5), month),
      this.readModel.spendingRecords(LocalDate.fromISO(from3.firstDayISO()), LocalDate.fromISO(month.lastDayISO())),
      this.readModel.installmentProjection(month.next(), 6),
    ]);

    // ── Patrimonio neto ──
    const missingRates = new Set<string>();
    const entries = accounts.flatMap((a) => {
      const base = converter.toBaseCurrency(a.balance);
      if (!base.ok) {
        missingRates.add(a.currency.code);
        return [];
      }
      return [{ label: a.name, group: ACCOUNT_TYPE_POLICIES[a.type].label, baseBalance: base.value, isLiability: a.isLiability }];
    });
    const nw = netWorth(entries, currency);

    // ── Flujo y tasa de ahorro ──
    const thisFlow = flows[flows.length - 1];
    const sr = savingsRate(thisFlow.income, thisFlow.expenses);

    // ── Ritmo de gasto ──
    const monthKey = month.toString();
    const current = records4m.filter((r) => r.date.yearMonth.equals(month));
    const daily = new Map<number, Money>();
    for (const r of current) daily.set(r.date.day, (daily.get(r.date.day) ?? zero).add(r.amount));

    const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
    const assignedThisMonth = Money.sum(
      records.filter((r) => r.month.toString() === monthKey && kindOf.get(r.categoryId) !== "income").map((r) => r.assigned),
      currency,
    );
    const prevExpenses = flows.slice(-4, -1).map((f) => f.expenses).filter((e) => e.isPositive());
    const avgExpenses = prevExpenses.length ? Money.sum(prevExpenses, currency).multiplyByRatio(1n, BigInt(prevExpenses.length)) : zero;
    const [budget, budgetSource] = assignedThisMonth.isPositive()
      ? [assignedThisMonth, "envelopes" as const]
      : avgExpenses.isPositive()
        ? [avgExpenses, "average" as const]
        : [zero, "none" as const];
    const pace = SpendingPace.calculate({ month, today, budget, dailySpending: daily });

    // ── Categorías del mes ──
    const names = new Map(categories.map((c) => [c.id, c.name]));
    const byCategory = new Map<string, Money>();
    for (const r of current) {
      const key = r.categoryId ?? "__none__";
      byCategory.set(key, (byCategory.get(key) ?? zero).add(r.amount));
    }
    const categoryRows = [...byCategory.entries()]
      .sort((a, b) => b[1].compare(a[1]))
      .map(([id, amount]) => ({
        categoryId: id === "__none__" ? null : id,
        name: id === "__none__" ? "Sin categoría" : (names.get(id) ?? "—"),
        amount: toMoneyView(amount),
        value: amount.toNumberForDisplay(),
      }));

    // ── Insights (gastos hormiga + desvíos vs promedio móvil de 3 meses) ──
    const previous = new Map<string, SpendingRecord[]>();
    for (let n = 1; n <= 3; n++) {
      const m = month.addMonths(-n);
      const recs = records4m.filter((r) => r.date.yearMonth.equals(m));
      if (recs.length > 0) previous.set(m.toString(), recs);
    }
    const ctx = {
      month,
      currency,
      current,
      previous,
      categoryNames: names,
      antThreshold: Money.fromMinor(settings.antExpenseThresholdMinor, currency),
    };
    const insights = this.detectors.flatMap((d) => d.detect(ctx));

    const dailyAverage = pace.daysElapsed > 0 ? pace.spent.multiplyByRatio(1n, BigInt(pace.daysElapsed)) : zero;

    return ok({
      month: monthKey,
      monthLabel: month.label,
      isCurrentMonth: month.equals(today.yearMonth),
      netWorth: {
        assets: toMoneyView(nw.assets),
        liabilities: toMoneyView(nw.liabilities),
        net: toMoneyView(nw.netWorth),
        byGroup: nw.byGroup.map((g) => ({ group: g.group, amount: toMoneyView(g.amount) })),
      },
      missingRates: [...missingRates],
      savings: {
        income: toMoneyView(sr.income),
        expenses: toMoneyView(sr.expenses),
        saved: toMoneyView(sr.saved),
        ratePercent: bpsToPercent(sr.rateBasisPoints),
      },
      flows: flows.map((f) => {
        const r = savingsRate(f.income, f.expenses);
        return {
          month: f.month.toString(),
          label: f.month.shortLabel,
          income: f.income.toNumberForDisplay(),
          expenses: f.expenses.toNumberForDisplay(),
          ratePercent: bpsToPercent(r.rateBasisPoints),
        };
      }),
      pace: {
        status: pace.status,
        pacePercent: bpsToPercent(pace.paceBasisPoints),
        spent: toMoneyView(pace.spent),
        budget: toMoneyView(pace.budget),
        budgetSource,
        idealToDate: toMoneyView(pace.idealToDate),
        projected: toMoneyView(pace.projectedMonthEnd),
        daysElapsed: pace.daysElapsed,
        daysRemaining: pace.daysRemaining,
        dailyAverage: toMoneyView(dailyAverage),
        series: pace.series.map((p) => ({
          day: p.day,
          actual: p.actual ? p.actual.toNumberForDisplay() : null,
          ideal: p.ideal.toNumberForDisplay(),
        })),
      },
      categories: categoryRows,
      insights: insights.map((i) => ({
        kind: i.kind,
        severity: i.severity,
        title: i.title,
        message: i.message,
        amount: toMoneyView(i.amount),
      })),
      installmentProjection: projection.map((p) => ({
        month: p.month.toString(),
        label: p.month.shortLabel,
        amount: p.amount.toNumberForDisplay(),
        formatted: p.amount.format(),
      })),
    });
  }
}
