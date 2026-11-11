import { asc, eq } from "drizzle-orm";
import { Currency } from "@/shared/domain";
import type { AppDatabase } from "@/shared/infrastructure/persistence/database";
import { toMinor, toMoney } from "@/shared/infrastructure/persistence/mappers";
import { accounts } from "@/shared/infrastructure/persistence/schema";
import { Account, isAccountType, type IAccountRepository } from "../domain";

type Row = typeof accounts.$inferSelect;

function toDomain(row: Row): Account {
  if (!isAccountType(row.type)) throw new Error(`Tipo de cuenta desconocido en la base: ${row.type}`);
  return Account.restore({
    id: row.id,
    name: row.name,
    type: row.type,
    currency: Currency.fromCode(row.currency),
    balance: toMoney(row.balanceMinor, row.currency),
    creditLimit: row.creditLimitMinor === null ? null : toMoney(row.creditLimitMinor, row.currency),
    closingDay: row.closingDay,
    aliases: JSON.parse(row.aliases) as string[],
    archived: row.archived,
    createdAt: row.createdAt,
  });
}

export class DrizzleAccountRepository implements IAccountRepository {
  constructor(private readonly db: AppDatabase) {}

  async findById(id: string) {
    const row = this.db.select().from(accounts).where(eq(accounts.id, id)).get();
    return row ? toDomain(row) : null;
  }

  async findAll(options: { includeArchived?: boolean } = {}) {
    const rows = this.db.select().from(accounts).orderBy(asc(accounts.createdAt), asc(accounts.name)).all();
    return rows.filter((r) => options.includeArchived || !r.archived).map(toDomain);
  }

  async save(account: Account) {
    const s = account.toSnapshot();
    const values = {
      id: s.id,
      name: s.name,
      type: s.type,
      currency: s.currency.code,
      balanceMinor: toMinor(s.balance),
      creditLimitMinor: s.creditLimit ? toMinor(s.creditLimit) : null,
      closingDay: s.closingDay,
      aliases: JSON.stringify(s.aliases),
      archived: s.archived,
      createdAt: s.createdAt,
    };
    this.db.insert(accounts).values(values).onConflictDoUpdate({ target: accounts.id, set: values }).run();
  }
}
