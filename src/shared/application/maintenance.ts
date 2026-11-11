import { DomainError, ok, type Result } from "@/shared/domain";
import type { BackupDocument, IBackupService, IDataMaintenance } from "./ports";
import type { UseCase } from "./UseCase";

export class ExportBackupUseCase implements UseCase<void, BackupDocument> {
  constructor(private readonly backup: IBackupService) {}
  async execute(): Promise<Result<BackupDocument, DomainError>> {
    return ok(await this.backup.exportJson());
  }
}

export class RestoreBackupUseCase implements UseCase<{ json: string }, { rows: number }> {
  constructor(private readonly backup: IBackupService) {}
  async execute({ json }: { json: string }) {
    let doc: unknown;
    try {
      doc = JSON.parse(json);
    } catch {
      return { ok: false as const, error: DomainError.validation("El archivo no es JSON válido") };
    }
    return this.backup.restoreJson(doc);
  }
}

export class SnapshotDatabaseUseCase implements UseCase<void, { path: string }> {
  constructor(private readonly backup: IBackupService) {}
  async execute() {
    const r = await this.backup.snapshotDatabaseFile();
    return r.ok ? ok({ path: r.value }) : r;
  }
}

export class ResetDataUseCase implements UseCase<void, void> {
  constructor(private readonly maintenance: IDataMaintenance) {}
  async execute(): Promise<Result<void, DomainError>> {
    await this.maintenance.wipeAll();
    return ok(undefined);
  }
}
