"use client";

import { RulesBoard } from "@/modules/rules/presentation/RulesBoard";
import { PageHeader } from "@/shared/presentation/components/MonthNav";
import { Query } from "@/shared/presentation/components/Query";
import { unwrapQuery } from "@/shared/presentation/data";

export default function RulesPage() {
  return (
    <Query
      load={async (c) => ({
        rules: unwrapQuery(await c.rules.listRules.execute()),
        categories: unwrapQuery(await c.budgets.listCategories.execute()),
        accounts: unwrapQuery(await c.accounts.listAccounts.execute()),
      })}
    >
      {({ rules, categories, accounts }) => (
        <>
          <PageHeader title="Reglas de categorización" description="Motor local basado en Specifications combinables (Y / O)" />
          <RulesBoard rules={rules} categories={categories} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
        </>
      )}
    </Query>
  );
}
