import { DomainError, err, ok, type Result } from "@/shared/domain";
import type { BackupDocument, IBackupService, IDataMaintenance } from "@/shared/application/ports";
import type { RawSql, SqlValue } from "../persistence/database";
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
    private readonly sql: RawSql,
    private readonly exportFile: () => Uint8Array,
  ) {}

  async exportJson(): Promise<BackupDocument> {
    const tables: Record<string, unknown[]> = {};
    for (const name of TABLE_NAMES) tables[name] = this.sql.all(`SELECT * FROM "${name}"`);
    return { format: FORMAT, version: VERSION, createdAt: new Date().toISOString(), tables };
  }

  async restoreJson(doc: unknown): Promise<Result<{ rows: number }, DomainError>> {
    if (!isBackup(doc)) return err(DomainError.validation("El archivo no es un backup válido de esta aplicación"));

    const columnsOf = (table: string) =>
      new Set(this.sql.all<{ name: string }>(`PRAGMA table_info("${table}")`).map((c) => c.name));

    let rows = 0;
    this.sql.exec("BEGIN");
    try {
      this.wipeSync();
      for (const name of TABLE_NAMES) {
        const allowed = columnsOf(name);
        for (const raw of doc.tables[name] ?? []) {
          if (!raw || typeof raw !== "object") continue;
          const entries = Object.entries(raw as Record<string, unknown>).filter(([k]) => allowed.has(k));
          if (entries.length === 0) continue;
          const cols = entries.map(([k]) => `"${k}"`).join(", ");
          const params = entries.map(() => "?").join(", ");
          this.sql.run(
            `INSERT INTO "${name}" (${cols}) VALUES (${params})`,
            entries.map(([, v]) => (v === undefined ? null : (v as SqlValue))),
          );
          rows++;
        }
      }
      this.sql.exec("COMMIT");
      return ok({ rows });
    } catch (cause) {
      this.sql.exec("ROLLBACK");
      return err(DomainError.validation(`No se pudo restaurar el backup: ${(cause as Error).message}`));
    }
  }

  async exportDatabaseFile(): Promise<Uint8Array> {
    return this.exportFile();
  }

  async wipeAll(): Promise<void> {
    this.wipeSync();
  }

  async isEmpty(): Promise<boolean> {
    return (this.sql.all<{ n: number }>(`SELECT COUNT(*) AS n FROM accounts`)[0]?.n ?? 0) === 0;
  }

  private wipeSync() {
    for (const name of [...TABLE_NAMES].reverse()) this.sql.run(`DELETE FROM "${name}"`);
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
