import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import type { Database, SqlJsStatic } from "sql.js";
import { MIGRATIONS } from "./migrations.generated";
import * as schema from "./schema";

export type AppDatabase = SQLJsDatabase<typeof schema>;
export type SqlValue = string | number | null | Uint8Array;

/** Acceso SQL crudo (UoW, backup). Mantiene el dominio/aplicación libres de sql.js. */
export interface RawSql {
  exec(sql: string): void;
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): T[];
  run(sql: string, params?: SqlValue[]): void;
}

/** Almacenamiento binario de la base (IndexedDB en el navegador, nada en tests). */
export interface IDatabaseStorage {
  load(): Promise<Uint8Array | null>;
  save(bytes: Uint8Array): Promise<void>;
}

export interface DatabaseHandle {
  readonly db: AppDatabase;
  readonly raw: RawSql;
  /** Serializa y guarda la base en el almacenamiento (si hay). */
  persist(): Promise<void>;
  /** Bytes del archivo SQLite completo (para descarga). */
  exportFile(): Uint8Array;
  readonly location: string;
}

class SqlJsRaw implements RawSql {
  constructor(private readonly sqlite: Database) {}

  exec(sql: string) {
    this.sqlite.run(sql);
  }

  all<T>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.sqlite.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  run(sql: string, params: SqlValue[] = []) {
    this.sqlite.run(sql, params);
  }
}

/**
 * Abre la base SQLite (sql.js/WASM) cargando los bytes guardados, aplica las
 * migraciones pendientes (user_version) y devuelve el handle.
 */
export async function openDatabase(
  sqlJs: SqlJsStatic,
  options: { storage?: IDatabaseStorage; location?: string } = {},
): Promise<DatabaseHandle> {
  const bytes = (await options.storage?.load()) ?? undefined;
  const sqlite = new sqlJs.Database(bytes);
  const enableForeignKeys = () => sqlite.run("PRAGMA foreign_keys = ON");
  enableForeignKeys();

  const version = Number(sqlite.exec("PRAGMA user_version")[0]?.values[0]?.[0] ?? 0);
  MIGRATIONS.forEach((statements, index) => {
    if (index < version) return;
    for (const statement of statements) sqlite.run(statement);
    sqlite.run(`PRAGMA user_version = ${index + 1}`);
  });

  const db = drizzle(sqlite, { schema });
  const raw = new SqlJsRaw(sqlite);
  const exportFile = () => {
    const data = sqlite.export(); // reinicia pragmas: se restauran abajo
    enableForeignKeys();
    return data;
  };
  return {
    db,
    raw,
    exportFile,
    location: options.location ?? "memoria",
    persist: async () => {
      if (options.storage) await options.storage.save(exportFile());
    },
  };
}
