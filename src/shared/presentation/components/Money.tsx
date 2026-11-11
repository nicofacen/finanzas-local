import { cn } from "@/components/ui/cn";
import type { MoneyView } from "@/shared/application/views";

/** Muestra un MoneyView ya formateado por el dominio, coloreado por signo si se pide. */
export function MoneyText({
  value,
  colored = false,
  className,
}: {
  value: MoneyView;
  colored?: boolean;
  className?: string;
}) {
  const negative = value.minor.startsWith("-");
  const zero = /^-?0+$/.test(value.minor);
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        colored && !zero && (negative ? "text-negative" : "text-positive"),
        className,
      )}
    >
      {value.formatted}
    </span>
  );
}

/** Formateo compacto para ejes de gráficos ($1,2M). Sólo visual. */
export function compactCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

export function fullCurrency(value: number): string {
  return value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}
