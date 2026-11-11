import { BudgetBoard } from "@/modules/budgets/presentation/BudgetBoard";
import { getContainer } from "@/shared/infrastructure/di/container";
import { unwrapQuery } from "@/shared/presentation/action";
import { MonthNav, PageHeader } from "@/shared/presentation/components/MonthNav";
import { resolveMonth } from "@/shared/presentation/month";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const month = resolveMonth((await searchParams).month);
  const c = getContainer();
  const [overview, goals] = await Promise.all([
    c.budgets.getOverview.execute({ month: month.toString() }).then(unwrapQuery),
    c.budgets.listSavingsGoals.execute().then(unwrapQuery),
  ]);
  return (
    <>
      <PageHeader title="Presupuesto" description="Base cero por sobres, Safe-to-Spend, o ambas a la vez">
        <MonthNav month={overview.month} basePath="/budget" />
      </PageHeader>
      <BudgetBoard key={overview.month} overview={overview} goals={goals} />
    </>
  );
}
