import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { TransactionForm } from "@/modules/transactions/presentation/TransactionForm";
import { TransactionTable } from "@/modules/transactions/presentation/TransactionTable";
import { getContainer } from "@/shared/infrastructure/di/container";
import { unwrapQuery } from "@/shared/presentation/action";
import { MoneyText } from "@/shared/presentation/components/Money";
import { MonthNav, PageHeader } from "@/shared/presentation/components/MonthNav";
import { resolveMonth } from "@/shared/presentation/month";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const month = resolveMonth(params.month);
  const accountId = params.account || undefined;
  const c = getContainer();
  const [list, accounts, categories] = await Promise.all([
    c.transactions.listTransactions.execute({ month: month.toString(), accountId, search: params.q || undefined }).then(unwrapQuery),
    c.accounts.listAccounts.execute().then(unwrapQuery),
    c.budgets.listCategories.execute().then(unwrapQuery),
  ]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type }));
  const filterHref = (id?: string) => `/transactions?${new URLSearchParams({ month: month.toString(), ...(id ? { account: id } : {}) })}`;

  return (
    <>
      <PageHeader title="Movimientos" description="Gastos, ingresos, transferencias y compras en cuotas">
        <MonthNav month={month.toString()} basePath="/transactions" extra={accountId ? { account: accountId } : {}} />
      </PageHeader>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Primero <Link className="underline" href="/accounts">creá una cuenta</Link>.
        </p>
      ) : (
        <TransactionForm accounts={accountOptions} categories={categories} today={c.kernel.clock.today().toISO()} />
      )}

      <Card className="mt-6">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>
            {list.items.length} movimientos · ingresos <MoneyText value={list.totals.income} className="text-positive" /> · gastos{" "}
            <MoneyText value={list.totals.expenses} className="text-negative" />
          </CardTitle>
          <div className="flex flex-wrap gap-1">
            <Link href={filterHref()} className={cn(buttonVariants({ size: "sm", variant: accountId ? "ghost" : "secondary" }))}>Todas</Link>
            {accounts.map((a) => (
              <Link key={a.id} href={filterHref(a.id)} className={cn(buttonVariants({ size: "sm", variant: accountId === a.id ? "secondary" : "ghost" }))}>
                {a.name}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <TransactionTable items={list.items} categories={categories} />
        </CardContent>
      </Card>
    </>
  );
}
