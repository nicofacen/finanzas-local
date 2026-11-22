/**
 * Prepara los archivos generados que necesita la app antes de `dev` y `build`:
 *   1) Convierte las migraciones SQL (backend/migrations) en un módulo TypeScript,
 *      para que el navegador (sin sistema de archivos) pueda aplicarlas.
 *   2) Copia el motor SQLite/WASM (sql.js) a frontend/public/sqljs como archivo estático.
 *
 *   npm run prepare:assets   (se ejecuta solo antes de `dev` y `build`)
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// ── 1) Migraciones embebidas ──────────────────────────────────────
const folder = path.join(root, "backend/migrations");
const journal = JSON.parse(fs.readFileSync(path.join(folder, "meta/_journal.json"), "utf8")) as {
  entries: { tag: string }[];
};
const migrations = journal.entries.map((entry) =>
  fs
    .readFileSync(path.join(folder, `${entry.tag}.sql`), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean),
);
const target = path.join(root, "backend/shared/infrastructure/persistence/migrations.generated.ts");
fs.writeFileSync(
  target,
  `// GENERADO por prepare-assets.ts — no editar a mano.\nexport const MIGRATIONS: readonly (readonly string[])[] = ${JSON.stringify(migrations, null, 2)};\n`,
);
console.log(`✔ ${migrations.length} migración(es) embebida(s) en ${path.relative(root, target)}`);

// ── 2) Motor SQLite/WASM ──────────────────────────────────────────
const source = path.join(root, "node_modules", "sql.js", "dist");
const wasmTarget = path.join(root, "frontend", "public", "sqljs");
fs.mkdirSync(wasmTarget, { recursive: true });
for (const file of ["sql-wasm-browser.js", "sql-wasm-browser.wasm"]) {
  fs.copyFileSync(path.join(source, file), path.join(wasmTarget, file));
}
console.log("✔ sql.js copiado a frontend/public/sqljs");
