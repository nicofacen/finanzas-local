import { AccountsBoard } from "@/modules/accounts/presentation/AccountsBoard";
import { getContainer } from "@/shared/infrastructure/di/container";
import { unwrapQuery } from "@/shared/presentation/action";
import { PageHeader } from "@/shared/presentation/components/MonthNav";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const c = getContainer();
  const [accounts, rates, settings] = await Promise.all([
    c.accounts.listAccounts.execute().then(unwrapQuery),
    c.accounts.listExchangeRates.execute().then(unwrapQuery),
    c.kernel.settings.get(),
  ]);
  return (
    <>
      <PageHeader title="Cuentas" description="Efectivo, bancos, billeteras, tarjetas e inversiones — multimoneda" />
      <AccountsBoard accounts={accounts} rates={rates} baseCurrency={settings.baseCurrency.code} />
    </>
  );
}
