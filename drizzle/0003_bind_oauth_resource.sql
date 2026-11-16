ALTER TABLE `oauth_grants` ADD `resource` text;--> statement-breakpoint
CREATE INDEX `uploads_creator_expires_at_idx` ON `uploads` (`created_by`,`expires_at`);