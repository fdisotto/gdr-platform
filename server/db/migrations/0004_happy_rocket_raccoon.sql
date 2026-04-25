CREATE TABLE `admin_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`superadmin_id` text NOT NULL,
	`action` text NOT NULL,
	`target_kind` text,
	`target_id` text,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`superadmin_id`) REFERENCES `superadmins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_actions_time_idx` ON `admin_actions` (`created_at`);--> statement-breakpoint
CREATE INDEX `admin_actions_actor_idx` ON `admin_actions` (`superadmin_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `daily_metrics` (
	`date` text PRIMARY KEY NOT NULL,
	`users_total` integer NOT NULL,
	`users_approved` integer NOT NULL,
	`users_pending` integer NOT NULL,
	`users_banned` integer NOT NULL,
	`parties_total` integer NOT NULL,
	`parties_active` integer NOT NULL,
	`parties_archived` integer NOT NULL,
	`messages_new` integer NOT NULL,
	`auth_login_success` integer NOT NULL,
	`auth_login_failed` integer NOT NULL,
	`computed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
ALTER TABLE `superadmins` ADD `revoked_at` integer;--> statement-breakpoint
ALTER TABLE `superadmins` ADD `revoked_by` text;--> statement-breakpoint
-- v2c: seed default system_settings (idempotente via OR IGNORE).
-- updatedBy = NULL = settato dal sistema al boot iniziale.
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('limits.maxPartiesPerUser', '5', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('limits.maxMembersPerParty', '30', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('limits.maxTotalParties', '100', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('limits.partyInactivityArchiveDays', '30', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('limits.inviteTtlDays', '7', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('limits.loginRateMaxFailures', '5', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('limits.loginRateWindowMinutes', '15', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('limits.registerRateMaxPerHour', '3', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('features.registrationEnabled', 'true', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('features.partyCreationEnabled', 'true', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('features.voiceChatEnabled', 'true', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('system.maintenanceMode', 'false', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('system.maintenanceMessage', '"Manutenzione in corso. Torniamo presto."', 0, NULL);