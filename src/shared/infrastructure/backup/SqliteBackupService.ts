import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { DomainError, err, ok, type Result } from "@/shared/domain";
import type { BackupDocument, IBackupService, IDataMaintenance } from "@/shared/application/ports";
import { TABLES_IN_DEPENDENCY_ORDER } from "../persistence/schema";

const FORMAT = "finanzas-local-first/backup" as const;
const VERSION = 1;
const TABLE_NAMES = TABLES_IN_DEPENDENCY_ORDER.map(([name]) => name);

/**
 * Backup/restauración 100% local. Trabaja con SQL crudo sobre los nombres de
 * tabla del esquema para copiar filas tal cual (los montos ya son enteros).
 */
export class SqliteBackupService implements IBackupService, IDataMaintenance {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly databaseFile: string,
  ) {}

  async exportJson(): Promise<BackupDocument> {
    const tables: Record<string, unknown[]> = {};
    for (const name of TABLE_NAMES) tables[name] = this.sqlite.prepare(`SELECT * FROM "${name}"`).all();
    return { format: FORMAT, version: VERSION, createdAt: new Date().toISOString(), tables };
  }

  async restoreJson(doc: unknown): Promise<Result<{ rows: number }, DomainError>> {
    if (!isBackup(doc)) return err(DomainError.validation("El archivo no es un backup válido de esta aplicación"));

    const columnsOf = (table: string) =>
      new Set((this.sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name));

    let rows = 0;
    const restore = this.sqlite.transaction(() => {
      this.wipeSync();
      for (const name of TABLE_NAMES) {
        const data = doc.tables[name] ?? [];
        const allowed = columnsOf(name);
        for (const raw of data) {
          if (!raw || typeof raw !== "object") continue;
          const entries = Object.entries(raw as Record<string, unknown>).filter(([k]) => allowed.has(k));
          if (entries.length === 0) continue;
          const cols = entries.map(([k]) => `"${k}"`).join(", ");
          const params = entries.map(() => "?").join(", ");
          this.sqlite.prepare(`INSERT INTO "${name}" (${cols}) VALUES (${params})`).run(...entries.map(([, v]) => v));
          rows++;
        }
      }
    });
    try {
      restore();
      return ok({ rows });
    } catch (cause) {
      return err(DomainError.validation(`No se pudo restaurar el backup: ${(cause as Error).message}`));
    }
  }

  async snapshotDatabaseFile(): Promise<Result<string, DomainError>> {
    if (this.databaseFile === ":memory:") return err(DomainError.validation("La base en memoria no se puede copiar"));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(path.dirname(this.databaseFile), "backups", `finanzas-${stamp}.db`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await this.sqlite.backup(target);
    return ok(target);
  }

  async wipeAll(): Promise<void> {
    this.sqlite.transaction(() => this.wipeSync())();
  }

  async isEmpty(): Promise<boolean> {
    const row = this.sqlite.prepare(`SELECT COUNT(*) AS n FROM accounts`).get() as { n: number };
    return row.n === 0;
  }

  private wipeSync() {
    for (const name of [...TABLE_NAMES].reverse()) this.sqlite.prepare(`DELETE FROM "${name}"`).run();
  }
}

function isBackup(doc: unknown): doc is BackupDocument {
  return (
    !!doc &&
    typeof doc === "object" &&
    (doc as BackupDocument).format === FORMAT &&
    typeof (doc as BackupDocument).tables === "object"
  );
}
