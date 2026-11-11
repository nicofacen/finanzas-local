"use client";

import { DashboardView } from "@/modules/analytics/presentation/DashboardView";
import { unwrapQuery } from "@/shared/presentation/data";
import { PageSuspense, Query } from "@/shared/presentation/components/Query";
import { useMonth } from "@/shared/presentation/month";

function Dashboard() {
  const month = useMonth().toString();
  return (
    <Query
      deps={[month]}
      load={async (c) => ({
        data: unwrapQuery(await c.analytics.getDashboard.execute({ month })),
        empty: unwrapQuery(await c.accounts.listAccounts.execute()).length === 0,
      })}
    >
      {({ data, empty }) => <DashboardView data={data} empty={empty} />}
    </Query>
  );
}

export default function DashboardPage() {
  return (
    <PageSuspense>
      <Dashboard />
    </PageSuspense>
  );
}
