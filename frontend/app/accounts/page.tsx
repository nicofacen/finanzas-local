"use client";

import { AccountsBoard } from "@frontend/modules/AccountsBoard";
import { PageHeader } from "@frontend/components/MonthNav";
import { Query } from "@frontend/components/Query";
import { unwrapQuery } from "@frontend/shared/data";

export default function AccountsPage() {
  return (
    <Query
      load={async (c) => ({
        accounts: unwrapQuery(await c.accounts.listAccounts.execute()),
        rates: unwrapQuery(await c.accounts.listExchangeRates.execute()),
        baseCurrency: (await c.kernel.settings.get()).baseCurrency.code,
      })}
    >
      {({ accounts, rates, baseCurrency }) => (
        <>
          <PageHeader title="Cuentas" description="Efectivo, bancos, billeteras, tarjetas e inversiones — multimoneda" />
          <AccountsBoard accounts={accounts} rates={rates} baseCurrency={baseCurrency} />
        </>
      )}
    </Query>
  );
}
