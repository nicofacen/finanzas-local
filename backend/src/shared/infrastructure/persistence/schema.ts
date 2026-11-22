import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Esquema SQLite local. Los montos se guardan como ENTEROS en unidades menores
 * (centavos) + código de moneda: nunca REAL/float.
 */

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  currency: text("currency").notNull(),
  balanceMinor: integer("balance_minor").notNull(),
  creditLimitMinor: integer("credit_limit_minor"),
  closingDay: integer("closing_day"),
  aliases: text("aliases").notNull().default("[]"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fromCurrency: text("from_currency").notNull(),
    toCurrency: text("to_currency").notNull(),
    /** rate × 10^8 como texto (bigint exacto). */
    scaledRate: text("scaled_rate").notNull(),
    effectiveDate: text("effective_date").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("exchange_rates_pair_idx").on(t.fromCurrency, t.toCurrency, t.effectiveDate)],
);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  groupName: text("group_name").notNull(),
  kind: text("kind").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    date: text("date").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    baseAmountMinor: integer("base_amount_minor").notNull(),
    baseCurrency: text("base_currency").notNull(),
    description: text("description").notNull(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    transferGroupId: text("transfer_group_id"),
    purchaseId: text("purchase_id"),
    subscriptionId: text("subscription_id"),
    importHash: text("import_hash"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("transactions_date_idx").on(t.date),
    index("transactions_account_idx").on(t.accountId),
    index("transactions_category_idx").on(t.categoryId),
    uniqueIndex("transactions_import_hash_idx").on(t.importHash),
  ],
);

export const creditCardPurchases = sqliteTable("credit_card_purchases", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  description: text("description").notNull(),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  purchaseDate: text("purchase_date").notNull(),
  currency: text("currency").notNull(),
  baseCurrency: text("base_currency").notNull(),
  installmentsCount: integer("installments_count").notNull(),
});

export const installments = sqliteTable(
  "installments",
  {
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => creditCardPurchases.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    dueMonth: text("due_month").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    baseAmountMinor: integer("base_amount_minor").notNull(),
  },
  (t) => [primaryKey({ columns: [t.purchaseId, t.number] }), index("installments_due_idx").on(t.dueMonth)],
);

export const budgetEnvelopes = sqliteTable(
  "budget_envelopes",
  {
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    assignedMinor: integer("assigned_minor").notNull().default(0),
    activityMinor: integer("activity_minor").notNull().default(0),
    currency: text("currency").notNull(),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.month] })],
);

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  billingDay: integer("billing_day").notNull(),
  startMonth: text("start_month").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const subscriptionPayments = sqliteTable(
  "subscription_payments",
  {
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    transactionId: text("transaction_id").notNull(),
    paidOn: text("paid_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.subscriptionId, t.month] })],
);

export const savingsGoals = sqliteTable("savings_goals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  targetMinor: integer("target_minor").notNull(),
  savedMinor: integer("saved_minor").notNull(),
  monthlyContributionMinor: integer("monthly_contribution_minor").notNull(),
  targetMonth: text("target_month"),
});

export const categorizationRules = sqliteTable("categorization_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  priority: integer("priority").notNull(),
  matchMode: text("match_mode").notNull(),
  /** JSON: RuleCondition[] */
  conditions: text("conditions").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  renameTo: text("rename_to"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/** Orden de tablas respetando claves foráneas (para backup/restore y limpieza). */
export const TABLES_IN_DEPENDENCY_ORDER = [
  ["settings", settings],
  ["accounts", accounts],
  ["exchange_rates", exchangeRates],
  ["categories", categories],
  ["transactions", transactions],
  ["credit_card_purchases", creditCardPurchases],
  ["installments", installments],
  ["budget_envelopes", budgetEnvelopes],
  ["subscriptions", subscriptions],
  ["subscription_payments", subscriptionPayments],
  ["savings_goals", savingsGoals],
  ["categorization_rules", categorizationRules],
] as const;
