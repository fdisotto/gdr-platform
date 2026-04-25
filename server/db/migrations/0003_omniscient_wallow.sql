CREATE TABLE `party_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`party_seed` text NOT NULL,
	`token` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`used_by` text,
	`revoked_at` integer,
	FOREIGN KEY (`party_seed`) REFERENCES `parties`(`seed`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `party_invites_token_unique` ON `party_invites` (`token`);--> statement-breakpoint
CREATE INDEX `party_invites_party_idx` ON `party_invites` (`party_seed`);--> statement-breakpoint
CREATE INDEX `party_invites_token_idx` ON `party_invites` (`token`);--> statement-breakpoint
CREATE TABLE `party_join_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`party_seed` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`message` text,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	`reject_reason` text,
	FOREIGN KEY (`party_seed`) REFERENCES `parties`(`seed`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `party_join_requests_party_user_status` ON `party_join_requests` (`party_seed`,`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `party_join_requests_status_idx` ON `party_join_requests` (`party_seed`,`status`);--> statement-breakpoint
ALTER TABLE `parties` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `parties` ADD `join_policy` text DEFAULT 'request' NOT NULL;--> statement-breakpoint
ALTER TABLE `parties` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `players` ADD `left_at` integer;