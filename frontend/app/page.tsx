"use client";

import { DashboardView } from "@frontend/modules/analytics/DashboardView";
import { unwrapQuery } from "@frontend/shared/data";
import { PageSuspense, Query } from "@frontend/shared/components/Query";
import { useMonth } from "@frontend/shared/month";

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
