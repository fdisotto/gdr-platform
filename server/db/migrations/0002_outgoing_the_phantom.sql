-- v2a clean break: azzera tutti i dati MVP prima di introdurre auth.
-- Questo permette poi di aggiungere players.user_id NOT NULL senza valori
-- mancanti sulle righe esistenti.
DELETE FROM `zombies`;--> statement-breakpoint
DELETE FROM `player_positions`;--> statement-breakpoint
DELETE FROM `master_actions`;--> statement-breakpoint
DELETE FROM `bans`;--> statement-breakpoint
DELETE FROM `area_access_bans`;--> statement-breakpoint
DELETE FROM `weather_overrides`;--> statement-breakpoint
DELETE FROM `messages`;--> statement-breakpoint
DELETE FROM `areas_state`;--> statement-breakpoint
DELETE FROM `players`;--> statement-breakpoint
DELETE FROM `parties`;--> statement-breakpoint
CREATE TABLE `auth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_id` text,
	`username_attempted` text,
	`event` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_events_time_idx` ON `auth_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `auth_events_actor_idx` ON `auth_events` (`actor_kind`,`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`superadmin_id` text,
	`created_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ip` text,
	`user_agent` text,
	CHECK (
	  (`user_id` IS NOT NULL AND `superadmin_id` IS NULL) OR
	  (`user_id` IS NULL AND `superadmin_id` IS NOT NULL)
	),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`superadmin_id`) REFERENCES `superadmins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_superadmin_idx` ON `sessions` (`superadmin_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `superadmins` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`username_lower` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_reset` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `superadmins_username_lower_unique` ON `superadmins` (`username_lower`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`username_lower` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_reset` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`approved_at` integer,
	`approved_by` text,
	`banned_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_lower_unique` ON `users` (`username_lower`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);--> statement-breakpoint
ALTER TABLE `players` ADD `user_id` text NOT NULL REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `players_party_user_unique` ON `players` (`party_seed`,`user_id`);