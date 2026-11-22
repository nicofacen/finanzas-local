import type { DomainError } from "../DomainError";
import type { Result } from "../Result";

/**
 * GRASP Pure Fabrication — frontera transaccional.
 *
 * Ejecuta `work` de forma atómica: si devuelve Err o lanza, TODO se revierte
 * (transacción, balances de cuentas y sobres). Las implementaciones deben
 * serializar unidades de trabajo concurrentes.
 */
export interface IUnitOfWork {
  transaction<T, E extends DomainError>(work: () => Promise<Result<T, E>>): Promise<Result<T, E | DomainError>>;
}
