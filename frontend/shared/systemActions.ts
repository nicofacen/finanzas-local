import { z } from "zod";
import { runAction } from "./action";

export async function seedDemoAction() {
  return runAction(z.object({}), {}, (_dto, c) => c.system.seedDemoData.execute({ reset: true }));
}

export async function resetDataAction(input: unknown) {
  const schema = z.object({ confirm: z.literal("BORRAR", { message: 'Escribí "BORRAR" para confirmar' }) });
  return runAction(schema, input, (_dto, c) => c.system.resetData.execute());
}

export async function restoreBackupAction(input: unknown) {
  const schema = z.object({ json: z.string().min(2).max(50_000_000) });
  return runAction(schema, input, (dto, c) => c.system.restoreBackup.execute(dto));
}

export async function exportBackupAction() {
  return runAction(z.object({}), {}, (_dto, c) => c.system.exportBackup.execute(), { revalidate: false });
}

export async function exportDatabaseFileAction() {
  return runAction(z.object({}), {}, (_dto, c) => c.system.exportDatabaseFile.execute(), { revalidate: false });
}
