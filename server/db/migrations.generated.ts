// GENERATO DA scripts/bundle-migrations.ts — NON modificare a mano.
// Contiene il contenuto di ogni file .sql in server/db/migrations/ come
// stringa, così Nitro lo bundla direttamente nel server di produzione
// (dove la cartella migrations/ NON viene copiata).

export interface BundledMigration {
  hash: string
  sql: string
}

export const MIGRATIONS: BundledMigration[] = [
  {
    hash: '0000_foamy_blue_shield',
    sql: `CREATE TABLE \`area_access_bans\` (
	\`party_seed\` text NOT NULL,
	\`area_id\` text NOT NULL,
	\`reason\` text,
	PRIMARY KEY(\`party_seed\`, \`area_id\`),
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE \`areas_state\` (
	\`party_seed\` text NOT NULL,
	\`area_id\` text NOT NULL,
	\`status\` text NOT NULL,
	\`custom_name\` text,
	\`notes\` text,
	PRIMARY KEY(\`party_seed\`, \`area_id\`),
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE \`bans\` (
	\`party_seed\` text NOT NULL,
	\`nickname_lower\` text NOT NULL,
	\`reason\` text,
	\`banned_at\` integer NOT NULL,
	PRIMARY KEY(\`party_seed\`, \`nickname_lower\`),
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE \`master_actions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`party_seed\` text NOT NULL,
	\`master_id\` text NOT NULL,
	\`action\` text NOT NULL,
	\`target\` text,
	\`payload\` text,
	\`created_at\` integer NOT NULL,
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`master_actions_time_idx\` ON \`master_actions\` (\`party_seed\`,\`created_at\`);--> statement-breakpoint
CREATE TABLE \`messages\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`party_seed\` text NOT NULL,
	\`kind\` text NOT NULL,
	\`author_player_id\` text,
	\`author_display\` text NOT NULL,
	\`area_id\` text,
	\`target_player_id\` text,
	\`body\` text NOT NULL,
	\`roll_payload\` text,
	\`created_at\` integer NOT NULL,
	\`deleted_at\` integer,
	\`deleted_by\` text,
	\`edited_at\` integer,
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`messages_area_time_idx\` ON \`messages\` (\`party_seed\`,\`area_id\`,\`created_at\`);--> statement-breakpoint
CREATE INDEX \`messages_target_time_idx\` ON \`messages\` (\`party_seed\`,\`target_player_id\`,\`created_at\`);--> statement-breakpoint
CREATE TABLE \`parties\` (
	\`seed\` text PRIMARY KEY NOT NULL,
	\`master_token_hash\` text NOT NULL,
	\`city_name\` text NOT NULL,
	\`created_at\` integer NOT NULL,
	\`last_activity_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`players\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`party_seed\` text NOT NULL,
	\`nickname\` text NOT NULL,
	\`role\` text NOT NULL,
	\`current_area_id\` text NOT NULL,
	\`is_muted\` integer DEFAULT false NOT NULL,
	\`muted_until\` integer,
	\`is_kicked\` integer DEFAULT false NOT NULL,
	\`joined_at\` integer NOT NULL,
	\`last_seen_at\` integer NOT NULL,
	\`session_token\` text NOT NULL,
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`players_party_nickname_unique\` ON \`players\` (\`party_seed\`,\`nickname\`);--> statement-breakpoint
CREATE INDEX \`players_session_idx\` ON \`players\` (\`session_token\`);--> statement-breakpoint
CREATE TABLE \`weather_overrides\` (
	\`party_seed\` text NOT NULL,
	\`area_id\` text,
	\`code\` text NOT NULL,
	\`intensity\` real NOT NULL,
	\`set_at\` integer NOT NULL,
	\`expires_at\` integer,
	PRIMARY KEY(\`party_seed\`, \`area_id\`),
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade
);
`
  },
  {
    hash: '0001_neat_ares',
    sql: `CREATE TABLE \`player_positions\` (
	\`party_seed\` text NOT NULL,
	\`player_id\` text NOT NULL,
	\`area_id\` text NOT NULL,
	\`x\` real NOT NULL,
	\`y\` real NOT NULL,
	\`set_at\` integer NOT NULL,
	PRIMARY KEY(\`party_seed\`, \`player_id\`, \`area_id\`),
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE \`zombies\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`party_seed\` text NOT NULL,
	\`area_id\` text NOT NULL,
	\`x\` real NOT NULL,
	\`y\` real NOT NULL,
	\`spawned_at\` integer NOT NULL,
	\`npc_name\` text,
	\`npc_role\` text,
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`zombies_party_area_idx\` ON \`zombies\` (\`party_seed\`,\`area_id\`);`
  },
  {
    hash: '0002_outgoing_the_phantom',
    sql: `-- v2a clean break: azzera tutti i dati MVP prima di introdurre auth.
-- Questo permette poi di aggiungere players.user_id NOT NULL senza valori
-- mancanti sulle righe esistenti.
DELETE FROM \`zombies\`;--> statement-breakpoint
DELETE FROM \`player_positions\`;--> statement-breakpoint
DELETE FROM \`master_actions\`;--> statement-breakpoint
DELETE FROM \`bans\`;--> statement-breakpoint
DELETE FROM \`area_access_bans\`;--> statement-breakpoint
DELETE FROM \`weather_overrides\`;--> statement-breakpoint
DELETE FROM \`messages\`;--> statement-breakpoint
DELETE FROM \`areas_state\`;--> statement-breakpoint
DELETE FROM \`players\`;--> statement-breakpoint
DELETE FROM \`parties\`;--> statement-breakpoint
CREATE TABLE \`auth_events\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`actor_kind\` text NOT NULL,
	\`actor_id\` text,
	\`username_attempted\` text,
	\`event\` text NOT NULL,
	\`ip\` text,
	\`user_agent\` text,
	\`detail\` text,
	\`created_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX \`auth_events_time_idx\` ON \`auth_events\` (\`created_at\`);--> statement-breakpoint
CREATE INDEX \`auth_events_actor_idx\` ON \`auth_events\` (\`actor_kind\`,\`actor_id\`,\`created_at\`);--> statement-breakpoint
CREATE TABLE \`sessions\` (
	\`token\` text PRIMARY KEY NOT NULL,
	\`user_id\` text,
	\`superadmin_id\` text,
	\`created_at\` integer NOT NULL,
	\`last_activity_at\` integer NOT NULL,
	\`expires_at\` integer NOT NULL,
	\`ip\` text,
	\`user_agent\` text,
	CHECK (
	  (\`user_id\` IS NOT NULL AND \`superadmin_id\` IS NULL) OR
	  (\`user_id\` IS NULL AND \`superadmin_id\` IS NOT NULL)
	),
	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`superadmin_id\`) REFERENCES \`superadmins\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`sessions_user_idx\` ON \`sessions\` (\`user_id\`);--> statement-breakpoint
CREATE INDEX \`sessions_superadmin_idx\` ON \`sessions\` (\`superadmin_id\`);--> statement-breakpoint
CREATE INDEX \`sessions_expires_idx\` ON \`sessions\` (\`expires_at\`);--> statement-breakpoint
CREATE TABLE \`superadmins\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`username\` text NOT NULL,
	\`username_lower\` text NOT NULL,
	\`password_hash\` text NOT NULL,
	\`must_reset\` integer DEFAULT false NOT NULL,
	\`created_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`superadmins_username_lower_unique\` ON \`superadmins\` (\`username_lower\`);--> statement-breakpoint
CREATE TABLE \`users\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`username\` text NOT NULL,
	\`username_lower\` text NOT NULL,
	\`password_hash\` text NOT NULL,
	\`must_reset\` integer DEFAULT false NOT NULL,
	\`status\` text NOT NULL,
	\`created_at\` integer NOT NULL,
	\`approved_at\` integer,
	\`approved_by\` text,
	\`banned_reason\` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`users_username_lower_unique\` ON \`users\` (\`username_lower\`);--> statement-breakpoint
CREATE INDEX \`users_status_idx\` ON \`users\` (\`status\`);--> statement-breakpoint
ALTER TABLE \`players\` ADD \`user_id\` text NOT NULL REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX \`players_party_user_unique\` ON \`players\` (\`party_seed\`,\`user_id\`);`
  },
  {
    hash: '0003_omniscient_wallow',
    sql: `CREATE TABLE \`party_invites\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`party_seed\` text NOT NULL,
	\`token\` text NOT NULL,
	\`created_by\` text NOT NULL,
	\`created_at\` integer NOT NULL,
	\`expires_at\` integer NOT NULL,
	\`used_at\` integer,
	\`used_by\` text,
	\`revoked_at\` integer,
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`used_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`party_invites_token_unique\` ON \`party_invites\` (\`token\`);--> statement-breakpoint
CREATE INDEX \`party_invites_party_idx\` ON \`party_invites\` (\`party_seed\`);--> statement-breakpoint
CREATE INDEX \`party_invites_token_idx\` ON \`party_invites\` (\`token\`);--> statement-breakpoint
CREATE TABLE \`party_join_requests\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`party_seed\` text NOT NULL,
	\`user_id\` text NOT NULL,
	\`display_name\` text NOT NULL,
	\`message\` text,
	\`created_at\` integer NOT NULL,
	\`status\` text NOT NULL,
	\`resolved_at\` integer,
	\`resolved_by\` text,
	\`reject_reason\` text,
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`resolved_by\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`party_join_requests_party_user_status\` ON \`party_join_requests\` (\`party_seed\`,\`user_id\`,\`status\`);--> statement-breakpoint
CREATE INDEX \`party_join_requests_status_idx\` ON \`party_join_requests\` (\`party_seed\`,\`status\`);--> statement-breakpoint
ALTER TABLE \`parties\` ADD \`visibility\` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE \`parties\` ADD \`join_policy\` text DEFAULT 'request' NOT NULL;--> statement-breakpoint
ALTER TABLE \`parties\` ADD \`archived_at\` integer;--> statement-breakpoint
ALTER TABLE \`players\` ADD \`left_at\` integer;`
  },
  {
    hash: '0004_happy_rocket_raccoon',
    sql: `CREATE TABLE \`admin_actions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`superadmin_id\` text NOT NULL,
	\`action\` text NOT NULL,
	\`target_kind\` text,
	\`target_id\` text,
	\`payload\` text,
	\`created_at\` integer NOT NULL,
	FOREIGN KEY (\`superadmin_id\`) REFERENCES \`superadmins\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`admin_actions_time_idx\` ON \`admin_actions\` (\`created_at\`);--> statement-breakpoint
CREATE INDEX \`admin_actions_actor_idx\` ON \`admin_actions\` (\`superadmin_id\`,\`created_at\`);--> statement-breakpoint
CREATE TABLE \`daily_metrics\` (
	\`date\` text PRIMARY KEY NOT NULL,
	\`users_total\` integer NOT NULL,
	\`users_approved\` integer NOT NULL,
	\`users_pending\` integer NOT NULL,
	\`users_banned\` integer NOT NULL,
	\`parties_total\` integer NOT NULL,
	\`parties_active\` integer NOT NULL,
	\`parties_archived\` integer NOT NULL,
	\`messages_new\` integer NOT NULL,
	\`auth_login_success\` integer NOT NULL,
	\`auth_login_failed\` integer NOT NULL,
	\`computed_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`system_settings\` (
	\`key\` text PRIMARY KEY NOT NULL,
	\`value\` text NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`updated_by\` text
);
--> statement-breakpoint
ALTER TABLE \`superadmins\` ADD \`revoked_at\` integer;--> statement-breakpoint
ALTER TABLE \`superadmins\` ADD \`revoked_by\` text;--> statement-breakpoint
-- v2c: seed default system_settings (idempotente via OR IGNORE).
-- updatedBy = NULL = settato dal sistema al boot iniziale.
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('limits.maxPartiesPerUser', '5', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('limits.maxMembersPerParty', '30', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('limits.maxTotalParties', '100', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('limits.partyInactivityArchiveDays', '30', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('limits.inviteTtlDays', '7', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('limits.loginRateMaxFailures', '5', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('limits.loginRateWindowMinutes', '15', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('limits.registerRateMaxPerHour', '3', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('features.registrationEnabled', 'true', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('features.partyCreationEnabled', 'true', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('features.voiceChatEnabled', 'true', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('system.maintenanceMode', 'false', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('system.maintenanceMessage', '"Manutenzione in corso. Torniamo presto."', 0, NULL);`
  },
  {
    hash: '0005_brown_killmonger',
    sql: `-- v2d clean break: azzera tutte le tabelle party-scoped e introduce
-- map_types, party_maps, map_transitions. Le colonne map_id su tabelle
-- esistenti sono NULLABLE in 0005 perché i service pre-multimap inseriscono
-- ancora senza mapId; T16 (services area-scoped) adegua i service e una
-- migration 0006 stringe a NOT NULL + estende le PK composte con map_id.
-- La sequenza è:
--   1) DELETE FROM su tutto ciò che è party-scoped (e dipendente).
--   2) CREATE delle nuove tabelle map_types / party_maps / map_transitions.
--   3) ALTER TABLE per aggiungere map_id (nullable) alle tabelle esistenti.
--   4) Seed map_types (3 righe) + system_settings (3 righe).
DELETE FROM \`party_join_requests\`;--> statement-breakpoint
DELETE FROM \`party_invites\`;--> statement-breakpoint
DELETE FROM \`player_positions\`;--> statement-breakpoint
DELETE FROM \`zombies\`;--> statement-breakpoint
DELETE FROM \`bans\`;--> statement-breakpoint
DELETE FROM \`master_actions\`;--> statement-breakpoint
DELETE FROM \`weather_overrides\`;--> statement-breakpoint
DELETE FROM \`area_access_bans\`;--> statement-breakpoint
DELETE FROM \`messages\`;--> statement-breakpoint
DELETE FROM \`areas_state\`;--> statement-breakpoint
DELETE FROM \`players\`;--> statement-breakpoint
DELETE FROM \`parties\`;--> statement-breakpoint
CREATE TABLE \`map_types\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`description\` text NOT NULL,
	\`default_params\` text NOT NULL,
	\`area_count_min\` integer NOT NULL,
	\`area_count_max\` integer NOT NULL,
	\`enabled\` integer DEFAULT true NOT NULL,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`party_maps\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`party_seed\` text NOT NULL,
	\`map_type_id\` text NOT NULL,
	\`map_seed\` text NOT NULL,
	\`name\` text NOT NULL,
	\`is_spawn\` integer DEFAULT false NOT NULL,
	\`created_at\` integer NOT NULL,
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade,
	-- v2d: map_types è catalogo soft-deletato via enabled=false; mai hard delete.
	-- onDelete=restrict garantisce esplicitamente che eliminare un map_type referenziato fallisca.
	FOREIGN KEY (\`map_type_id\`) REFERENCES \`map_types\`(\`id\`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX \`party_maps_party_idx\` ON \`party_maps\` (\`party_seed\`);--> statement-breakpoint
CREATE TABLE \`map_transitions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`party_seed\` text NOT NULL,
	\`from_map_id\` text NOT NULL,
	\`from_area_id\` text NOT NULL,
	\`to_map_id\` text NOT NULL,
	\`to_area_id\` text NOT NULL,
	\`label\` text,
	\`created_at\` integer NOT NULL,
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`from_map_id\`) REFERENCES \`party_maps\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`to_map_id\`) REFERENCES \`party_maps\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`map_transitions_from_idx\` ON \`map_transitions\` (\`from_map_id\`,\`from_area_id\`);--> statement-breakpoint
CREATE INDEX \`map_transitions_party_idx\` ON \`map_transitions\` (\`party_seed\`);--> statement-breakpoint
-- ALTER TABLE … ADD COLUMN nullable per le tabelle esistenti. SQLite non
-- enforce gli FK aggiunti via ALTER (la dichiarazione FK vive solo nel
-- CREATE TABLE), quindi il riferimento party_maps(id) per current_map_id
-- è solo a livello di tipi drizzle; runtime FK enforcement non esiste su
-- colonne aggiunte via ALTER. Sufficiente per T1, T16 ricostruirà.
ALTER TABLE \`areas_state\` ADD \`map_id\` text;--> statement-breakpoint
ALTER TABLE \`area_access_bans\` ADD \`map_id\` text;--> statement-breakpoint
ALTER TABLE \`weather_overrides\` ADD \`map_id\` text;--> statement-breakpoint
ALTER TABLE \`player_positions\` ADD \`map_id\` text;--> statement-breakpoint
ALTER TABLE \`messages\` ADD \`map_id\` text;--> statement-breakpoint
ALTER TABLE \`players\` ADD \`current_map_id\` text;--> statement-breakpoint
ALTER TABLE \`zombies\` ADD \`map_id\` text;--> statement-breakpoint
-- v2d: seed map_types (idempotente). updatedBy/timestamps = 0 = sistema.
INSERT OR IGNORE INTO \`map_types\` (\`id\`, \`name\`, \`description\`, \`default_params\`, \`area_count_min\`, \`area_count_max\`, \`enabled\`, \`created_at\`, \`updated_at\`) VALUES ('city', 'Città', 'Tessuto urbano denso', '{"density":0.5,"roadStyle":"grid"}', 10, 15, 1, 0, 0);--> statement-breakpoint
INSERT OR IGNORE INTO \`map_types\` (\`id\`, \`name\`, \`description\`, \`default_params\`, \`area_count_min\`, \`area_count_max\`, \`enabled\`, \`created_at\`, \`updated_at\`) VALUES ('country', 'Campagna', 'Aree aperte e zone agricole', '{"forestRatio":0.4,"riverChance":0.6}', 6, 10, 1, 0, 0);--> statement-breakpoint
INSERT OR IGNORE INTO \`map_types\` (\`id\`, \`name\`, \`description\`, \`default_params\`, \`area_count_min\`, \`area_count_max\`, \`enabled\`, \`created_at\`, \`updated_at\`) VALUES ('wasteland', 'Lande', 'Distese desolate post-apocalittiche', '{"ruinRatio":0.5,"craterCount":2}', 6, 12, 1, 0, 0);--> statement-breakpoint
-- v2d: seed system_settings (JSON-quoted dove serve string parsata da getSettingString).
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('limits.maxMapsPerParty', '10', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('features.renderEngine', '"pixi"', 0, NULL);--> statement-breakpoint
INSERT OR IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`updated_at\`, \`updated_by\`) VALUES ('features.mapTransitionsEnabled', 'true', 0, NULL);
`
  },
  {
    hash: '0006_keen_elektra',
    sql: `-- v2d-edit: tabella area_overrides per la customizzazione master delle
-- mappe (rinomina, sposta, aggiungi, rimuovi aree). drizzle-kit aveva
-- generato anche il rebuild di party_maps/weather_overrides per
-- normalizzazione interna (no-op funzionale) — rimossi a mano per non
-- introdurre table-recreate non necessari su DB esistenti.
CREATE TABLE \`area_overrides\` (
	\`party_seed\` text NOT NULL,
	\`map_id\` text NOT NULL,
	\`area_id\` text NOT NULL,
	\`custom_name\` text,
	\`x\` real,
	\`y\` real,
	\`w\` real,
	\`h\` real,
	\`removed\` integer DEFAULT false NOT NULL,
	\`custom_added\` integer DEFAULT false NOT NULL,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	PRIMARY KEY(\`party_seed\`, \`map_id\`, \`area_id\`),
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`map_id\`) REFERENCES \`party_maps\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`area_overrides_map_idx\` ON \`area_overrides\` (\`party_seed\`,\`map_id\`);
`
  },
  {
    hash: '0007_demonic_lockheed',
    sql: `CREATE TABLE \`area_adjacency_overrides\` (
	\`party_seed\` text NOT NULL,
	\`map_id\` text NOT NULL,
	\`area_a\` text NOT NULL,
	\`area_b\` text NOT NULL,
	\`kind\` text NOT NULL,
	\`created_at\` integer NOT NULL,
	PRIMARY KEY(\`party_seed\`, \`map_id\`, \`area_a\`, \`area_b\`),
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`map_id\`) REFERENCES \`party_maps\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`area_adjacency_overrides_map_idx\` ON \`area_adjacency_overrides\` (\`party_seed\`,\`map_id\`);`
  },
  {
    hash: '0008_premium_jetstream',
    sql: `CREATE TABLE \`area_visits\` (
	\`party_seed\` text NOT NULL,
	\`map_id\` text NOT NULL,
	\`area_id\` text NOT NULL,
	\`first_visited_by\` text,
	\`first_visited_at\` integer NOT NULL,
	PRIMARY KEY(\`party_seed\`, \`map_id\`, \`area_id\`),
	FOREIGN KEY (\`party_seed\`) REFERENCES \`parties\`(\`seed\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`map_id\`) REFERENCES \`party_maps\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`area_visits_map_idx\` ON \`area_visits\` (\`party_seed\`,\`map_id\`);`
  },
  {
    hash: '0009_solid_guardian',
    sql: `ALTER TABLE \`area_adjacency_overrides\` ADD \`road_kind\` text;`
  },
  {
    hash: '0010_glossy_thunderbolts',
    sql: `ALTER TABLE \`parties\` ADD \`fog_enabled\` integer DEFAULT true NOT NULL;`
  }
]
