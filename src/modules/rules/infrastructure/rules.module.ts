import type { ICategoryReader } from "@/modules/budgets/domain";
import type { SharedKernel } from "@/shared/infrastructure/di/SharedKernel";
import {
  CreateRuleUseCase,
  DeleteRuleUseCase,
  ListRulesUseCase,
  RuleBasedCategorySuggester,
  TestRulesUseCase,
  ToggleRuleUseCase,
} from "../application/useCases";
import { DrizzleRuleRepository } from "./DrizzleRuleRepository";

export function createRulesModule(k: SharedKernel, deps: { categories: ICategoryReader }) {
  const rules = new DrizzleRuleRepository(k.database.db);
  return {
    ports: { suggester: new RuleBasedCategorySuggester(rules) },
    useCases: {
      createRule: new CreateRuleUseCase(rules, deps.categories, k.ids),
      listRules: new ListRulesUseCase(rules, deps.categories),
      toggleRule: new ToggleRuleUseCase(rules),
      deleteRule: new DeleteRuleUseCase(rules),
      testRules: new TestRulesUseCase(rules, deps.categories),
    },
  };
}

export type RulesModule = ReturnType<typeof createRulesModule>;
