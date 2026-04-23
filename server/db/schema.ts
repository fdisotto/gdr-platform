import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const parties = sqliteTable('parties', {
  seed:            text('seed').primaryKey(),
  masterTokenHash: text('master_token_hash').notNull(),
  cityName:        text('city_name').notNull(),
  createdAt:       integer('created_at').notNull(),
  lastActivityAt:  integer('last_activity_at').notNull()
})

export const players = sqliteTable('players', {
  id:             text('id').primaryKey(),
  partySeed:      text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  nickname:       text('nickname').notNull(),
  role:           text('role', { enum: ['user', 'master'] }).notNull(),
  currentAreaId:  text('current_area_id').notNull(),
  isMuted:        integer('is_muted', { mode: 'boolean' }).notNull().default(false),
  mutedUntil:     integer('muted_until'),
  isKicked:       integer('is_kicked', { mode: 'boolean' }).notNull().default(false),
  joinedAt:       integer('joined_at').notNull(),
  lastSeenAt:     integer('last_seen_at').notNull(),
  sessionToken:   text('session_token').notNull()
}, (t) => [
  uniqueIndex('players_party_nickname_unique').on(t.partySeed, t.nickname),
  index('players_session_idx').on(t.sessionToken)
])

export const areasState = sqliteTable('areas_state', {
  partySeed:   text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  areaId:      text('area_id').notNull(),
  status:      text('status', { enum: ['intact', 'infested', 'ruined', 'closed'] }).notNull(),
  customName:  text('custom_name'),
  notes:       text('notes')
}, (t) => [
  primaryKey({ columns: [t.partySeed, t.areaId] })
])

export const messages = sqliteTable('messages', {
  id:             text('id').primaryKey(),
  partySeed:      text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  kind:           text('kind').notNull(),
  authorPlayerId: text('author_player_id'),
  authorDisplay:  text('author_display').notNull(),
  areaId:         text('area_id'),
  targetPlayerId: text('target_player_id'),
  body:           text('body').notNull(),
  rollPayload:    text('roll_payload'),
  createdAt:      integer('created_at').notNull(),
  deletedAt:      integer('deleted_at'),
  deletedBy:      text('deleted_by'),
  editedAt:       integer('edited_at')
}, (t) => [
  index('messages_area_time_idx').on(t.partySeed, t.areaId, t.createdAt),
  index('messages_target_time_idx').on(t.partySeed, t.targetPlayerId, t.createdAt)
])

export const areaAccessBans = sqliteTable('area_access_bans', {
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  areaId:    text('area_id').notNull(),
  reason:    text('reason')
}, (t) => [
  primaryKey({ columns: [t.partySeed, t.areaId] })
])

export const weatherOverrides = sqliteTable('weather_overrides', {
  partySeed:  text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  areaId:     text('area_id'),
  code:       text('code').notNull(),
  intensity:  real('intensity').notNull(),
  setAt:      integer('set_at').notNull(),
  expiresAt:  integer('expires_at')
}, (t) => [
  primaryKey({ columns: [t.partySeed, t.areaId] })
])

export const masterActions = sqliteTable('master_actions', {
  id:         text('id').primaryKey(),
  partySeed:  text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  masterId:   text('master_id').notNull(),
  action:     text('action').notNull(),
  target:     text('target'),
  payload:    text('payload'),
  createdAt:  integer('created_at').notNull()
}, (t) => [
  index('master_actions_time_idx').on(t.partySeed, t.createdAt)
])

export const bans = sqliteTable('bans', {
  partySeed:     text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  nicknameLower: text('nickname_lower').notNull(),
  reason:        text('reason'),
  bannedAt:      integer('banned_at').notNull()
}, (t) => [
  primaryKey({ columns: [t.partySeed, t.nicknameLower] })
])
