export type RoundingMode = "HALF_EVEN" | "HALF_UP" | "DOWN";

/**
 * División entera de bigint con redondeo explícito.
 * `HALF_EVEN` (redondeo bancario) evita sesgos acumulados en conversiones masivas.
 */
export function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode = "HALF_EVEN"): bigint {
  if (denominator === 0n) throw new RangeError("División por cero");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const negative = numerator < 0n;
  const absN = negative ? -numerator : numerator;
  let q = absN / denominator;
  const r = absN % denominator;

  if (r !== 0n && mode !== "DOWN") {
    const twice = r * 2n;
    if (twice > denominator) q += 1n;
    else if (twice === denominator) {
      if (mode === "HALF_UP" || q % 2n === 1n) q += 1n;
    }
  }
  return negative ? -q : q;
}
