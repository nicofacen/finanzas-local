import { asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/shared/infrastructure/persistence/database";
import { categorizationRules } from "@/shared/infrastructure/persistence/schema";
import { CategorizationRule, type IRuleReader, type IRuleWriter, type MatchMode, type RuleCondition } from "../domain";

export class DrizzleRuleRepository implements IRuleReader, IRuleWriter {
  constructor(private readonly db: AppDatabase) {}

  private toDomain(r: typeof categorizationRules.$inferSelect): CategorizationRule | null {
    const result = CategorizationRule.create({
      id: r.id,
      name: r.name,
      priority: r.priority,
      matchMode: (r.matchMode === "any" ? "any" : "all") as MatchMode,
      conditions: JSON.parse(r.conditions) as RuleCondition[],
      categoryId: r.categoryId,
      renameTo: r.renameTo,
      active: r.active,
    });
    return result.ok ? result.value : null; // una regla corrupta no rompe el motor
  }

  async findAll() {
    return this.db
      .select()
      .from(categorizationRules)
      .orderBy(asc(categorizationRules.priority), asc(categorizationRules.name))
      .all()
      .map((r) => this.toDomain(r))
      .filter((r): r is CategorizationRule => r !== null);
  }

  async findById(id: string) {
    const r = this.db.select().from(categorizationRules).where(eq(categorizationRules.id, id)).get();
    return r ? this.toDomain(r) : null;
  }

  async save(rule: CategorizationRule) {
    const s = rule.toSnapshot();
    const values = {
      id: s.id,
      name: s.name,
      priority: s.priority,
      matchMode: s.matchMode,
      conditions: JSON.stringify(s.conditions),
      categoryId: s.categoryId,
      renameTo: s.renameTo,
      active: s.active,
    };
    this.db.insert(categorizationRules).values(values).onConflictDoUpdate({ target: categorizationRules.id, set: values }).run();
  }

  async delete(id: string) {
    this.db.delete(categorizationRules).where(eq(categorizationRules.id, id)).run();
  }
}
