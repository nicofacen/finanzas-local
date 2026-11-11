import { DomainError, InvariantViolation, err, type IUnitOfWork, type Result } from "@/shared/domain";
import type { RawSql } from "./database";

/**
 * Unit of Work sobre la conexión SQLite única (sql.js).
 *
 * - BEGIN / COMMIT / ROLLBACK explícitos.
 * - Anidamiento: una UoW invocada mientras otra está activa se une a la externa
 *   (así el import de extractos o la demo reutilizan los casos de uso atómicos).
 *   La capa de presentación serializa las acciones del usuario (ver runAction),
 *   por lo que una llamada "concurrente" siempre es realmente anidada.
 * - Err o excepción ⇒ ROLLBACK; las InvariantViolation se traducen a DomainError.
 */
export class SqliteUnitOfWork implements IUnitOfWork {
  private active = false;

  constructor(private readonly sql: RawSql) {}

  async transaction<T, E extends DomainError>(work: () => Promise<Result<T, E>>): Promise<Result<T, E | DomainError>> {
    if (this.active) return this.runGuarded(work); // anidada: participa de la transacción externa

    this.active = true;
    this.sql.exec("BEGIN");
    try {
      const result = await this.runGuarded(work);
      this.sql.exec(result.ok ? "COMMIT" : "ROLLBACK");
      return result;
    } catch (cause) {
      this.sql.exec("ROLLBACK");
      return err(DomainError.unexpected(cause));
    } finally {
      this.active = false;
    }
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
