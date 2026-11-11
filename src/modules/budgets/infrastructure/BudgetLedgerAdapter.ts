import { Money, type YearMonth } from "@/shared/domain";
import type { IBudgetLedgerPort } from "@/modules/transactions/domain";
import { BudgetEnvelope, type ICategoryReader, type IEnvelopeReader, type IEnvelopeWriter } from "../domain";

/**
 * Adaptador que implementa el puerto IBudgetLedgerPort (definido por transactions)
 * usando el modelo de sobres de budgets. Así transactions no conoce sobres ni tablas.
 */
export class BudgetLedgerAdapter implements IBudgetLedgerPort {
  constructor(
    private readonly envelopes: IEnvelopeReader & IEnvelopeWriter,
    private readonly categories: ICategoryReader,
  ) {}

  async recordActivity(categoryId: string, month: YearMonth, delta: Money): Promise<void> {
    const category = await this.categories.findById(categoryId);
    if (!category || !category.hasEnvelope) return; // las categorías de ingreso no tienen sobre

    const record = await this.envelopes.find(categoryId, month);
    const envelope = BudgetEnvelope.projectFromHistory(categoryId, record ? [record] : [], month, delta.currency);
    envelope.recordActivity(delta);
    await this.envelopes.save(envelope.toRecord());
  }
}
