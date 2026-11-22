/**
 * Convierte las migraciones SQL (backend/database/migrations) en un módulo TypeScript,
 * para que la app (que corre en el navegador, sin sistema de archivos) pueda aplicarlas.
 *   npm run prepare:assets   (se ejecuta solo antes de `dev` y `build`)
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const folder = path.join(root, "backend/database/migrations");
const journal = JSON.parse(fs.readFileSync(path.join(folder, "meta/_journal.json"), "utf8")) as {
  entries: { tag: string }[];
};

const migrations = journal.entries.map((entry) => {
  const sql = fs.readFileSync(path.join(folder, `${entry.tag}.sql`), "utf8");
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
});

const target = path.join(root, "backend/src/shared/infrastructure/persistence/migrations.generated.ts");
fs.writeFileSync(
  target,
  `// GENERADO por scripts/embed-migrations.ts — no editar a mano.\nexport const MIGRATIONS: readonly (readonly string[])[] = ${JSON.stringify(migrations, null, 2)};\n`,
);
console.log(`✔ ${migrations.length} migración(es) embebida(s) en ${path.relative(root, target)}`);
