import { z } from "zod";
import type { DomainError, Result } from "@/shared/domain";
import { getContainer } from "@/shared/infrastructure/di/browser";
import type { AppContainer } from "@/shared/infrastructure/di/container";
import { invalidateAll } from "./data";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Las acciones del usuario se ejecutan de a una: la cola garantiza que una
 * llamada a otra UoW durante una transacción activa sea realmente anidada.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Controlador genérico de acciones (corre en el navegador):
 *   1) valida el DTO de entrada con Zod,
 *   2) invoca el caso de uso a través del contenedor,
 *   3) persiste la base (IndexedDB), traduce Result → ActionResult y refresca la UI.
 * NO contiene lógica de negocio.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  raw: unknown,
  invoke: (input: z.infer<S>, container: AppContainer) => Promise<Result<T, DomainError>>,
  options: { revalidate?: boolean } = {},
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Datos inválidos", fieldErrors };
  }

  const task = async (): Promise<ActionResult<T>> => {
    try {
      const container = await getContainer();
      const result = await invoke(parsed.data, container);
      if (!result.ok) return { ok: false, error: result.error.message };
      if (options.revalidate !== false) await container.persist();
      return { ok: true, data: result.value };
    } catch (cause) {
      console.error(cause);
      return { ok: false, error: "Ocurrió un error inesperado. Revisá la consola del navegador." };
    }
  };
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  const result = await run;
  if (result.ok && options.revalidate !== false) invalidateAll();
  return result;
}

// ─────────────── Esquemas Zod reutilizables ───────────────

export const zId = z.string().min(1, "Requerido");
export const zMonth = z.string().regex(/^\d{4}-\d{2}$/, "Mes inválido (AAAA-MM)");
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
/** Monto en texto libre ("15.000,50"); el dominio hace el parseo exacto. */
export const zAmount = z.string().trim().min(1, "Ingresá un monto").max(30).regex(/^[\d.,\s$+-]+$/, "Monto inválido");
export const zOptionalId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
