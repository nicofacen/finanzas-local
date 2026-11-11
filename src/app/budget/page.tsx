"use client";

import { BudgetBoard } from "@/modules/budgets/presentation/BudgetBoard";
import { MonthNav, PageHeader } from "@/shared/presentation/components/MonthNav";
import { PageSuspense, Query } from "@/shared/presentation/components/Query";
import { unwrapQuery } from "@/shared/presentation/data";
import { useMonth } from "@/shared/presentation/month";

function Budget() {
  const month = useMonth().toString();
  return (
    <Query
      deps={[month]}
      load={async (c) => ({
        overview: unwrapQuery(await c.budgets.getOverview.execute({ month })),
        goals: unwrapQuery(await c.budgets.listSavingsGoals.execute()),
      })}
    >
      {({ overview, goals }) => (
        <>
          <PageHeader title="Presupuesto" description="Base cero por sobres, Safe-to-Spend, o ambas a la vez">
            <MonthNav month={overview.month} basePath="/budget" />
          </PageHeader>
          <BudgetBoard key={overview.month} overview={overview} goals={goals} />
        </>
      )}
    </Query>
  );
}

export default function BudgetPage() {
  return (
    <PageSuspense>
      <Budget />
    </PageSuspense>
  );
}
