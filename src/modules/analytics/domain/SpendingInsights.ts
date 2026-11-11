import {
  CompositeSpecification,
  Money,
  normalizeText,
  type Currency,
  type LocalDate,
  type YearMonth,
} from "@/shared/domain";

export interface SpendingRecord {
  readonly date: LocalDate;
  readonly description: string;
  readonly categoryId: string | null;
  /** Moneda base, positivo. */
  readonly amount: Money;
}

export interface InsightContext {
  readonly month: YearMonth;
  readonly currency: Currency;
  readonly current: readonly SpendingRecord[];
  /** Gastos de los 3 meses previos (clave "AAAA-MM"). */
  readonly previous: ReadonlyMap<string, readonly SpendingRecord[]>;
  readonly categoryNames: ReadonlyMap<string, string>;
  readonly antThreshold: Money;
}

export type InsightSeverity = "info" | "warning" | "critical";

export interface SpendingInsight {
  readonly kind: "ant_expense" | "category_deviation";
  readonly severity: InsightSeverity;
  readonly title: string;
  readonly message: string;
  readonly amount: Money;
  readonly categoryId: string | null;
}

/** Strategy: cada detector analiza el historial con su propio criterio. */
export interface ISpendingInsightDetector {
  detect(ctx: InsightContext): SpendingInsight[];
}

/** Specification: un gasto es "hormiga" si es pequeño (≤ umbral). */
export class AntExpenseSpecification extends CompositeSpecification<SpendingRecord> {
  constructor(private readonly threshold: Money) {
    super();
  }
  isSatisfiedBy(r: SpendingRecord) {
    return r.amount.isPositive() && r.amount.lessThanOrEqual(this.threshold);
  }
  describe() {
    return `gasto ≤ ${this.threshold.format()}`;
  }
}

/** Clave de comercio: primeras 2 palabras normalizadas ("cafe martinez palermo" → "cafe martinez"). */
function merchantKey(description: string): string {
  return normalizeText(description).replace(/[^a-z0-9 ]/g, "").split(" ").slice(0, 2).join(" ");
}

/**
 * Detecta gastos hormiga: compras chicas y repetidas que en conjunto pesan.
 * Reporta comercios con ≥ `minOccurrences` y el total del mes vs el promedio móvil de 3 meses.
 */
export class AntExpenseDetector implements ISpendingInsightDetector {
  constructor(private readonly minOccurrences = 3) {}

  detect(ctx: InsightContext): SpendingInsight[] {
    const spec = new AntExpenseSpecification(ctx.antThreshold);
    const ants = ctx.current.filter((r) => spec.isSatisfiedBy(r));
    const insights: SpendingInsight[] = [];
    const zero = Money.zero(ctx.currency);

    const groups = new Map<string, SpendingRecord[]>();
    for (const r of ants) {
      const key = merchantKey(r.description);
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const records of groups.values()) {
      if (records.length < this.minOccurrences) continue;
      const total = Money.sum(records.map((r) => r.amount), ctx.currency);
      insights.push({
        kind: "ant_expense",
        severity: records.length >= this.minOccurrences * 2 ? "warning" : "info",
        title: `Gasto hormiga: ${records[0].description}`,
        message: `${records.length} compras pequeñas este mes suman ${total.format()}.`,
        amount: total,
        categoryId: records[0].categoryId,
      });
    }

    const antTotal = Money.sum(ants.map((r) => r.amount), ctx.currency);
    const prevTotals = [...ctx.previous.values()].map((recs) =>
      Money.sum(recs.filter((r) => spec.isSatisfiedBy(r)).map((r) => r.amount), ctx.currency),
    );
    if (prevTotals.length > 0 && antTotal.isPositive()) {
      const avg = Money.sum(prevTotals, ctx.currency).multiplyByRatio(1n, BigInt(prevTotals.length));
      if (avg.isPositive() && antTotal.greaterThan(avg.percentage(12_500))) {
        insights.push({
          kind: "ant_expense",
          severity: "warning",
          title: "Los gastos hormiga vienen en aumento",
          message: `Este mes llevás ${antTotal.format()} en gastos ≤ ${ctx.antThreshold.format()}, contra un promedio de ${avg.format()} en los últimos ${prevTotals.length} meses.`,
          amount: antTotal.subtract(avg).max(zero),
          categoryId: null,
        });
      }
    }
    return insights.sort((a, b) => b.amount.compare(a.amount));
  }
}

/**
 * Detector de desvíos: compara el gasto de cada categoría en el mes contra
 * su promedio móvil de los últimos 3 meses.
 */
export class MovingAverageDeviationDetector implements ISpendingInsightDetector {
  constructor(
    /** Desvío mínimo para alertar (2500 bps = +25%). */
    private readonly toleranceBps = 2_500,
    /** Diferencia mínima en unidades menores para evitar ruido en montos chicos. */
    private readonly minDifferenceMinor = 500_000n,
  ) {}

  detect(ctx: InsightContext): SpendingInsight[] {
    const months = [...ctx.previous.keys()];
    if (months.length === 0) return [];
    const zero = Money.zero(ctx.currency);

    const totalsBy = (records: readonly SpendingRecord[]) => {
      const map = new Map<string, Money>();
      for (const r of records) {
        if (!r.categoryId) continue;
        map.set(r.categoryId, (map.get(r.categoryId) ?? zero).add(r.amount));
      }
      return map;
    };
    const current = totalsBy(ctx.current);
    const previous = [...ctx.previous.values()].map(totalsBy);

    const insights: SpendingInsight[] = [];
    for (const [categoryId, amount] of current) {
      const sum = Money.sum(previous.map((p) => p.get(categoryId) ?? zero), ctx.currency);
      const avg = sum.multiplyByRatio(1n, BigInt(months.length));
      if (!avg.isPositive()) continue;
      const limit = avg.percentage(10_000 + this.toleranceBps);
      const diff = amount.subtract(avg);
      if (amount.greaterThan(limit) && diff.minor >= this.minDifferenceMinor) {
        const pct = Math.round(((amount.ratioInBasisPoints(avg) ?? 10_000) - 10_000) / 100);
        const name = ctx.categoryNames.get(categoryId) ?? "Sin categoría";
        insights.push({
          kind: "category_deviation",
          severity: pct >= 75 ? "critical" : "warning",
          title: `${name}: +${pct}% sobre tu promedio`,
          message: `Llevás ${amount.format()} vs. un promedio de ${avg.format()} (últimos ${months.length} meses).`,
          amount: diff,
          categoryId,
        });
      }
    }
    return insights.sort((a, b) => b.amount.compare(a.amount));
  }
}
