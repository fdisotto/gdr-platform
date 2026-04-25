-- v2d clean break: azzera tutte le tabelle party-scoped e introduce
-- map_types, party_maps, map_transitions. Le colonne map_id su tabelle
-- esistenti sono NULLABLE in 0005 perché i service pre-multimap inseriscono
-- ancora senza mapId; T16 (services area-scoped) adegua i service e una
-- migration 0006 stringe a NOT NULL + estende le PK composte con map_id.
-- La sequenza è:
--   1) DELETE FROM su tutto ciò che è party-scoped (e dipendente).
--   2) CREATE delle nuove tabelle map_types / party_maps / map_transitions.
--   3) ALTER TABLE per aggiungere map_id (nullable) alle tabelle esistenti.
--   4) Seed map_types (3 righe) + system_settings (3 righe).
DELETE FROM `party_join_requests`;--> statement-breakpoint
DELETE FROM `party_invites`;--> statement-breakpoint
DELETE FROM `player_positions`;--> statement-breakpoint
DELETE FROM `zombies`;--> statement-breakpoint
DELETE FROM `bans`;--> statement-breakpoint
DELETE FROM `master_actions`;--> statement-breakpoint
DELETE FROM `weather_overrides`;--> statement-breakpoint
DELETE FROM `area_access_bans`;--> statement-breakpoint
DELETE FROM `messages`;--> statement-breakpoint
DELETE FROM `areas_state`;--> statement-breakpoint
DELETE FROM `players`;--> statement-breakpoint
DELETE FROM `parties`;--> statement-breakpoint
CREATE TABLE `map_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`default_params` text NOT NULL,
	`area_count_min` integer NOT NULL,
	`area_count_max` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `party_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`party_seed` text NOT NULL,
	`map_type_id` text NOT NULL,
	`map_seed` text NOT NULL,
	`name` text NOT NULL,
	`is_spawn` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`party_seed`) REFERENCES `parties`(`seed`) ON UPDATE no action ON DELETE cascade,
	-- v2d: map_types è catalogo soft-deletato via enabled=false; mai hard delete.
	-- onDelete=restrict garantisce esplicitamente che eliminare un map_type referenziato fallisca.
	FOREIGN KEY (`map_type_id`) REFERENCES `map_types`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `party_maps_party_idx` ON `party_maps` (`party_seed`);--> statement-breakpoint
CREATE TABLE `map_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`party_seed` text NOT NULL,
	`from_map_id` text NOT NULL,
	`from_area_id` text NOT NULL,
	`to_map_id` text NOT NULL,
	`to_area_id` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`party_seed`) REFERENCES `parties`(`seed`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_map_id`) REFERENCES `party_maps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_map_id`) REFERENCES `party_maps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_transitions_from_idx` ON `map_transitions` (`from_map_id`,`from_area_id`);--> statement-breakpoint
CREATE INDEX `map_transitions_party_idx` ON `map_transitions` (`party_seed`);--> statement-breakpoint
-- ALTER TABLE … ADD COLUMN nullable per le tabelle esistenti. SQLite non
-- enforce gli FK aggiunti via ALTER (la dichiarazione FK vive solo nel
-- CREATE TABLE), quindi il riferimento party_maps(id) per current_map_id
-- è solo a livello di tipi drizzle; runtime FK enforcement non esiste su
-- colonne aggiunte via ALTER. Sufficiente per T1, T16 ricostruirà.
ALTER TABLE `areas_state` ADD `map_id` text;--> statement-breakpoint
ALTER TABLE `area_access_bans` ADD `map_id` text;--> statement-breakpoint
ALTER TABLE `weather_overrides` ADD `map_id` text;--> statement-breakpoint
ALTER TABLE `player_positions` ADD `map_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `map_id` text;--> statement-breakpoint
ALTER TABLE `players` ADD `current_map_id` text;--> statement-breakpoint
ALTER TABLE `zombies` ADD `map_id` text;--> statement-breakpoint
-- v2d: seed map_types (idempotente). updatedBy/timestamps = 0 = sistema.
INSERT OR IGNORE INTO `map_types` (`id`, `name`, `description`, `default_params`, `area_count_min`, `area_count_max`, `enabled`, `created_at`, `updated_at`) VALUES ('city', 'Città', 'Tessuto urbano denso', '{"density":0.5,"roadStyle":"grid"}', 10, 15, 1, 0, 0);--> statement-breakpoint
INSERT OR IGNORE INTO `map_types` (`id`, `name`, `description`, `default_params`, `area_count_min`, `area_count_max`, `enabled`, `created_at`, `updated_at`) VALUES ('country', 'Campagna', 'Aree aperte e zone agricole', '{"forestRatio":0.4,"riverChance":0.6}', 6, 10, 1, 0, 0);--> statement-breakpoint
INSERT OR IGNORE INTO `map_types` (`id`, `name`, `description`, `default_params`, `area_count_min`, `area_count_max`, `enabled`, `created_at`, `updated_at`) VALUES ('wasteland', 'Lande', 'Distese desolate post-apocalittiche', '{"ruinRatio":0.5,"craterCount":2}', 6, 12, 1, 0, 0);--> statement-breakpoint
-- v2d: seed system_settings (JSON-quoted dove serve string parsata da getSettingString).
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('limits.maxMapsPerParty', '10', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('features.renderEngine', '"pixi"', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO `system_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES ('features.mapTransitionsEnabled', 'true', 0, NULL);
