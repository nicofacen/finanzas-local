import type { DomainError, Result } from "@/shared/domain";

/**
 * GRASP Controller + SOLID SRP: cada acción del usuario es un caso de uso
 * con un único método público. Nunca lanza: siempre devuelve Result.
 */
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Result<Output, DomainError>>;
}
