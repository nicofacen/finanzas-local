import type { IClock, IIdGenerator, ISettingsReader, ISettingsWriter, IUnitOfWork } from "@/shared/domain";
import type { DatabaseHandle } from "../persistence/database";

/** Dependencias técnicas compartidas que reciben todas las fábricas de módulo. */
export interface SharedKernel {
  readonly database: DatabaseHandle;
  readonly uow: IUnitOfWork;
  readonly ids: IIdGenerator;
  readonly clock: IClock;
  readonly settings: ISettingsReader & ISettingsWriter;
}
