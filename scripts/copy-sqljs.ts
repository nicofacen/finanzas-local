/**
 * Copia el motor SQLite/WASM (sql.js) a public/sqljs para servirlo como archivo estático.
 * El navegador lo carga con un <script> clásico, evitando problemas de bundling con WASM.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "node_modules", "sql.js", "dist");
const target = path.join(root, "public", "sqljs");
fs.mkdirSync(target, { recursive: true });
for (const file of ["sql-wasm-browser.js", "sql-wasm-browser.wasm"]) {
  fs.copyFileSync(path.join(source, file), path.join(target, file));
}
console.log("✔ sql.js copiado a public/sqljs");
