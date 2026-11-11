import type { DomainError, Result } from "@/shared/domain";

export interface BackupDocument {
  readonly format: "finanzas-local-first/backup";
  readonly version: number;
  readonly createdAt: string;
  readonly tables: Record<string, unknown[]>;
}

/** Puerto de backup/restauración local (JSON portable o copia binaria de SQLite). */
export interface IBackupService {
  exportJson(): Promise<BackupDocument>;
  restoreJson(doc: unknown): Promise<Result<{ rows: number }, DomainError>>;
  /** Copia en caliente del archivo .db (API de backup de SQLite). Devuelve la ruta. */
  snapshotDatabaseFile(): Promise<Result<string, DomainError>>;
}

export interface IDataMaintenance {
  /** Elimina todos los datos del usuario (no el esquema). */
  wipeAll(): Promise<void>;
  isEmpty(): Promise<boolean>;
}
