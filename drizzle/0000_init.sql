CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`balance_minor` integer NOT NULL,
	`credit_limit_minor` integer,
	`closing_day` integer,
	`aliases` text DEFAULT '[]' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budget_envelopes` (
	`category_id` text NOT NULL,
	`month` text NOT NULL,
	`assigned_minor` integer DEFAULT 0 NOT NULL,
	`activity_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	PRIMARY KEY(`category_id`, `month`),
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`group_name` text NOT NULL,
	`kind` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categorization_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`priority` integer NOT NULL,
	`match_mode` text NOT NULL,
	`conditions` text NOT NULL,
	`category_id` text NOT NULL,
	`rename_to` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `credit_card_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`description` text NOT NULL,
	`category_id` text,
	`purchase_date` text NOT NULL,
	`currency` text NOT NULL,
	`base_currency` text NOT NULL,
	`installments_count` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_currency` text NOT NULL,
	`to_currency` text NOT NULL,
	`scaled_rate` text NOT NULL,
	`effective_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exchange_rates_pair_idx` ON `exchange_rates` (`from_currency`,`to_currency`,`effective_date`);--> statement-breakpoint
CREATE TABLE `installments` (
	`purchase_id` text NOT NULL,
	`number` integer NOT NULL,
	`due_month` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`base_amount_minor` integer NOT NULL,
	PRIMARY KEY(`purchase_id`, `number`),
	FOREIGN KEY (`purchase_id`) REFERENCES `credit_card_purchases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `installments_due_idx` ON `installments` (`due_month`);--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`target_minor` integer NOT NULL,
	`saved_minor` integer NOT NULL,
	`monthly_contribution_minor` integer NOT NULL,
	`target_month` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscription_payments` (
	`subscription_id` text NOT NULL,
	`month` text NOT NULL,
	`transaction_id` text NOT NULL,
	`paid_on` text NOT NULL,
	PRIMARY KEY(`subscription_id`, `month`),
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`billing_day` integer NOT NULL,
	`start_month` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`base_amount_minor` integer NOT NULL,
	`base_currency` text NOT NULL,
	`description` text NOT NULL,
	`category_id` text,
	`kind` text NOT NULL,
	`transfer_group_id` text,
	`purchase_id` text,
	`subscription_id` text,
	`import_hash` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_account_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_import_hash_idx` ON `transactions` (`import_hash`);