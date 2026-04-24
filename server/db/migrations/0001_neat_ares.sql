CREATE TABLE `player_positions` (
	`party_seed` text NOT NULL,
	`player_id` text NOT NULL,
	`area_id` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`set_at` integer NOT NULL,
	PRIMARY KEY(`party_seed`, `player_id`, `area_id`),
	FOREIGN KEY (`party_seed`) REFERENCES `parties`(`seed`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `zombies` (
	`id` text PRIMARY KEY NOT NULL,
	`party_seed` text NOT NULL,
	`area_id` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`spawned_at` integer NOT NULL,
	`npc_name` text,
	`npc_role` text,
	FOREIGN KEY (`party_seed`) REFERENCES `parties`(`seed`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `zombies_party_area_idx` ON `zombies` (`party_seed`,`area_id`);