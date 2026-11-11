import { DashboardView } from "@/modules/analytics/presentation/DashboardView";
import { getContainer } from "@/shared/infrastructure/di/container";
import { unwrapQuery } from "@/shared/presentation/action";
import { resolveMonth } from "@/shared/presentation/month";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const month = resolveMonth((await searchParams).month);
  const c = getContainer();
  const [data, accounts] = await Promise.all([
    c.analytics.getDashboard.execute({ month: month.toString() }).then(unwrapQuery),
    c.accounts.listAccounts.execute().then(unwrapQuery),
  ]);
  return <DashboardView data={data} empty={accounts.length === 0} />;
}
