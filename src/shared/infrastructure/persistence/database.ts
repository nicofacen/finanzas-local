import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  readonly db: AppDatabase;
  readonly sqlite: Database.Database;
  readonly filePath: string;
}

export function defaultDatabasePath(): string {
  return process.env.FINANZAS_DB_PATH ?? path.join(process.cwd(), "data", "finanzas.db");
}

/**
 * Abre (o crea) la base local y aplica las migraciones pendientes.
 * `:memory:` se usa en los tests de integración.
 */
export function openDatabase(filePath = defaultDatabasePath()): DatabaseHandle {
  if (filePath !== ":memory:") fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db, sqlite, filePath };
}
