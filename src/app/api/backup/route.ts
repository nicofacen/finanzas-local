import { getContainer } from "@/shared/infrastructure/di/container";

export const dynamic = "force-dynamic";

/** Controlador HTTP: descarga el backup JSON (sin lógica de negocio). */
export async function GET() {
  const result = await getContainer().system.exportBackup.execute();
  if (!result.ok) return Response.json({ error: result.error.message }, { status: 500 });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(result.value, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="finanzas-backup-${stamp}.json"`,
    },
  });
}
