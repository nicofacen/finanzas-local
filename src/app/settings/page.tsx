import { getContainer } from "@/shared/infrastructure/di/container";
import { DataManagement } from "@/shared/presentation/components/DataManagement";
import { PageHeader } from "@/shared/presentation/components/MonthNav";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const { filePath } = getContainer().kernel.database;
  return (
    <>
      <PageHeader title="Datos y backup" description="Tus datos viven sólo en este equipo (SQLite local)" />
      <DataManagement databasePath={filePath} />
    </>
  );
}
