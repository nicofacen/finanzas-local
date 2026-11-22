/**
 * Result<T, E>: manejo explícito de errores sin excepciones descontroladas.
 * Los casos de uso y factorías de dominio devuelven Result; las excepciones
 * quedan reservadas para violaciones de invariantes (bugs de programación).
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const Results = {
  map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
    return r.ok ? ok(fn(r.value)) : r;
  },

  andThen<T, U, E, F>(r: Result<T, E>, fn: (v: T) => Result<U, F>): Result<U, E | F> {
    return r.ok ? fn(r.value) : r;
  },

  /** Combina una lista de Results: el primer error corta la cadena. */
  combine<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
    const values: T[] = [];
    for (const r of results) {
      if (!r.ok) return r;
      values.push(r.value);
    }
    return ok(values);
  },

  /** Sólo para tests, seeds y bordes donde un error es realmente inesperado. */
  unwrap<T, E>(r: Result<T, E>): T {
    if (r.ok) return r.value;
    const e = r.error as unknown;
    const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
    throw new Error(`unwrap() sobre un Err: ${message}`);
  },
};
