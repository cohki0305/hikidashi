CREATE TABLE `oauth_access_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_access_tokens_grant_id_idx` ON `oauth_access_tokens` (`grant_id`);--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`client_name` text NOT NULL,
	`redirect_uris` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "oauth_clients_client_name_length" CHECK(length("oauth_clients"."client_name") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE `oauth_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`client_id` text NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`refresh_expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_grants_refresh_token_hash_unique` ON `oauth_grants` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `oauth_grants_email_idx` ON `oauth_grants` (`email`);--> statement-breakpoint
CREATE TABLE `oauth_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`state` text,
	`code_challenge` text NOT NULL,
	`resource` text,
	`expires_at` text NOT NULL,
	`email` text,
	`code_hash` text,
	`used_at` text,
	`denied_at` text,
	`grant_id` text,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_requests_code_hash_unique` ON `oauth_requests` (`code_hash`);--> statement-breakpoint
CREATE INDEX `oauth_requests_expires_at_idx` ON `oauth_requests` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_used_refresh_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`used_at` text NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_used_refresh_tokens_grant_id_idx` ON `oauth_used_refresh_tokens` (`grant_id`);