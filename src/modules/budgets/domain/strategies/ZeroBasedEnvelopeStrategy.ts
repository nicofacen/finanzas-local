import { Money } from "@/shared/domain";
import {
  daysRemainingIn,
  type BudgetSnapshot,
  type BudgetSummary,
  type IBudgetingStrategy,
  type SummaryLine,
} from "./IBudgetingStrategy";

/**
 * Presupuesto base cero por sobres (YNAB / Actual Budget):
 * "Dale un trabajo a cada peso". Listo para asignar =
 *   ingresos acumulados − asignaciones acumuladas − sobregiros absorbidos.
 */
export class ZeroBasedEnvelopeStrategy implements IBudgetingStrategy {
  readonly id = "zero-based" as const;
  readonly name = "Base cero por sobres";

  calculate(s: BudgetSnapshot): BudgetSummary {
    const zero = Money.zero(s.currency);
    const envelopes = s.envelopes.filter((l) => l.category.hasEnvelope);

    const absorbed = Money.sum(envelopes.map((l) => l.envelope.absorbedOverspending), s.currency);
    const readyToAssign = s.cumulativeIncome.subtract(s.cumulativeAssigned).add(absorbed);

    const assignedThisMonth = Money.sum(envelopes.map((l) => l.envelope.assigned), s.currency);
    const activityThisMonth = Money.sum(envelopes.map((l) => l.envelope.activity), s.currency);
    const available = Money.sum(envelopes.map((l) => l.envelope.available()), s.currency);
    const overspent = envelopes.filter((l) => l.envelope.isOverspent());
    const overspentTotal = Money.sum(overspent.map((l) => l.envelope.available()), s.currency);

    const variableAvailable = Money.sum(
      envelopes.filter((l) => l.category.kind === "variable").map((l) => l.envelope.available().max(zero)),
      s.currency,
    );
    const daysRemaining = daysRemainingIn(s.month, s.today);
    const dailyAllowance =
      daysRemaining > 0 ? variableAvailable.multiplyByRatio(1n, BigInt(daysRemaining), "DOWN") : null;

    const warnings: string[] = [];
    if (readyToAssign.isNegative()) {
      warnings.push(`Asignaste ${readyToAssign.abs().format()} más de lo que tenés. Quitá dinero de algún sobre.`);
    }
    for (const l of overspent) {
      warnings.push(`El sobre "${l.category.name}" está sobregirado en ${l.envelope.available().abs().format()}.`);
    }

    const lines: SummaryLine[] = [
      { label: "Ingresos del mes", amount: s.incomeThisMonth, tone: "positive" },
      { label: "Asignado este mes", amount: assignedThisMonth, tone: "neutral" },
      { label: "Actividad (gastos)", amount: activityThisMonth, tone: activityThisMonth.isNegative() ? "negative" : "neutral" },
      { label: "Disponible en sobres", amount: available, tone: available.isNegative() ? "negative" : "positive" },
    ];
    if (!overspentTotal.isZero()) lines.push({ label: "Sobregirado", amount: overspentTotal, tone: "negative" });

    return {
      methodology: this.id,
      title: this.name,
      headline: {
        label: "Listo para asignar",
        amount: readyToAssign,
        tone: readyToAssign.isNegative() ? "negative" : readyToAssign.isZero() ? "positive" : "warning",
        hint: readyToAssign.isZero() ? "Cada peso tiene un trabajo 🎯" : "Asigná este dinero a tus sobres",
      },
      dailyAllowance,
      daysRemaining,
      lines,
      warnings,
    };
  }
}
