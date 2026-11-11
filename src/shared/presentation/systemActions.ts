"use server";

import { z } from "zod";
import { getContainer } from "@/shared/infrastructure/di/container";
import { runAction } from "./action";

export async function seedDemoAction() {
  return runAction(z.object({}), {}, () => getContainer().system.seedDemoData.execute({ reset: true }));
}

export async function resetDataAction(input: unknown) {
  const schema = z.object({ confirm: z.literal("BORRAR", { message: 'Escribí "BORRAR" para confirmar' }) });
  return runAction(schema, input, () => getContainer().system.resetData.execute());
}

export async function restoreBackupAction(input: unknown) {
  const schema = z.object({ json: z.string().min(2).max(50_000_000) });
  return runAction(schema, input, (dto) => getContainer().system.restoreBackup.execute(dto));
}

export async function snapshotDatabaseAction() {
  return runAction(z.object({}), {}, () => getContainer().system.snapshotDatabase.execute(), { revalidate: false });
}
