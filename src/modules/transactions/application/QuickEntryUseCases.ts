import { Currency, DomainError, Money, err, ok, type IClock, type Result } from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import type { CurrencyConversionService } from "@/modules/accounts/application/CurrencyConversionService";
import type { Account, IAccountReader } from "@/modules/accounts/domain";
import type { ICategoryReader } from "@/modules/budgets/domain";
import { QuickEntryParser, type ParsedQuickEntry } from "../domain";
import type { CreateInstallmentPurchaseUseCase } from "./CreateInstallmentPurchaseUseCase";
import type { ICategorySuggester } from "./ports";
import type { RecordExpenseUseCase, RecordIncomeUseCase } from "./RecordMovementUseCases";

export interface QuickEntryInput {
  text: string;
  defaultAccountId?: string | null;
}

export interface QuickEntryInterpretation {
  kind: "expense" | "income" | "installments";
  amountFormatted: string;
  /** Monto en la moneda de la cuenta (decimal canónico). */
  amount: string;
  description: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySource: "text" | "rule" | null;
  installments: number | null;
  date: string;
  note: string | null;
}

/**
 * Interpreta el texto de la barra Ctrl+K resolviendo cuenta por defecto,
 * conversión de moneda y categoría (nombre explícito o motor de reglas).
 */
class QuickEntryInterpreter {
  private readonly parser = new QuickEntryParser();

  constructor(
    private readonly accounts: IAccountReader,
    private readonly categories: ICategoryReader,
    private readonly suggester: ICategorySuggester,
    private readonly conversion: CurrencyConversionService,
    private readonly clock: IClock,
  ) {}

  async interpret(input: QuickEntryInput): Promise<Result<QuickEntryInterpretation, DomainError>> {
    const [accounts, categories] = await Promise.all([this.accounts.findAll(), this.categories.findAll()]);
    if (accounts.length === 0) return err(DomainError.validation("Primero creá una cuenta"));

    const parsed = this.parser.parse(input.text, { accounts, categories, today: this.clock.today() });
    if (!parsed.ok) return parsed;
    const p = parsed.value;

    const account = this.resolveAccount(p, accounts, input.defaultAccountId ?? null);
    const converter = await this.conversion.converter();

    // Monto: si el usuario escribió otra moneda, se convierte a la de la cuenta.
    let note: string | null = null;
    const typedCurrency = p.currencyCode ? Currency.fromCode(p.currencyCode) : account.currency;
    const typed = Money.fromDecimal(p.amount, typedCurrency);
    if (!typed.ok) return typed;
    let amount = typed.value;
    if (!typedCurrency.equals(account.currency)) {
      const converted = converter.convert(typed.value, account.currency);
      if (!converted.ok) return converted;
      amount = converted.value;
      note = `${typed.value.format({ showCode: true })} convertidos a ${account.currency.code} con el tipo de cambio cargado`;
    }

    if (p.installments && p.installments > 1 && !account.isCreditCard) {
      return err(DomainError.validation(`Las cuotas sólo aplican a tarjetas; "${account.name}" no es una tarjeta`));
    }

    let categoryId = p.categoryId;
    let categoryName = p.categoryName;
    let description = p.description;
    let categorySource: QuickEntryInterpretation["categorySource"] = categoryId ? "text" : null;
    if (!categoryId) {
      const base = converter.toBaseCurrency(amount);
      if (base.ok) {
        const s = await this.suggester.suggest({
          description,
          baseAmount: p.kind === "expense" ? base.value.negate() : base.value,
          accountId: account.id,
        });
        if (s) {
          categoryId = s.categoryId;
          categoryName = categories.find((c) => c.id === s.categoryId)?.name ?? null;
          description = s.description;
          categorySource = "rule";
        }
      }
    }

    return ok({
      kind: p.kind === "income" ? "income" : p.installments && p.installments > 1 ? "installments" : "expense",
      amountFormatted: amount.format(),
      amount: amount.toDecimalString(),
      description,
      accountId: account.id,
      accountName: account.name,
      categoryId,
      categoryName,
      categorySource,
      installments: p.installments,
      date: p.date.toISO(),
      note,
    });
  }

  private resolveAccount(p: ParsedQuickEntry, accounts: Account[], defaultId: string | null): Account {
    return (
      accounts.find((a) => a.id === p.accountId) ??
      accounts.find((a) => a.id === defaultId) ??
      accounts.find((a) => !a.isCreditCard && a.type !== "investment") ??
      accounts[0]
    );
  }
}

export class PreviewQuickEntryUseCase implements UseCase<QuickEntryInput, QuickEntryInterpretation> {
  constructor(private readonly interpreter: QuickEntryInterpreter) {}
  execute(input: QuickEntryInput) {
    return this.interpreter.interpret(input);
  }
}

/** Carga rápida: interpreta y delega en el caso de uso adecuado (sin duplicar reglas). */
export class QuickEntryUseCase implements UseCase<QuickEntryInput, QuickEntryInterpretation & { id: string }> {
  constructor(
    private readonly interpreter: QuickEntryInterpreter,
    private readonly recordExpense: RecordExpenseUseCase,
    private readonly recordIncome: RecordIncomeUseCase,
    private readonly createInstallments: CreateInstallmentPurchaseUseCase,
  ) {}

  async execute(input: QuickEntryInput): Promise<Result<QuickEntryInterpretation & { id: string }, DomainError>> {
    const interpreted = await this.interpreter.interpret(input);
    if (!interpreted.ok) return interpreted;
    const q = interpreted.value;

    if (q.kind === "installments") {
      const r = await this.createInstallments.execute({
        accountId: q.accountId,
        total: q.amount,
        installments: q.installments!,
        description: q.description,
        categoryId: q.categoryId,
        purchaseDate: q.date,
      });
      return r.ok ? ok({ ...q, id: r.value.purchaseId }) : r;
    }
    const useCase = q.kind === "income" ? this.recordIncome : this.recordExpense;
    const r = await useCase.execute({
      accountId: q.accountId,
      amount: q.amount,
      date: q.date,
      description: q.description,
      categoryId: q.categoryId,
      autoCategorize: false,
    });
    return r.ok ? ok({ ...q, id: r.value.transactionId }) : r;
  }
}

export { QuickEntryInterpreter };
