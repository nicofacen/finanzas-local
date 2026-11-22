/**
 * Convierte montos escritos por humanos o exportados por bancos a decimal canónico
 * ("15.000,50" → "15000.50", "1,234.5" → "1234.5", "-$ 2.500" → "-2500").
 * Devuelve null si el texto no es un monto.
 */
export function parseLocalizedAmount(raw: string): string | null {
  let s = raw.trim().replace(/\s+/g, "");
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true; // formato contable (1.234,00)
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  s = s.replace(/^(u\$s|us\$|u\$d|usd|ars|eur|brl|\$|€)/i, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let canonical: string;

  if (lastDot >= 0 && lastComma >= 0) {
    // El último separador que aparece es el decimal.
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandsSep = decimalSep === "." ? "," : ".";
    canonical = s.split(thousandsSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    canonical = resolveSingleSeparator(s, ",");
  } else if (lastDot >= 0) {
    canonical = resolveSingleSeparator(s, ".");
  } else {
    canonical = s;
  }
  if (!/^\d+(\.\d+)?$/.test(canonical)) return null;
  return negative ? `-${canonical}` : canonical;
}

/**
 * Con un único tipo de separador: si aparece varias veces o va seguido de
 * exactamente 3 dígitos se interpreta como miles (convención es-AR: "15.000");
 * en otro caso, como decimal ("15,5", "15.25").
 */
function resolveSingleSeparator(s: string, sep: "." | ","): string {
  const parts = s.split(sep);
  if (parts.length > 2) {
    return parts.every((p, i) => i === 0 || p.length === 3) ? parts.join("") : "x";
  }
  const [intPart, frac] = parts;
  if (frac.length === 3) return intPart + frac;
  if (frac.length === 0) return intPart;
  return `${intPart}.${frac}`;
}
