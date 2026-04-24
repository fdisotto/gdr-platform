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
  }
]
