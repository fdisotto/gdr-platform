-- v2d-edit: tabella area_overrides per la customizzazione master delle
-- mappe (rinomina, sposta, aggiungi, rimuovi aree). drizzle-kit aveva
-- generato anche il rebuild di party_maps/weather_overrides per
-- normalizzazione interna (no-op funzionale) — rimossi a mano per non
-- introdurre table-recreate non necessari su DB esistenti.
CREATE TABLE `area_overrides` (
	`party_seed` text NOT NULL,
	`map_id` text NOT NULL,
	`area_id` text NOT NULL,
	`custom_name` text,
	`x` real,
	`y` real,
	`w` real,
	`h` real,
	`removed` integer DEFAULT false NOT NULL,
	`custom_added` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`party_seed`, `map_id`, `area_id`),
	FOREIGN KEY (`party_seed`) REFERENCES `parties`(`seed`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`map_id`) REFERENCES `party_maps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `area_overrides_map_idx` ON `area_overrides` (`party_seed`,`map_id`);
