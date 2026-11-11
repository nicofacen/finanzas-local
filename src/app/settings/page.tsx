"use client";

import { DataManagement } from "@/shared/presentation/components/DataManagement";
import { PageHeader } from "@/shared/presentation/components/MonthNav";
import { Query } from "@/shared/presentation/components/Query";

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
