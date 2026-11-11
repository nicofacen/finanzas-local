import { SubscriptionsBoard } from "@/modules/budgets/presentation/SubscriptionsBoard";
import { getContainer } from "@/shared/infrastructure/di/container";
import { unwrapQuery } from "@/shared/presentation/action";
import { MonthNav, PageHeader } from "@/shared/presentation/components/MonthNav";
import { resolveMonth } from "@/shared/presentation/month";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const month = resolveMonth((await searchParams).month);
  const c = getContainer();
  const [calendar, accounts, categories] = await Promise.all([
    c.budgets.getSubscriptionCalendar.execute({ month: month.toString() }).then(unwrapQuery),
    c.accounts.listAccounts.execute().then(unwrapQuery),
    c.budgets.listCategories.execute().then(unwrapQuery),
  ]);
  return (
    <>
      <PageHeader title="Suscripciones y gastos fijos" description="Vencimientos del mes: pagado / pendiente / vencido">
        <MonthNav month={month.toString()} basePath="/subscriptions" />
      </PageHeader>
      <SubscriptionsBoard
        calendar={calendar}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        categories={categories.filter((x) => x.kind !== "income")}
        today={c.kernel.clock.today().toISO()}
      />
    </>
  );
}
