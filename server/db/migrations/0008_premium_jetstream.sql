CREATE TABLE `area_visits` (
	`party_seed` text NOT NULL,
	`map_id` text NOT NULL,
	`area_id` text NOT NULL,
	`first_visited_by` text,
	`first_visited_at` integer NOT NULL,
	PRIMARY KEY(`party_seed`, `map_id`, `area_id`),
	FOREIGN KEY (`party_seed`) REFERENCES `parties`(`seed`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`map_id`) REFERENCES `party_maps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `area_visits_map_idx` ON `area_visits` (`party_seed`,`map_id`);