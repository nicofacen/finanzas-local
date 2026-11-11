import { DomainError, Money, err, ok, type IUnitOfWork, type Result } from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import { toMoneyView, type MoneyView } from "@/shared/application/views";
import type { CurrencyConversionService } from "@/modules/accounts/application/CurrencyConversionService";
import type { Account, IAccountReader } from "@/modules/accounts/domain";
import { importFingerprint, type ICsvParserRegistry, type ITransactionReader, type StatementLine } from "../domain";
import type { ICategorySuggester } from "./ports";
import type { RecordExpenseUseCase, RecordIncomeUseCase } from "./RecordMovementUseCases";

export interface StatementInput {
  accountId: string;
  adapterId: string;
  content: string;
}

export interface PreviewLine {
  index: number;
  date: string;
  originalDescription: string;
  description: string;
  amount: MoneyView;
  kind: "expense" | "income";
  suggestedCategoryId: string | null;
  ruleId: string | null;
  duplicate: boolean;
  fingerprint: string;
}

interface AnalyzedLine extends PreviewLine {
  money: Money;
}

/** Lógica común de análisis (parseo + huellas + duplicados + sugerencias). */
class StatementAnalyzer {
  constructor(
    private readonly accounts: IAccountReader,
    private readonly registry: ICsvParserRegistry,
    private readonly transactions: ITransactionReader,
    private readonly suggester: ICategorySuggester,
    private readonly conversion: CurrencyConversionService,
  ) {}

  async analyze(input: StatementInput): Promise<Result<{ account: Account; lines: AnalyzedLine[] }, DomainError>> {
    const account = await this.accounts.findById(input.accountId);
    if (!account) return err(DomainError.notFound("Cuenta", input.accountId));
    const adapter = this.registry.get(input.adapterId);
    if (!adapter) return err(DomainError.validation(`Formato de importación desconocido: ${input.adapterId}`));

    const parsed = adapter.parse(input.content);
    if (!parsed.ok) return parsed;
    if (parsed.value.length > 5000) return err(DomainError.validation("Máximo 5000 movimientos por importación"));

    const converter = await this.conversion.converter();
    const occurrences = new Map<string, number>();
    const lines: AnalyzedLine[] = [];

    for (const [index, line] of parsed.value.entries()) {
      const money = Money.fromDecimal(line.amount, account.currency);
      if (!money.ok) return money;
      const fingerprint = this.fingerprint(account.id, line, money.value, occurrences);
      const base = converter.toBaseCurrency(money.value);
      if (!base.ok) return base;
      const suggestion = await this.suggester.suggest({
        description: line.description,
        baseAmount: base.value,
        accountId: account.id,
      });
      lines.push({
        index,
        date: line.date.toISO(),
        originalDescription: line.description,
        description: suggestion?.description ?? line.description,
        amount: toMoneyView(money.value),
        money: money.value,
        kind: money.value.isNegative() ? "expense" : "income",
        suggestedCategoryId: suggestion?.categoryId ?? null,
        ruleId: suggestion?.ruleId ?? null,
        duplicate: false,
        fingerprint,
      });
    }

    const existing = await this.transactions.existingImportHashes(lines.map((l) => l.fingerprint));
    for (const l of lines) l.duplicate = existing.has(l.fingerprint);
    return ok({ account, lines });
  }

  private fingerprint(accountId: string, line: StatementLine, money: Money, occurrences: Map<string, number>) {
    const key = `${line.date.toISO()}|${money.minor}|${line.description}`;
    const n = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, n);
    return importFingerprint(accountId, line.date, money, line.description, n);
  }
}

export class PreviewBankStatementUseCase implements UseCase<StatementInput, PreviewLine[]> {
  constructor(private readonly analyzer: StatementAnalyzer) {}

  async execute(input: StatementInput): Promise<Result<PreviewLine[], DomainError>> {
    const r = await this.analyzer.analyze(input);
    if (!r.ok) return r;
    return ok(r.value.lines.map(({ money: _money, ...view }) => view));
  }
}

export interface ImportStatementInput extends StatementInput {
  /** Categoría elegida por el usuario en la vista previa (índice → categoría). */
  categoryOverrides?: Record<number, string | null>;
  /** Índices a excluir. */
  excluded?: number[];
}

/**
 * Importa un extracto completo de forma ATÓMICA: si una línea falla
 * (ej. saldo insuficiente), no se importa ninguna.
 */
export class ImportBankStatementUseCase implements UseCase<ImportStatementInput, { imported: number; skipped: number }> {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly analyzer: StatementAnalyzer,
    private readonly recordExpense: RecordExpenseUseCase,
    private readonly recordIncome: RecordIncomeUseCase,
  ) {}

  execute(input: ImportStatementInput): Promise<Result<{ imported: number; skipped: number }, DomainError>> {
    return this.uow.transaction(async () => {
      const analyzed = await this.analyzer.analyze(input);
      if (!analyzed.ok) return analyzed;
      const excluded = new Set(input.excluded ?? []);
      let imported = 0;
      let skipped = 0;

      const ordered = [...analyzed.value.lines].sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
      for (const line of ordered) {
        if (line.duplicate || excluded.has(line.index)) {
          skipped++;
          continue;
        }
        const override = input.categoryOverrides?.[line.index];
        const useCase = line.kind === "expense" ? this.recordExpense : this.recordIncome;
        const r = await useCase.execute({
          accountId: analyzed.value.account.id,
          amount: line.money.abs().toDecimalString(),
          date: line.date,
          description: line.description,
          categoryId: override !== undefined ? override : line.suggestedCategoryId,
          importHash: line.fingerprint,
          autoCategorize: false,
        });
        if (!r.ok) {
          return err(new DomainError(r.error.code, `Línea ${line.index + 1} (${line.date} ${line.originalDescription}): ${r.error.message}`));
        }
        imported++;
      }
      return ok({ imported, skipped });
    });
  }
}

export { StatementAnalyzer };
