import Link from "next/link";
import { ImportWizard } from "@/modules/transactions/presentation/ImportWizard";
import { getContainer } from "@/shared/infrastructure/di/container";
import { unwrapQuery } from "@/shared/presentation/action";
import { PageHeader } from "@/shared/presentation/components/MonthNav";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const c = getContainer();
  const [accounts, categories] = await Promise.all([
    c.accounts.listAccounts.execute().then(unwrapQuery),
    c.budgets.listCategories.execute().then(unwrapQuery),
  ]);
  const adapters = c.csvAdapters.list().map((a) => ({ id: a.id, label: a.label, description: a.description }));
  return (
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
  );
}
