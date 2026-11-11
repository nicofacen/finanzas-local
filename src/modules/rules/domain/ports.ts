import type { CategorizationRule } from "./CategorizationRule";

export interface IRuleReader {
  findAll(): Promise<CategorizationRule[]>;
  findById(id: string): Promise<CategorizationRule | null>;
}

export interface IRuleWriter {
  save(rule: CategorizationRule): Promise<void>;
  delete(id: string): Promise<void>;
}
