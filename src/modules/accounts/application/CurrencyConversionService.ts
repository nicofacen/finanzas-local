import { CurrencyConverter, type ISettingsReader } from "@/shared/domain";
import type { IExchangeRateReader } from "../domain";

/**
 * Servicio de aplicación: arma un CurrencyConverter con la moneda base
 * configurada y los últimos tipos de cambio manuales.
 */
export class CurrencyConversionService {
  constructor(
    private readonly settings: ISettingsReader,
    private readonly rates: IExchangeRateReader,
  ) {}

  async converter(): Promise<CurrencyConverter> {
    const [{ baseCurrency }, rates] = await Promise.all([this.settings.get(), this.rates.findLatestAll()]);
    return new CurrencyConverter(baseCurrency, rates);
  }
}
