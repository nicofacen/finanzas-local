import { and, desc, eq } from "drizzle-orm";
import { Currency, ExchangeRate, LocalDate } from "@/shared/domain";
import type { AppDatabase } from "@/shared/infrastructure/persistence/database";
import { exchangeRates } from "@/shared/infrastructure/persistence/schema";
import type { IExchangeRateReader, IExchangeRateWriter } from "../domain";

type Row = typeof exchangeRates.$inferSelect;

const toDomain = (r: Row) =>
  ExchangeRate.restore(
    Currency.fromCode(r.fromCurrency),
    Currency.fromCode(r.toCurrency),
    BigInt(r.scaledRate),
    LocalDate.fromISO(r.effectiveDate),
  );

export class DrizzleExchangeRateRepository implements IExchangeRateReader, IExchangeRateWriter {
  constructor(private readonly db: AppDatabase) {}

  async findLatestAll() {
    const rows = this.db
      .select()
      .from(exchangeRates)
      .orderBy(desc(exchangeRates.effectiveDate), desc(exchangeRates.id))
      .all();
    const seen = new Set<string>();
    const latest: ExchangeRate[] = [];
    for (const r of rows) {
      const key = `${r.fromCurrency}->${r.toCurrency}`;
      if (seen.has(key)) continue;
      seen.add(key);
      latest.push(toDomain(r));
    }
    return latest;
  }

  async history(currency: Currency, limit: number) {
    return this.db
      .select()
      .from(exchangeRates)
      .where(and(eq(exchangeRates.fromCurrency, currency.code)))
      .orderBy(desc(exchangeRates.effectiveDate), desc(exchangeRates.id))
      .limit(limit)
      .all()
      .map(toDomain);
  }

  async save(rate: ExchangeRate) {
    this.db
      .insert(exchangeRates)
      .values({
        fromCurrency: rate.from.code,
        toCurrency: rate.to.code,
        scaledRate: rate.scaledRate.toString(),
        effectiveDate: rate.effectiveDate.toISO(),
      })
      .run();
  }
}
