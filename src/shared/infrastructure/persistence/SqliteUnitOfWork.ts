import { AsyncLocalStorage } from "node:async_hooks";
import type Database from "better-sqlite3";
import { DomainError, InvariantViolation, err, type IUnitOfWork, type Result } from "@/shared/domain";

/**
 * Unit of Work sobre la conexión SQLite única.
 *
 * - BEGIN IMMEDIATE / COMMIT / ROLLBACK explícitos (las transacciones nativas de
 *   better-sqlite3 son síncronas y no admiten callbacks async).
 * - Un mutex serializa unidades de trabajo concurrentes (dos Server Actions a la vez).
 * - AsyncLocalStorage detecta anidamiento: una UoW dentro de otra se une a la externa.
 * - Err o excepción ⇒ ROLLBACK; las InvariantViolation se traducen a DomainError.
 */
export class SqliteUnitOfWork implements IUnitOfWork {
  private readonly scope = new AsyncLocalStorage<true>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly sqlite: Database.Database) {}

  async transaction<T, E extends DomainError>(work: () => Promise<Result<T, E>>): Promise<Result<T, E | DomainError>> {
    if (this.scope.getStore()) return this.runGuarded(work); // anidada: participa de la transacción externa

    const run = async (): Promise<Result<T, E | DomainError>> => {
      this.sqlite.exec("BEGIN IMMEDIATE");
      const result = await this.scope.run(true, () => this.runGuarded(work));
      if (result.ok) this.sqlite.exec("COMMIT");
      else if (this.sqlite.inTransaction) this.sqlite.exec("ROLLBACK");
      return result;
    };

    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async runGuarded<T, E extends DomainError>(work: () => Promise<Result<T, E>>): Promise<Result<T, E | DomainError>> {
    try {
      return await work();
    } catch (cause) {
      if (cause instanceof InvariantViolation) return err(new DomainError("VALIDATION", cause.message));
      return err(DomainError.unexpected(cause));
    }
  }
}
