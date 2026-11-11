import { RulesBoard } from "@/modules/rules/presentation/RulesBoard";
import { getContainer } from "@/shared/infrastructure/di/container";
import { unwrapQuery } from "@/shared/presentation/action";
import { PageHeader } from "@/shared/presentation/components/MonthNav";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const c = getContainer();
  const [rules, categories, accounts] = await Promise.all([
    c.rules.listRules.execute().then(unwrapQuery),
    c.budgets.listCategories.execute().then(unwrapQuery),
    c.accounts.listAccounts.execute().then(unwrapQuery),
  ]);
  return (
    <>
      <PageHeader title="Reglas de categorización" description="Motor local basado en Specifications combinables (Y / O)" />
      <RulesBoard rules={rules} categories={categories} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
    </>
  );
}
