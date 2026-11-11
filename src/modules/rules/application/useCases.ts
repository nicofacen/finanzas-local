import { DomainError, err, ok, type IIdGenerator, type Money, type Result } from "@/shared/domain";
import type { UseCase } from "@/shared/application/UseCase";
import type { ICategoryReader } from "@/modules/budgets/domain";
import type { ICategorySuggester } from "@/modules/transactions/application/ports";
import {
  CategorizationEngine,
  CategorizationRule,
  type IRuleReader,
  type IRuleWriter,
  type MatchMode,
  type RuleCondition,
} from "../domain";

/** Adaptador: el motor de reglas expuesto como el puerto que consume transactions. */
export class RuleBasedCategorySuggester implements ICategorySuggester {
  constructor(private readonly rules: IRuleReader) {}

  async suggest(input: { description: string; baseAmount: Money; accountId: string | null }) {
    const engine = new CategorizationEngine(await this.rules.findAll());
    const s = engine.suggest({
      description: input.description,
      baseAmountMinor: input.baseAmount.minor,
      accountId: input.accountId,
    });
    return s ? { categoryId: s.categoryId, description: s.description, ruleId: s.ruleId } : null;
  }
}

export interface RuleView {
  id: string;
  name: string;
  priority: number;
  matchMode: MatchMode;
  conditions: RuleCondition[];
  categoryId: string;
  categoryName: string;
  renameTo: string | null;
  active: boolean;
  explanation: string;
}

export interface CreateRuleInput {
  name: string;
  priority?: number;
  matchMode: MatchMode;
  conditions: RuleCondition[];
  categoryId: string;
  renameTo?: string | null;
}

export class CreateRuleUseCase implements UseCase<CreateRuleInput, { id: string }> {
  constructor(
    private readonly rules: IRuleReader & IRuleWriter,
    private readonly categories: ICategoryReader,
    private readonly ids: IIdGenerator,
  ) {}

  async execute(input: CreateRuleInput): Promise<Result<{ id: string }, DomainError>> {
    if (!(await this.categories.findById(input.categoryId))) return err(DomainError.notFound("Categoría", input.categoryId));
    const existing = await this.rules.findAll();
    const rule = CategorizationRule.create({
      id: this.ids.next(),
      name: input.name,
      priority: input.priority ?? (existing.length + 1) * 10,
      matchMode: input.matchMode,
      conditions: input.conditions,
      categoryId: input.categoryId,
      renameTo: input.renameTo ?? null,
      active: true,
    });
    if (!rule.ok) return rule;
    await this.rules.save(rule.value);
    return ok({ id: rule.value.id });
  }
}

export class ListRulesUseCase implements UseCase<void, RuleView[]> {
  constructor(
    private readonly rules: IRuleReader,
    private readonly categories: ICategoryReader,
  ) {}

  async execute() {
    const [rules, categories] = await Promise.all([this.rules.findAll(), this.categories.findAll({ includeArchived: true })]);
    const names = new Map(categories.map((c) => [c.id, c.name]));
    return ok(
      rules.map((r) => ({
        ...r.toSnapshot(),
        conditions: [...r.conditions],
        categoryName: names.get(r.categoryId) ?? "—",
        explanation: r.describe(),
      })),
    );
  }
}

export class ToggleRuleUseCase implements UseCase<{ id: string; active: boolean }, void> {
  constructor(private readonly rules: IRuleReader & IRuleWriter) {}
  async execute({ id, active }: { id: string; active: boolean }): Promise<Result<void, DomainError>> {
    const rule = await this.rules.findById(id);
    if (!rule) return err(DomainError.notFound("Regla", id));
    rule.toggle(active);
    await this.rules.save(rule);
    return ok(undefined);
  }
}

export class DeleteRuleUseCase implements UseCase<{ id: string }, void> {
  constructor(private readonly rules: IRuleWriter) {}
  async execute({ id }: { id: string }): Promise<Result<void, DomainError>> {
    await this.rules.delete(id);
    return ok(undefined);
  }
}

/** Prueba el motor con un texto libre ("¿qué categoría le asignaría a esto?"). */
export class TestRulesUseCase
  implements UseCase<{ description: string; amountMinor: bigint }, { categoryId: string; categoryName: string; ruleName: string; description: string } | null>
{
  constructor(
    private readonly rules: IRuleReader,
    private readonly categories: ICategoryReader,
  ) {}

  async execute({ description, amountMinor }: { description: string; amountMinor: bigint }) {
    const rules = await this.rules.findAll();
    const s = new CategorizationEngine(rules).suggest({ description, baseAmountMinor: -amountMinor, accountId: null });
    if (!s) return ok(null);
    const category = await this.categories.findById(s.categoryId);
    return ok({
      categoryId: s.categoryId,
      categoryName: category?.name ?? "—",
      ruleName: rules.find((r) => r.id === s.ruleId)?.name ?? "—",
      description: s.description,
    });
  }
}
