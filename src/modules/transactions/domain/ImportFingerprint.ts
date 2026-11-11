import { normalizeText, type LocalDate, type Money } from "@/shared/domain";

/**
 * Huella determinística de una línea de extracto para evitar importar duplicados.
 * `occurrence` distingue dos movimientos idénticos el mismo día (ej. dos cafés).
 * FNV-1a 64 bits en TypeScript puro (sin dependencias de crypto en el dominio).
 */
export function importFingerprint(
  accountId: string,
  date: LocalDate,
  amount: Money,
  description: string,
  occurrence: number,
): string {
  const key = [accountId, date.toISO(), amount.minor.toString(), normalizeText(description), occurrence].join("|");
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(key)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}
