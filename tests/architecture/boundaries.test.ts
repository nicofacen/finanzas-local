import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardián de arquitectura: falla si alguien cruza una frontera de capas.
 *
 *   frontend/            →  puede usar backend (application, domain, di/)   ✔
 *   backend/src          →  NUNCA importa frontend, React ni Next           ✘
 *   backend/**\/domain    →  puro: sólo importa otros domain                 ✘ librerías, application, infrastructure
 *   backend/**\/application → no importa infrastructure ni frontend         ✘
 *
 * Las rutas "lógicas" quitan el prefijo src: backend/src/modules/x → backend/modules/x
 */

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, "frontend");
const BACKEND = path.join(ROOT, "backend", "src");

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) return name === "node_modules" || name === ".next" || name === "out" ? [] : listFiles(full);
    // Los tests (que importan vitest) y el código generado no cuentan como código de producción.
    return /\.(ts|tsx)$/.test(name) && !/\.(test|generated)\.ts$/.test(name) && name !== "next-env.d.ts" ? [full] : [];
  });
}

/** Ruta lógica de un archivo: relativa a la raíz y sin el "src" del backend. */
function logical(absPath: string): string {
  return path.relative(ROOT, absPath).split(path.sep).join("/").replace(/^backend\/src\//, "backend/");
}

/** Especificadores de import de un archivo (import/export ... from "x", import("x")). */
function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  return [...text.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);
}

/** Resuelve un especificador a ruta lógica; null si es un paquete externo. */
function resolveSpecifier(file: string, spec: string): string | null {
  if (spec.startsWith("@backend/")) return "backend/" + spec.slice("@backend/".length);
  if (spec.startsWith("@frontend/")) return "frontend/" + spec.slice("@frontend/".length);
  if (spec.startsWith(".")) return logical(path.resolve(path.dirname(file), spec));
  return null;
}

const backendFiles = () => listFiles(BACKEND);
const frontendFiles = () => listFiles(FRONTEND);

const UI_PACKAGES = /^(react|react-dom|next|recharts|sonner|lucide-react|class-variance-authority|clsx|tailwind-merge)(\/|$)/;

describe("Arquitectura: frontera frontend / backend", () => {
  it("existen las carpetas frontend/ y backend/src/", () => {
    expect(fs.existsSync(FRONTEND)).toBe(true);
    expect(fs.existsSync(BACKEND)).toBe(true);
    expect(backendFiles().length).toBeGreaterThan(50);
  });

  it("el backend nunca depende del frontend, de React ni de Next", () => {
    const bad: string[] = [];
    for (const file of backendFiles()) {
      for (const spec of importsOf(file)) {
        const target = resolveSpecifier(file, spec);
        if (target?.startsWith("frontend/")) bad.push(`${logical(file)} → "${spec}": el backend no puede importar el frontend`);
        if (UI_PACKAGES.test(spec)) bad.push(`${logical(file)} → "${spec}": el backend no puede usar librerías de UI`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("el dominio es puro: sólo importa otros archivos de dominio (sin librerías)", () => {
    const bad: string[] = [];
    for (const file of backendFiles()) {
      if (!/\/domain\//.test(logical(file))) continue;
      for (const spec of importsOf(file)) {
        const target = resolveSpecifier(file, spec);
        if (target === null) bad.push(`${logical(file)} → "${spec}": el dominio no puede usar librerías externas`);
        else if (/\/(application|infrastructure)(\/|$)/.test(target) || target.startsWith("frontend/"))
          bad.push(`${logical(file)} → "${spec}": el dominio no puede depender de application/infrastructure/frontend`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("application no depende de infrastructure ni de la base de datos (sólo de puertos)", () => {
    const bad: string[] = [];
    for (const file of backendFiles()) {
      if (!/\/application\//.test(logical(file))) continue;
      for (const spec of importsOf(file)) {
        const target = resolveSpecifier(file, spec);
        if (target && /\/infrastructure(\/|$)/.test(target)) bad.push(`${logical(file)} → "${spec}": application no puede importar infrastructure`);
        if (/^(drizzle-orm|sql\.js)/.test(spec)) bad.push(`${logical(file)} → "${spec}": application no puede usar la base de datos directamente`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("el frontend sólo toca del backend: application, domain y el contenedor (di/)", () => {
    const bad: string[] = [];
    for (const file of frontendFiles()) {
      for (const spec of importsOf(file)) {
        const target = resolveSpecifier(file, spec);
        if (!target?.startsWith("backend/")) continue;
        if (/^backend\/(shared|modules\/\w+)\/(application|domain)(\/|$)/.test(target)) continue;
        if (/^backend\/shared\/infrastructure\/di\/(browser|container)$/.test(target)) continue;
        bad.push(`${logical(file)} → "${spec}": el frontend sólo puede usar application, domain o el contenedor de dependencias`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("las rutas de frontend/app no tocan infrastructure del backend", () => {
    const bad: string[] = [];
    for (const file of frontendFiles()) {
      if (!logical(file).startsWith("frontend/app/")) continue;
      for (const spec of importsOf(file)) {
        const target = resolveSpecifier(file, spec);
        if (target && /^backend\/.*\/infrastructure(\/|$)/.test(target)) bad.push(`${logical(file)} → "${spec}": las rutas deben pasar por el frontend`);
      }
    }
    expect(bad).toEqual([]);
  });
});
