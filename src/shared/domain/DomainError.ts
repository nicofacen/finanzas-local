export type DomainErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CURRENCY_MISMATCH"
  | "INSUFFICIENT_FUNDS"
  | "CREDIT_LIMIT_EXCEEDED"
  | "PARSE_ERROR"
  | "UNEXPECTED";

/**
 * Error de dominio como valor (no se lanza): viaja dentro de Result.
 */
export class DomainError {
  constructor(
    readonly code: DomainErrorCode,
    readonly message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {}

  static validation(message: string, details?: Record<string, unknown>) {
    return new DomainError("VALIDATION", message, details);
  }
  static notFound(entity: string, id: string) {
    return new DomainError("NOT_FOUND", `${entity} no encontrado/a (${id})`, { entity, id });
  }
  static conflict(message: string) {
    return new DomainError("CONFLICT", message);
  }
  static unexpected(cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return new DomainError("UNEXPECTED", `Error inesperado: ${message}`);
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

/**
 * Violación de invariante: indica un bug (p.ej. sumar ARS + USD sin convertir).
 * Se lanza, y la Unit of Work la captura y la convierte en DomainError.
 */
export class InvariantViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvariantViolation";
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InvariantViolation(message);
}
