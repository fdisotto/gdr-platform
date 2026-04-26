CREATE TABLE `area_adjacency_overrides` (
	`party_seed` text NOT NULL,
	`map_id` text NOT NULL,
	`area_a` text NOT NULL,
	`area_b` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`party_seed`, `map_id`, `area_a`, `area_b`),
	FOREIGN KEY (`party_seed`) REFERENCES `parties`(`seed`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`map_id`) REFERENCES `party_maps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `area_adjacency_overrides_map_idx` ON `area_adjacency_overrides` (`party_seed`,`map_id`);