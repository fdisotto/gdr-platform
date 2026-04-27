import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const parties = sqliteTable('parties', {
  seed: text('seed').primaryKey(),
  masterTokenHash: text('master_token_hash').notNull(),
  cityName: text('city_name').notNull(),
  createdAt: integer('created_at').notNull(),
  lastActivityAt: integer('last_activity_at').notNull(),
  // v2b: visibility decide se la party appare nel browser pubblico
  // (public) o solo via link/invito (private). joinPolicy decide se
  // l'utente può unirsi direttamente (auto) o deve essere approvato
  // dal master (request). archivedAt != null marca party in sola lettura.
  visibility: text('visibility', { enum: ['public', 'private'] }).notNull().default('private'),
  joinPolicy: text('join_policy', { enum: ['auto', 'request'] }).notNull().default('request'),
  archivedAt: integer('archived_at'),
  // v2d-fog: il master può disattivare la fog of war party-wide. Quando
  // false, tutti i giocatori vedono tutta la mappa. Default true.
  fogEnabled: integer('fog_enabled', { mode: 'boolean' }).notNull().default(true)
})

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  // v2a: userId è la FK all'account. In MVP le vecchie righe non ce l'hanno,
  // ma la migration 0002 azzera players e poi aggiunge NOT NULL.
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull(),
  role: text('role', { enum: ['user', 'master'] }).notNull(),
  // v2d: currentMapId punta alla mappa attiva del player. Le aree sono
  // identificate dalla coppia (mapId, areaId) — areaId resta univoco
  // dentro una singola mappa, mai globalmente. NULLABLE in T1: i service
  // pre-multimap inseriscono ancora senza mapId; T16 stringe a NOT NULL.
  currentMapId: text('current_map_id').references(() => partyMaps.id, { onDelete: 'cascade' }),
  currentAreaId: text('current_area_id').notNull(),
  isMuted: integer('is_muted', { mode: 'boolean' }).notNull().default(false),
  mutedUntil: integer('muted_until'),
  isKicked: integer('is_kicked', { mode: 'boolean' }).notNull().default(false),
  joinedAt: integer('joined_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  sessionToken: text('session_token').notNull(),
  // v2b: leftAt != null = soft-delete (l'utente ha lasciato volontariamente).
  // Le query active escludono leftAt IS NOT NULL. Permette al display name
  // di essere riusato e alla riga storica di restare per i messaggi che la
  // referenziano via authorPlayerId.
  leftAt: integer('left_at')
}, t => [
  uniqueIndex('players_party_nickname_unique').on(t.partySeed, t.nickname),
  uniqueIndex('players_party_user_unique').on(t.partySeed, t.userId),
  index('players_session_idx').on(t.sessionToken)
])

export const areasState = sqliteTable('areas_state', {
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  // v2d: mapId è NULLABLE in T1 perché i service pre-multimap inseriscono
  // ancora senza mapId; T16 adegua i service e una migration 0006 stringe
  // a NOT NULL estendendo la PK a (partySeed, mapId, areaId).
  mapId: text('map_id'),
  areaId: text('area_id').notNull(),
  status: text('status', { enum: ['intact', 'infested', 'ruined', 'closed'] }).notNull(),
  customName: text('custom_name'),
  notes: text('notes')
}, t => [
  primaryKey({ columns: [t.partySeed, t.areaId] })
])

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  authorPlayerId: text('author_player_id'),
  authorDisplay: text('author_display').notNull(),
  // v2d: mapId è nullable perché DM e announce non sono area-scoped.
  // Per i messaggi area/zone è valorizzato insieme ad areaId.
  mapId: text('map_id'),
  areaId: text('area_id'),
  targetPlayerId: text('target_player_id'),
  body: text('body').notNull(),
  rollPayload: text('roll_payload'),
  createdAt: integer('created_at').notNull(),
  deletedAt: integer('deleted_at'),
  deletedBy: text('deleted_by'),
  editedAt: integer('edited_at')
}, t => [
  index('messages_area_time_idx').on(t.partySeed, t.areaId, t.createdAt),
  index('messages_target_time_idx').on(t.partySeed, t.targetPlayerId, t.createdAt)
])

export const areaAccessBans = sqliteTable('area_access_bans', {
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  // v2d: mapId NULLABLE in T1; T16 + migration 0006 stringe a NOT NULL ed
  // estende la PK a (partySeed, mapId, areaId).
  mapId: text('map_id'),
  areaId: text('area_id').notNull(),
  reason: text('reason')
}, t => [
  primaryKey({ columns: [t.partySeed, t.areaId] })
])

export const weatherOverrides = sqliteTable('weather_overrides', {
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  // v2d: mapId NULLABLE in T1; T16 + migration 0006 stringe a NOT NULL ed
  // estende la PK a (partySeed, mapId, areaId).
  mapId: text('map_id'),
  areaId: text('area_id'),
  code: text('code').notNull(),
  intensity: real('intensity').notNull(),
  setAt: integer('set_at').notNull(),
  expiresAt: integer('expires_at')
}, t => [
  primaryKey({ columns: [t.partySeed, t.areaId] })
])

export const masterActions = sqliteTable('master_actions', {
  id: text('id').primaryKey(),
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  masterId: text('master_id').notNull(),
  action: text('action').notNull(),
  target: text('target'),
  payload: text('payload'),
  createdAt: integer('created_at').notNull()
}, t => [
  index('master_actions_time_idx').on(t.partySeed, t.createdAt)
])

export const bans = sqliteTable('bans', {
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  nicknameLower: text('nickname_lower').notNull(),
  reason: text('reason'),
  bannedAt: integer('banned_at').notNull()
}, t => [
  primaryKey({ columns: [t.partySeed, t.nicknameLower] })
])

// zombi e NPC: stessa tabella, gli NPC sono zombie con npcName/npcRole.
// Persistiti per sopravvivere al restart del server.
export const zombies = sqliteTable('zombies', {
  id: text('id').primaryKey(),
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  // v2d: mapId NULLABLE in T1 per i service pre-multimap; T16 + 0006
  // stringe a NOT NULL.
  mapId: text('map_id'),
  areaId: text('area_id').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  spawnedAt: integer('spawned_at').notNull(),
  npcName: text('npc_name'),
  npcRole: text('npc_role')
}, t => [
  index('zombies_party_area_idx').on(t.partySeed, t.areaId)
])

// Posizione in-area del player dentro il dettaglio zona.
// Una riga per (party, mapId, player, area) — cambia zona → riga sostituita.
export const playerPositions = sqliteTable('player_positions', {
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  // v2d: mapId NULLABLE in T1; T16 + 0006 stringe a NOT NULL ed estende
  // la PK a (partySeed, mapId, playerId, areaId).
  mapId: text('map_id'),
  playerId: text('player_id').notNull(),
  areaId: text('area_id').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  setAt: integer('set_at').notNull()
}, t => [
  primaryKey({ columns: [t.partySeed, t.playerId, t.areaId] })
])

// v2a auth: utenti registrati con username + password (+ status di approvazione
// gestito dal superadmin). usernameLower serve per il lookup case-insensitive.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  usernameLower: text('username_lower').notNull(),
  passwordHash: text('password_hash').notNull(),
  mustReset: integer('must_reset', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: ['pending', 'approved', 'banned'] }).notNull(),
  createdAt: integer('created_at').notNull(),
  approvedAt: integer('approved_at'),
  approvedBy: text('approved_by'),
  bannedReason: text('banned_reason')
}, t => [
  uniqueIndex('users_username_lower_unique').on(t.usernameLower),
  index('users_status_idx').on(t.status)
])

// Superadmin su tabella separata: non è un ruolo elevato sopra users ma un
// account distinto con proprio namespace. Seed script crea admin/changeme
// con mustReset=true al primo boot.
export const superadmins = sqliteTable('superadmins', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  usernameLower: text('username_lower').notNull(),
  passwordHash: text('password_hash').notNull(),
  mustReset: integer('must_reset', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  // v2c: revoke soft-delete. revokedAt != null → l'account non può più
  // autenticare; lookup `findActiveSuperadmin*` filtra `revokedAt IS NULL`.
  revokedAt: integer('revoked_at'),
  revokedBy: text('revoked_by')
}, t => [
  uniqueIndex('superadmins_username_lower_unique').on(t.usernameLower)
])

// Sessioni auth: token opaque in cookie httpOnly. Una riga per user o
// per superadmin (XOR expresso via CHECK aggiunto nella migration SQL, che
// drizzle-kit non genera automaticamente).
export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  superadminId: text('superadmin_id').references(() => superadmins.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  lastActivityAt: integer('last_activity_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent')
}, t => [
  index('sessions_user_idx').on(t.userId),
  index('sessions_superadmin_idx').on(t.superadminId),
  index('sessions_expires_idx').on(t.expiresAt)
])

// Audit log append-only per eventi auth: register, login, ban, reset…
export const authEvents = sqliteTable('auth_events', {
  id: text('id').primaryKey(),
  actorKind: text('actor_kind', { enum: ['user', 'superadmin', 'anonymous'] }).notNull(),
  actorId: text('actor_id'),
  usernameAttempted: text('username_attempted'),
  event: text('event').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  detail: text('detail'),
  createdAt: integer('created_at').notNull()
}, t => [
  index('auth_events_time_idx').on(t.createdAt),
  index('auth_events_actor_idx').on(t.actorKind, t.actorId, t.createdAt)
])

// v2b: invite token monouso 7d per accedere a party private (o public)
// senza passare dal flow request-required. Generato dal master.
export const partyInvites = sqliteTable('party_invites', {
  id: text('id').primaryKey(),
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
  usedBy: text('used_by').references(() => users.id),
  revokedAt: integer('revoked_at')
}, t => [
  index('party_invites_party_idx').on(t.partySeed),
  index('party_invites_token_idx').on(t.token)
])

// v2b: richieste di adesione per party in modalità join-policy=request.
// Stato finito ('pending' | 'approved' | 'rejected' | 'cancelled').
export const partyJoinRequests = sqliteTable('party_join_requests', {
  id: text('id').primaryKey(),
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  message: text('message'),
  createdAt: integer('created_at').notNull(),
  status: text('status', {
    enum: ['pending', 'approved', 'rejected', 'cancelled']
  }).notNull(),
  resolvedAt: integer('resolved_at'),
  resolvedBy: text('resolved_by').references(() => users.id),
  rejectReason: text('reject_reason')
}, t => [
  // Una sola richiesta pending per (party, user, status='pending'); riapertura
  // richiede prima un cancel/reject. Drizzle non permette WHERE su uniqueIndex
  // per SQLite; il vincolo è (party, user, status) — duplicate pending → errore.
  uniqueIndex('party_join_requests_party_user_status').on(t.partySeed, t.userId, t.status),
  index('party_join_requests_status_idx').on(t.partySeed, t.status)
])

// v2c: settings configurabili runtime dal dashboard admin. Cache in-memory
// invalidata su set. Default seedati al boot via migration.
export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
  updatedBy: text('updated_by')
})

// v2c: snapshot giornaliero per time-series. Una riga per giorno UTC,
// aggregati pre-calcolati. Plugin nitro daily-metrics-cron upserta.
export const dailyMetrics = sqliteTable('daily_metrics', {
  date: text('date').primaryKey(),
  usersTotal: integer('users_total').notNull(),
  usersApproved: integer('users_approved').notNull(),
  usersPending: integer('users_pending').notNull(),
  usersBanned: integer('users_banned').notNull(),
  partiesTotal: integer('parties_total').notNull(),
  partiesActive: integer('parties_active').notNull(),
  partiesArchived: integer('parties_archived').notNull(),
  messagesNew: integer('messages_new').notNull(),
  authLoginSuccess: integer('auth_login_success').notNull(),
  authLoginFailed: integer('auth_login_failed').notNull(),
  computedAt: integer('computed_at').notNull()
})

// v2c: audit log dedicato alle azioni admin (separato da auth_events
// per chiarezza scope: gestione party/utenti/settings/admin).
export const adminActions = sqliteTable('admin_actions', {
  id: text('id').primaryKey(),
  superadminId: text('superadmin_id').notNull().references(() => superadmins.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  targetKind: text('target_kind'),
  targetId: text('target_id'),
  payload: text('payload'),
  createdAt: integer('created_at').notNull()
}, t => [
  index('admin_actions_time_idx').on(t.createdAt),
  index('admin_actions_actor_idx').on(t.superadminId, t.createdAt)
])

// v2d: catalogo dei tipi di mappa generabili (city, country, wasteland…).
// defaultParams è JSON serializzato che il generator parsa per ottenere
// i parametri specifici (densità, ratio terreno, ecc.). enabled false
// nasconde il tipo dalla UI di creazione ma mantiene l'integrità FK.
export const mapTypes = sqliteTable('map_types', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  defaultParams: text('default_params').notNull(),
  areaCountMin: integer('area_count_min').notNull(),
  areaCountMax: integer('area_count_max').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

// v2d: istanza di mappa appartenente alla party. Il generator deterministico
// usa mapSeed per produrre lo stesso layout in modo riproducibile. isSpawn
// indica la mappa iniziale per i nuovi player.
export const partyMaps = sqliteTable('party_maps', {
  id: text('id').primaryKey(),
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  mapTypeId: text('map_type_id').notNull().references(() => mapTypes.id, { onDelete: 'restrict' }),
  mapSeed: text('map_seed').notNull(),
  name: text('name').notNull(),
  isSpawn: integer('is_spawn', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull()
}, t => [
  index('party_maps_party_idx').on(t.partySeed)
])

// v2d: arco di transizione fra due aree appartenenti potenzialmente a mappe
// diverse della stessa party. Cliccare su (fromMapId, fromAreaId) sposta
// il player a (toMapId, toAreaId). Le transizioni intra-mappa sono
// implicite via grafo della mappa, qui restano solo i link cross-map.
export const mapTransitions = sqliteTable('map_transitions', {
  id: text('id').primaryKey(),
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  fromMapId: text('from_map_id').notNull().references(() => partyMaps.id, { onDelete: 'cascade' }),
  // v2d: fromAreaId/toAreaId NON hanno FK verso areas_state perché finché
  // 0006 non estende la PK con mapId la chiave composta non è dichiarabile.
  // La validazione che le aree esistano nei GeneratedMap è demandata al
  // service map-transitions (T9).
  fromAreaId: text('from_area_id').notNull(),
  toMapId: text('to_map_id').notNull().references(() => partyMaps.id, { onDelete: 'cascade' }),
  toAreaId: text('to_area_id').notNull(),
  label: text('label'),
  createdAt: integer('created_at').notNull()
}, t => [
  index('map_transitions_from_idx').on(t.fromMapId, t.fromAreaId),
  index('map_transitions_party_idx').on(t.partySeed)
])

// v2d-edit: il master può customizzare la GeneratedMap della propria party
// senza alterare il generator code. Ogni override è un delta keyed
// (partySeed, mapId, areaId): rinomina, sposta/ridimensiona, marca come
// rimossa, oppure marca come aggiunta manualmente (areaId nuovo, slug
// `custom_<uuid>`). Il client applica i delta sulla GeneratedMap calcolata
// localmente prima di renderizzare.
export const areaOverrides = sqliteTable('area_overrides', {
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  mapId: text('map_id').notNull().references(() => partyMaps.id, { onDelete: 'cascade' }),
  areaId: text('area_id').notNull(),
  customName: text('custom_name'),
  // Posizione + dimensioni override (null = usa quella del generator). Per
  // aree customAdded, questi sono autoritativi (il generator non le ha).
  x: real('x'),
  y: real('y'),
  w: real('w'),
  h: real('h'),
  // Soft-remove: nasconde un'area generata senza cancellarla davvero (il
  // generator continua a produrla, ma client la filtra fuori).
  removed: integer('removed', { mode: 'boolean' }).notNull().default(false),
  // Aree create dal master (non presenti nella GeneratedMap base): id slug
  // `custom_<uuid>`, shape autoritativa via x/y/w/h.
  customAdded: integer('custom_added', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
}, t => [
  primaryKey({ columns: [t.partySeed, t.mapId, t.areaId] }),
  index('area_overrides_map_idx').on(t.partySeed, t.mapId)
])

// v2d-fog: tracking esplorazione party-shared. Quando un player entra
// in un'area (move:request, join, createParty per il master) facciamo
// upsert qui. Tutti i player della party vedono come "esplorate" le aree
// con una riga; le altre sono coperte da fog of war. Il master bypassa
// il filtro lato client (vede tutto a prescindere). PK su (partySeed,
// mapId, areaId): append-only, niente duplicati.
export const areaVisits = sqliteTable('area_visits', {
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  mapId: text('map_id').notNull().references(() => partyMaps.id, { onDelete: 'cascade' }),
  areaId: text('area_id').notNull(),
  firstVisitedBy: text('first_visited_by'), // playerId del primo a entrare
  firstVisitedAt: integer('first_visited_at').notNull()
}, t => [
  primaryKey({ columns: [t.partySeed, t.mapId, t.areaId] }),
  index('area_visits_map_idx').on(t.partySeed, t.mapId)
])

// v2d-edit: delta master sul grafo adjacency. Il client ricalcola le
// adiacenze dalla prossimità spaziale; gli override permettono di
// aggiungere strade tra aree non vicine ('add') o rimuovere strade
// generate automaticamente ('remove'). PK normalizzata su areaA < areaB
// (lessicografico) così non ci sono righe duplicate per la stessa coppia.
export const areaAdjacencyOverrides = sqliteTable('area_adjacency_overrides', {
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  mapId: text('map_id').notNull().references(() => partyMaps.id, { onDelete: 'cascade' }),
  areaA: text('area_a').notNull(),
  areaB: text('area_b').notNull(),
  kind: text('kind', { enum: ['add', 'remove'] }).notNull(),
  // v2d-roads: stile della strada quando kind='add'. NULL → usa lo stile
  // di default derivato dal mapTypeId. Tipi disponibili: 'urban' (asfalto),
  // 'path' (sentiero sterrato), 'wasteland' (strada crepata), 'highway'
  // (autostrada doppia corsia), 'bridge' (ponte/passerella).
  roadKind: text('road_kind', { enum: ['urban', 'path', 'wasteland', 'highway', 'bridge'] }),
  createdAt: integer('created_at').notNull()
}, t => [
  primaryKey({ columns: [t.partySeed, t.mapId, t.areaA, t.areaB] }),
  index('area_adjacency_overrides_map_idx').on(t.partySeed, t.mapId)
])
