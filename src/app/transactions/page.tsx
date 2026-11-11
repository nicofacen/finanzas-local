"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { TransactionForm } from "@/modules/transactions/presentation/TransactionForm";
import { TransactionTable } from "@/modules/transactions/presentation/TransactionTable";
import { MoneyText } from "@/shared/presentation/components/Money";
import { MonthNav, PageHeader } from "@/shared/presentation/components/MonthNav";
import { PageSuspense, Query } from "@/shared/presentation/components/Query";
import { unwrapQuery } from "@/shared/presentation/data";
import { todayISO, useMonth } from "@/shared/presentation/month";

function Transactions() {
  const month = useMonth().toString();
  const accountId = useSearchParams().get("account") || undefined;
  const filterHref = (id?: string) => `/transactions?${new URLSearchParams({ month, ...(id ? { account: id } : {}) })}`;

  return (
    <Query
      deps={[month, accountId]}
      load={async (c) => ({
        list: unwrapQuery(await c.transactions.listTransactions.execute({ month, accountId })),
        accounts: unwrapQuery(await c.accounts.listAccounts.execute()),
        categories: unwrapQuery(await c.budgets.listCategories.execute()),
      })}
    >
      {({ list, accounts, categories }) => (
        <>
          <PageHeader title="Movimientos" description="Gastos, ingresos, transferencias y compras en cuotas">
            <MonthNav month={month} basePath="/transactions" extra={accountId ? { account: accountId } : {}} />
          </PageHeader>

          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Primero <Link className="underline" href="/accounts">creá una cuenta</Link>.
            </p>
          ) : (
            <TransactionForm
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type }))}
              categories={categories}
              today={todayISO()}
            />
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
      )}
    </Query>
  );
}

export default function TransactionsPage() {
  return (
    <PageSuspense>
      <Transactions />
    </PageSuspense>
  );
}
