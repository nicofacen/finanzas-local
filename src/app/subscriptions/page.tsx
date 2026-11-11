"use client";

import { SubscriptionsBoard } from "@/modules/budgets/presentation/SubscriptionsBoard";
import { MonthNav, PageHeader } from "@/shared/presentation/components/MonthNav";
import { PageSuspense, Query } from "@/shared/presentation/components/Query";
import { unwrapQuery } from "@/shared/presentation/data";
import { todayISO, useMonth } from "@/shared/presentation/month";

function Subscriptions() {
  const month = useMonth().toString();
  return (
    <Query
      deps={[month]}
      load={async (c) => ({
        calendar: unwrapQuery(await c.budgets.getSubscriptionCalendar.execute({ month })),
        accounts: unwrapQuery(await c.accounts.listAccounts.execute()),
        categories: unwrapQuery(await c.budgets.listCategories.execute()),
      })}
    >
      {({ calendar, accounts, categories }) => (
        <>
          <PageHeader title="Suscripciones y gastos fijos" description="Vencimientos del mes: pagado / pendiente / vencido">
            <MonthNav month={month} basePath="/subscriptions" />
          </PageHeader>
          <SubscriptionsBoard
            calendar={calendar}
            accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
            categories={categories.filter((x) => x.kind !== "income")}
            today={todayISO()}
          />
        </>
      )}
    </Query>
  );
}

export default function SubscriptionsPage() {
  return (
    <PageSuspense>
      <Subscriptions />
    </PageSuspense>
  );
}
