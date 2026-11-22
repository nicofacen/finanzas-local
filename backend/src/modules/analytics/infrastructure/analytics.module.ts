import type { CurrencyConversionService } from "@backend/modules/accounts/application/CurrencyConversionService";
import type { IAccountReader } from "@backend/modules/accounts/domain";
import type { ICategoryReader, IEnvelopeReader } from "@backend/modules/budgets/domain";
import type { SharedKernel } from "@backend/shared/infrastructure/di/SharedKernel";
import { GetDashboardUseCase } from "../application/GetDashboardUseCase";
import { AntExpenseDetector, MovingAverageDeviationDetector } from "../domain";
import { SqlAnalyticsReadModel } from "./SqlAnalyticsReadModel";

export function createAnalyticsModule(
  k: SharedKernel,
  deps: {
    accounts: IAccountReader;
    categories: ICategoryReader;
    envelopes: IEnvelopeReader;
    conversion: CurrencyConversionService;
  },
) {
  const readModel = new SqlAnalyticsReadModel(k.database.db, async () => (await k.settings.get()).baseCurrency);
  // OCP: agregar un detector nuevo = sumarlo a esta lista.
  const detectors = [new AntExpenseDetector(3), new MovingAverageDeviationDetector()];
  return {
    useCases: {
      getDashboard: new GetDashboardUseCase(
        readModel,
        deps.accounts,
        deps.categories,
        deps.envelopes,
        deps.conversion,
        k.settings,
        detectors,
        k.clock,
      ),
    },
  };
}

export type AnalyticsModule = ReturnType<typeof createAnalyticsModule>;
