/**
 * Carga datos de demostración en la base local.
 *   npm run db:seed        → limpia y carga la demo
 *   npm run db:reset       → sólo limpia (deja la base vacía)
 */
import { buildContainer } from "../src/shared/infrastructure/di/container";

async function main() {
  const container = buildContainer();
  const resetOnly = process.argv.includes("--reset-only");

  if (resetOnly) {
    await container.system.resetData.execute();
    console.log("✔ Base de datos limpia.");
    return;
  }
  const result = await container.system.seedDemoData.execute({ reset: true });
  if (!result.ok) {
    console.error(`✖ ${result.error.message}`);
    process.exit(1);
  }
  console.log(`✔ Datos de demostración cargados (${result.value.transactions} movimientos) en ${container.kernel.database.filePath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
