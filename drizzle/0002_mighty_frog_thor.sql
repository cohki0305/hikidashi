CREATE TABLE `invite_links` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	CONSTRAINT "invite_links_key_hash_length" CHECK(length("invite_links"."key_hash") = 64),
	CONSTRAINT "invite_links_created_by_lower" CHECK("invite_links"."created_by" = lower("invite_links"."created_by")),
	CONSTRAINT "invite_links_expires_after_created" CHECK("invite_links"."expires_at" > "invite_links"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_links_key_hash_unique` ON `invite_links` (`key_hash`);--> statement-breakpoint
CREATE INDEX `invite_links_created_by_idx` ON `invite_links` (`created_by`);--> statement-breakpoint
CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`joined_at` text NOT NULL,
	`invite_link_id` text,
	`removed_at` text,
	`removed_by` text,
	FOREIGN KEY (`invite_link_id`) REFERENCES `invite_links`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "members_email_lower" CHECK("members"."email" = lower("members"."email")),
	CONSTRAINT "members_removed_by_lower" CHECK("members"."removed_by" is null or "members"."removed_by" = lower("members"."removed_by")),
	CONSTRAINT "members_removed_pair" CHECK(("members"."removed_at" is null) = ("members"."removed_by" is null))
);
--> statement-breakpoint
CREATE INDEX `members_invite_link_id_idx` ON `members` (`invite_link_id`);--> statement-breakpoint
UPDATE `oauth_grants` SET `email` = lower(`email`);--> statement-breakpoint
UPDATE `oauth_requests` SET `email` = lower(`email`);