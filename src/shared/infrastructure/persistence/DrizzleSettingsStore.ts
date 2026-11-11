import {
  Currency,
  type AppSettings,
  type BudgetMethodology,
  type ISettingsReader,
  type ISettingsWriter,
} from "@/shared/domain";
import type { AppDatabase } from "./database";
import { settings } from "./schema";

const DEFAULTS = { baseCurrency: "ARS", budgetMethodology: "zero-based", antExpenseThresholdMinor: "500000" };

export class DrizzleSettingsStore implements ISettingsReader, ISettingsWriter {
  constructor(private readonly db: AppDatabase) {}

  async get(): Promise<AppSettings> {
    const rows = this.db.select().from(settings).all();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const methodology = (map.get("budgetMethodology") ?? DEFAULTS.budgetMethodology) as BudgetMethodology;
    return {
      baseCurrency: Currency.fromCode(map.get("baseCurrency") ?? DEFAULTS.baseCurrency),
      budgetMethodology: methodology === "safe-to-spend" ? "safe-to-spend" : "zero-based",
      antExpenseThresholdMinor: BigInt(map.get("antExpenseThresholdMinor") ?? DEFAULTS.antExpenseThresholdMinor),
    };
  }

  async update(patch: Partial<AppSettings>): Promise<void> {
    const entries: [string, string][] = [];
    if (patch.baseCurrency) entries.push(["baseCurrency", patch.baseCurrency.code]);
    if (patch.budgetMethodology) entries.push(["budgetMethodology", patch.budgetMethodology]);
    if (patch.antExpenseThresholdMinor !== undefined) {
      entries.push(["antExpenseThresholdMinor", patch.antExpenseThresholdMinor.toString()]);
    }
    for (const [key, value] of entries) {
      this.db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
    }
  }
}
