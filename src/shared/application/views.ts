import type { Money } from "@/shared/domain";

/**
 * Representación serializable de Money para cruzar la frontera Server → Client.
 * `minor` es string (bigint no es serializable); `value` es sólo para gráficos.
 */
export interface MoneyView {
  readonly minor: string;
  readonly currency: string;
  readonly decimal: string;
  readonly formatted: string;
  /** Número aproximado SÓLO para graficar con Recharts. */
  readonly value: number;
}

export function toMoneyView(m: Money): MoneyView {
  return {
    minor: m.minor.toString(),
    currency: m.currency.code,
    decimal: m.toDecimalString(),
    formatted: m.format(),
    value: m.toNumberForDisplay(),
  };
}

export function bpsToPercent(bps: number | null): number | null {
  return bps === null ? null : Math.round(bps) / 100;
}
