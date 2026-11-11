import { DomainError, Money, ok, YearMonth, type IClock, type ISettingsReader, type Result } from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import { toMoneyView, type MoneyView } from "@/shared/application/views";
import type { IAccountReader } from "@/modules/accounts/domain";
import type { ICategoryReader } from "@/modules/budgets/domain";
import type { ICreditCardPurchaseReader, ITransactionReader, TransactionFilter, TransactionKind } from "../domain";

export interface TransactionView {
  id: string;
  date: string;
  description: string;
  amount: MoneyView;
  baseAmount: MoneyView;
  kind: TransactionKind;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  isTransfer: boolean;
  isSubscription: boolean;
  isInstallmentPurchase: boolean;
}

export class ListTransactionsUseCase
  implements UseCase<{ month: string } & TransactionFilter, { month: string; items: TransactionView[]; totals: { income: MoneyView; expenses: MoneyView } }>
{
  constructor(
    private readonly transactions: ITransactionReader,
    private readonly accounts: IAccountReader,
    private readonly categories: ICategoryReader,
    private readonly settings: ISettingsReader,
  ) {}

  async execute(input: { month: string } & TransactionFilter) {
    const month = YearMonth.parse(input.month);
    if (!month.ok) return month;
    const [txs, accounts, categories] = await Promise.all([
      this.transactions.listByMonth(month.value, input),
      this.accounts.findAll({ includeArchived: true }),
      this.categories.findAll({ includeArchived: true }),
    ]);
    const accountName = new Map(accounts.map((a) => [a.id, a.name]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));

    const items = txs.map((t) => ({
      id: t.id,
      date: t.date.toISO(),
      description: t.description,
      amount: toMoneyView(t.amount),
      baseAmount: toMoneyView(t.baseAmount),
      kind: t.kind,
      accountId: t.accountId,
      accountName: accountName.get(t.accountId) ?? "—",
      categoryId: t.categoryId,
      categoryName: t.categoryId ? (categoryName.get(t.categoryId) ?? null) : null,
      notes: t.notes,
      isTransfer: t.kind === "transfer",
      isSubscription: t.subscriptionId !== null,
      isInstallmentPurchase: t.kind === "card_purchase",
    }));

    const { baseCurrency } = await this.settings.get();
    const income = Money.sum(txs.filter((t) => t.kind === "income").map((t) => t.baseAmount), baseCurrency);
    const expenses = Money.sum(txs.filter((t) => t.kind === "expense").map((t) => t.baseAmount.abs()), baseCurrency);
    return ok({
      month: month.value.toString(),
      items,
      totals: { income: toMoneyView(income), expenses: toMoneyView(expenses) },
    });
  }
}

// ─────────────── Cuotas ───────────────

export interface InstallmentPurchaseView {
  id: string;
  description: string;
  accountName: string;
  categoryName: string | null;
  purchaseDate: string;
  total: MoneyView;
  installmentAmount: MoneyView;
  count: number;
  billed: number;
  currentLabel: string | null;
  remaining: MoneyView;
  firstMonth: string;
  lastMonth: string;
}

export interface InstallmentsOverview {
  purchases: InstallmentPurchaseView[];
  projection: { month: string; label: string; amount: MoneyView }[];
}

export class GetInstallmentsOverviewUseCase implements UseCase<{ months?: number }, InstallmentsOverview> {
  constructor(
    private readonly purchases: ICreditCardPurchaseReader,
    private readonly accounts: IAccountReader,
    private readonly categories: ICategoryReader,
    private readonly settings: ISettingsReader,
    private readonly clock: IClock,
  ) {}

  async execute({ months = 12 }: { months?: number }): Promise<Result<InstallmentsOverview, DomainError>> {
    const current = this.clock.today().yearMonth;
    const horizon = current.addMonths(months - 1);
    const [list, accounts, categories] = await Promise.all([
      this.purchases.listOverlapping(current, horizon.addMonths(120)),
      this.accounts.findAll({ includeArchived: true }),
      this.categories.findAll({ includeArchived: true }),
    ]);
    const accountName = new Map(accounts.map((a) => [a.id, a.name]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));

    const purchases = list.map((p) => {
      const inst = p.plan.installmentFor(current);
      return {
        id: p.id,
        description: p.description,
        accountName: accountName.get(p.accountId) ?? "—",
        categoryName: p.categoryId ? (categoryName.get(p.categoryId) ?? null) : null,
        purchaseDate: p.purchaseDate.toISO(),
        total: toMoneyView(p.total),
        installmentAmount: toMoneyView(p.installments[0].amount),
        count: p.plan.count,
        billed: p.plan.billedCount(current),
        currentLabel: inst?.label ?? null,
        remaining: toMoneyView(p.plan.remainingAfter(current.previous())),
        firstMonth: p.plan.firstMonth.toString(),
        lastMonth: p.plan.lastMonth.toString(),
      };
    });

    const { baseCurrency } = await this.settings.get();
    const projection = YearMonth.range(current, horizon).map((month) => ({
      month: month.toString(),
      label: month.shortLabel,
      amount: toMoneyView(Money.sum(list.map((p) => p.plan.baseAmountDueIn(month)), baseCurrency)),
    }));
    return ok({ purchases, projection });
  }
}
