import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DomainError, Result } from "@/shared/domain";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Controlador genérico para Server Actions:
 *   1) valida el DTO de entrada con Zod,
 *   2) invoca el caso de uso (vía contenedor),
 *   3) traduce Result → ActionResult serializable y revalida la UI.
 * NO contiene lógica de negocio.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  raw: unknown,
  invoke: (input: z.infer<S>) => Promise<Result<T, DomainError>>,
  options: { revalidate?: boolean } = {},
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Datos inválidos", fieldErrors };
  }
  try {
    const result = await invoke(parsed.data);
    if (!result.ok) return { ok: false, error: result.error.message };
    if (options.revalidate !== false) revalidatePath("/", "layout");
    return { ok: true, data: result.value };
  } catch (cause) {
    console.error(cause);
    return { ok: false, error: "Ocurrió un error inesperado. Revisá la consola del servidor." };
  }
}

/** Para lecturas en Server Components: un Err se convierte en excepción (error.tsx). */
export function unwrapQuery<T>(result: Result<T, DomainError>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
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
