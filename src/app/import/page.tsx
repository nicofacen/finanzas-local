"use client";

import Link from "next/link";
import { ImportWizard } from "@/modules/transactions/presentation/ImportWizard";
import { PageHeader } from "@/shared/presentation/components/MonthNav";
import { Query } from "@/shared/presentation/components/Query";
import { unwrapQuery } from "@/shared/presentation/data";

export default function ImportPage() {
  return (
    <Query
      load={async (c) => ({
        accounts: unwrapQuery(await c.accounts.listAccounts.execute()),
        categories: unwrapQuery(await c.budgets.listCategories.execute()),
        adapters: c.csvAdapters.list().map((a) => ({ id: a.id, label: a.label, description: a.description })),
      })}
    >
      {({ accounts, categories, adapters }) => (
        <>
          <PageHeader title="Importar extracto" description="CSV de bancos y billeteras, con autocategorización y detección de duplicados" />
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Primero <Link className="underline" href="/accounts">creá una cuenta</Link>.</p>
          ) : (
            <ImportWizard
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
              adapters={adapters}
              categories={categories}
            />
          )}
        </>
      )}
    </Query>
  );
}
