import type { SharedKernel } from "@/shared/infrastructure/di/SharedKernel";
import { CurrencyConversionService } from "../application/CurrencyConversionService";
import {
  CreateAccountUseCase,
  ListAccountsUseCase,
  ListExchangeRatesUseCase,
  SetExchangeRateUseCase,
} from "../application/useCases";
import { DrizzleAccountRepository } from "./DrizzleAccountRepository";
import { DrizzleExchangeRateRepository } from "./DrizzleExchangeRateRepository";

/** Fábrica del módulo: ensambla repositorios (adaptadores) y casos de uso. */
export function createAccountsModule(k: SharedKernel) {
  const accountRepository = new DrizzleAccountRepository(k.database.db);
  const rateRepository = new DrizzleExchangeRateRepository(k.database.db);
  const conversion = new CurrencyConversionService(k.settings, rateRepository);

  return {
    /** Puertos publicados para otros módulos (sólo interfaces). */
    ports: { accountRepository, conversion },
    useCases: {
      createAccount: new CreateAccountUseCase(accountRepository, k.ids, k.clock),
      listAccounts: new ListAccountsUseCase(accountRepository, conversion),
      setExchangeRate: new SetExchangeRateUseCase(rateRepository, k.settings, k.clock),
      listExchangeRates: new ListExchangeRatesUseCase(rateRepository),
    },
  };
}

export type AccountsModule = ReturnType<typeof createAccountsModule>;
