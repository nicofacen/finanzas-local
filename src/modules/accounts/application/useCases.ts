import {
  Currency,
  DomainError,
  ExchangeRate,
  LocalDate,
  Money,
  err,
  ok,
  type IClock,
  type IIdGenerator,
  type ISettingsReader,
  type Result,
} from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import { toMoneyView, type MoneyView } from "@/shared/application/views";
import {
  ACCOUNT_TYPE_POLICIES,
  Account,
  type AccountType,
  type IAccountReader,
  type IAccountRepository,
  type IExchangeRateReader,
  type IExchangeRateWriter,
} from "../domain";
import type { CurrencyConversionService } from "./CurrencyConversionService";

// ─────────────── DTOs ───────────────

export interface AccountView {
  id: string;
  name: string;
  type: AccountType;
  typeLabel: string;
  currency: string;
  balance: MoneyView;
  /** Saldo en moneda base (null si falta tipo de cambio). */
  baseBalance: MoneyView | null;
  creditLimit: MoneyView | null;
  available: MoneyView;
  closingDay: number | null;
  aliases: string[];
  isLiability: boolean;
}

export interface ExchangeRateView {
  from: string;
  to: string;
  rate: string;
  effectiveDate: string;
}

// ─────────────── Crear cuenta ───────────────

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: string;
  creditLimit?: string | null;
  closingDay?: number | null;
  aliases?: string[];
}

export class CreateAccountUseCase implements UseCase<CreateAccountInput, { id: string }> {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly ids: IIdGenerator,
    private readonly clock: IClock,
  ) {}

  async execute(input: CreateAccountInput): Promise<Result<{ id: string }, DomainError>> {
    const currency = Currency.of(input.currency);
    if (!currency.ok) return currency;
    const opening = Money.fromDecimal(input.openingBalance || "0", currency.value);
    if (!opening.ok) return opening;
    let creditLimit: Money | null = null;
    if (input.creditLimit) {
      const cl = Money.fromDecimal(input.creditLimit, currency.value);
      if (!cl.ok) return cl;
      creditLimit = cl.value;
    }
    const existing = await this.accounts.findAll();
    if (existing.some((a) => a.name.toLowerCase() === input.name.trim().toLowerCase())) {
      return err(DomainError.conflict(`Ya existe una cuenta llamada "${input.name.trim()}"`));
    }
    const account = Account.open({
      id: this.ids.next(),
      name: input.name,
      type: input.type,
      currency: currency.value,
      // Las tarjetas se cargan con la deuda como saldo negativo.
      openingBalance: input.type === "credit_card" ? opening.value.abs().negate() : opening.value,
      creditLimit,
      closingDay: input.closingDay ?? null,
      aliases: input.aliases,
      createdAt: this.clock.nowISO(),
    });
    if (!account.ok) return account;
    await this.accounts.save(account.value);
    return ok({ id: account.value.id });
  }
}

// ─────────────── Listar cuentas ───────────────

export class ListAccountsUseCase implements UseCase<void, AccountView[]> {
  constructor(
    private readonly accounts: IAccountReader,
    private readonly conversion: CurrencyConversionService,
  ) {}

  async execute(): Promise<Result<AccountView[], DomainError>> {
    const [accounts, converter] = await Promise.all([this.accounts.findAll(), this.conversion.converter()]);
    return ok(
      accounts.map((a) => {
        const base = converter.toBaseCurrency(a.balance);
        return {
          id: a.id,
          name: a.name,
          type: a.type,
          typeLabel: ACCOUNT_TYPE_POLICIES[a.type].label,
          currency: a.currency.code,
          balance: toMoneyView(a.balance),
          baseBalance: base.ok ? toMoneyView(base.value) : null,
          creditLimit: a.creditLimit ? toMoneyView(a.creditLimit) : null,
          available: toMoneyView(a.availableToSpend()),
          closingDay: a.closingDay,
          aliases: [...a.aliases],
          isLiability: a.isLiability,
        };
      }),
    );
  }
}

// ─────────────── Tipos de cambio ───────────────

export interface SetExchangeRateInput {
  currency: string;
  rate: string;
  effectiveDate?: string;
}

export class SetExchangeRateUseCase implements UseCase<SetExchangeRateInput, ExchangeRateView> {
  constructor(
    private readonly rates: IExchangeRateWriter,
    private readonly settings: ISettingsReader,
    private readonly clock: IClock,
  ) {}

  async execute(input: SetExchangeRateInput): Promise<Result<ExchangeRateView, DomainError>> {
    const currency = Currency.of(input.currency);
    if (!currency.ok) return currency;
    const { baseCurrency } = await this.settings.get();
    const date = input.effectiveDate ? LocalDate.parse(input.effectiveDate) : ok(this.clock.today());
    if (!date.ok) return date;
    const rate = ExchangeRate.create(currency.value, baseCurrency, input.rate, date.value);
    if (!rate.ok) return rate;
    await this.rates.save(rate.value);
    return ok(toRateView(rate.value));
  }
}

export class ListExchangeRatesUseCase implements UseCase<void, ExchangeRateView[]> {
  constructor(private readonly rates: IExchangeRateReader) {}
  async execute() {
    return ok((await this.rates.findLatestAll()).map(toRateView));
  }
}

function toRateView(r: ExchangeRate): ExchangeRateView {
  return { from: r.from.code, to: r.to.code, rate: r.rateAsDecimalString(), effectiveDate: r.effectiveDate.toISO() };
}
