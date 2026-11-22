"use client";

import { DataManagement } from "@frontend/shared/components/DataManagement";
import { PageHeader } from "@frontend/shared/components/MonthNav";
import { Query } from "@frontend/shared/components/Query";

export default function SettingsPage() {
  return (
    <Query load={async (c) => c.kernel.database.location}>
      {(location) => (
        <>
          <PageHeader title="Datos y backup" description="Tus datos viven sólo en este navegador (SQLite local)" />
          <DataManagement location={location} />
        </>
      )}
    </Query>
  );
}
