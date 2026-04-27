CREATE TABLE `auto_dms` (
	`id` text PRIMARY KEY NOT NULL,
	`party_seed` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`trigger_kind` text DEFAULT 'on_join' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`party_seed`) REFERENCES `parties`(`seed`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auto_dms_party_idx` ON `auto_dms` (`party_seed`);