"use client";

import { DataManagement } from "@frontend/components/DataManagement";
import { PageHeader } from "@frontend/components/MonthNav";
import { Query } from "@frontend/components/Query";

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
