import { z } from 'zod'
import { ERROR_CODES } from '~~/shared/errors'

export const MESSAGE_KINDS = [
  'say', 'whisper', 'emote', 'ooc', 'roll', 'shout', 'dm', 'npc', 'announce', 'system'
] as const
export type MessageKind = typeof MESSAGE_KINDS[number]

// Zod v4: top-level z.uuid() per stringhe UUID
const UuidSeed = z.uuid()

// v2a: il WS /ws/party autentica via cookie gdr_session letto all'upgrade.
// HelloEvent non porta più sessionToken — serve solo per indicare la party.
export const HelloEvent = z.object({
  type: z.literal('hello'),
  seed: UuidSeed
})
export type HelloEvent = z.infer<typeof HelloEvent>

export const ServerErrorEvent = z.object({
  type: z.literal('error'),
  code: z.enum(ERROR_CODES),
  detail: z.string().optional()
})
export type ServerErrorEvent = z.infer<typeof ServerErrorEvent>

const ChatKind = z.enum(['say', 'whisper', 'emote', 'ooc', 'shout', 'roll', 'dm'])

export const ChatSendEvent = z.object({
  type: z.literal('chat:send'),
  kind: ChatKind,
  body: z.string().min(1).max(2000),
  areaId: z.string().optional().nullable(),
  targetPlayerId: z.string().optional().nullable(),
  rollExpr: z.string().optional()
})
export type ChatSendEvent = z.infer<typeof ChatSendEvent>

export const MessageRowSchema = z.object({
  id: z.string(),
  partySeed: z.string(),
  kind: z.string(),
  authorPlayerId: z.string().nullable(),
  authorDisplay: z.string(),
  areaId: z.string().nullable(),
  targetPlayerId: z.string().nullable(),
  body: z.string(),
  rollPayload: z.string().nullable(),
  createdAt: z.number(),
  deletedAt: z.number().nullable(),
  deletedBy: z.string().nullable(),
  editedAt: z.number().nullable()
})
export type MessageRow = z.infer<typeof MessageRowSchema>

export const MessageNewEvent = z.object({
  type: z.literal('message:new'),
  message: MessageRowSchema
})
export type MessageNewEvent = z.infer<typeof MessageNewEvent>

export const TimeTickEvent = z.object({
  type: z.literal('time:tick'),
  serverTime: z.number()
})
export type TimeTickEvent = z.infer<typeof TimeTickEvent>

const PlayerSnapshot = z.object({
  id: z.string(),
  nickname: z.string(),
  role: z.enum(['user', 'master']),
  currentAreaId: z.string(),
  // v2d: mapId della mappa corrente del player. Nullable per legacy
  // (player creati pre-T17), optional per backward compat con server pre-T15.
  currentMapId: z.string().nullable().optional()
})

const PartySnapshot = z.object({
  seed: z.string(),
  cityName: z.string(),
  createdAt: z.number(),
  lastActivityAt: z.number()
})

const AreaStateSnapshot = z.object({
  partySeed: z.string(),
  // v2d: scope della riga area_state per (mapId, areaId). Nullable per legacy.
  mapId: z.string().nullable().optional(),
  areaId: z.string(),
  status: z.enum(['intact', 'infested', 'ruined', 'closed']),
  customName: z.string().nullable(),
  notes: z.string().nullable()
})

export const PartyMapPublicSchema = z.object({
  id: z.string(),
  mapTypeId: z.string(),
  // v2d/T20: il client deve poter rigenerare la GeneratedMap localmente
  // (stesso generator deterministico del server). Servono mapSeed + params
  // effettivamente usati dal server per evitare divergenze di rendering.
  mapSeed: z.string(),
  params: z.record(z.string(), z.unknown()),
  name: z.string(),
  isSpawn: z.boolean(),
  createdAt: z.number()
})
export type PartyMapPublic = z.infer<typeof PartyMapPublicSchema>

export const TransitionPublicSchema = z.object({
  id: z.string(),
  fromMapId: z.string(),
  fromAreaId: z.string(),
  toMapId: z.string(),
  toAreaId: z.string(),
  label: z.string().nullable()
})
export type TransitionPublic = z.infer<typeof TransitionPublicSchema>

// v2d-edit: shape pubblica di un override area (riga area_overrides). Il
// client applica i delta sulla GeneratedMap calcolata localmente prima di
// renderizzare.
export const AreaOverridePublicSchema = z.object({
  mapId: z.string(),
  areaId: z.string(),
  customName: z.string().nullable(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  w: z.number().nullable(),
  h: z.number().nullable(),
  removed: z.boolean(),
  customAdded: z.boolean()
})
export type AreaOverridePublic = z.infer<typeof AreaOverridePublicSchema>

// v2d-edit: delta sul grafo adjacency. Coppia (areaA, areaB) sempre
// normalizzata in ordine lessicografico (areaA < areaB).
export const AdjacencyOverridePublicSchema = z.object({
  mapId: z.string(),
  areaA: z.string(),
  areaB: z.string(),
  kind: z.enum(['add', 'remove'])
})
export type AdjacencyOverridePublic = z.infer<typeof AdjacencyOverridePublicSchema>

// v2d-fog: aree esplorate party-shared. Tutti i player vedono ciò che
// almeno uno ha esplorato; il master vede tutto.
export const AreaVisitPublicSchema = z.object({
  mapId: z.string(),
  areaId: z.string()
})
export type AreaVisitPublic = z.infer<typeof AreaVisitPublicSchema>

// Broadcast quando un player scopre un'area nuova.
export const AreaDiscoveredEvent = z.object({
  type: z.literal('area:discovered'),
  mapId: z.string(),
  areaId: z.string()
})
export type AreaDiscoveredEvent = z.infer<typeof AreaDiscoveredEvent>

export const PlayerPositionSchema = z.object({
  playerId: z.string(),
  // v2d: posizione scoped per mappa. Nullable per legacy.
  mapId: z.string().nullable().optional(),
  areaId: z.string(),
  x: z.number(),
  y: z.number()
})
export type PlayerPosition = z.infer<typeof PlayerPositionSchema>

const WeatherOverridePublicSchema = z.object({
  // v2d: override scoped per mappa.
  mapId: z.string().nullable().optional(),
  areaId: z.string().nullable(),
  code: z.string(),
  intensity: z.number()
})

export const StateInitEvent = z.object({
  type: z.literal('state:init'),
  me: PlayerSnapshot,
  party: PartySnapshot,
  players: z.array(PlayerSnapshot),
  areasState: z.array(AreaStateSnapshot),
  messagesByArea: z.record(z.array(MessageRowSchema)),
  dms: z.array(MessageRowSchema),
  zombies: z.array(z.object({
    id: z.string(),
    partySeed: z.string(),
    // v2d
    mapId: z.string().nullable().optional(),
    areaId: z.string(),
    x: z.number(),
    y: z.number(),
    spawnedAt: z.number()
  })),
  playerPositions: z.array(PlayerPositionSchema),
  weatherOverrides: z.array(WeatherOverridePublicSchema),
  // v2d: lista mappe della party e transizioni cross-map.
  // Required come array, T15 li popolerà lato server. Default semantico: [].
  maps: z.array(PartyMapPublicSchema),
  transitions: z.array(TransitionPublicSchema),
  // v2d-edit: override master delle aree per ogni mappa della party.
  areaOverrides: z.array(AreaOverridePublicSchema).default([]),
  // v2d-edit: delta sul grafo adjacency.
  adjacencyOverrides: z.array(AdjacencyOverridePublicSchema).default([]),
  // v2d-fog: aree esplorate dalla party (tutti i player le vedono).
  visitedAreas: z.array(AreaVisitPublicSchema).default([]),
  serverTime: z.number()
})
export type StateInitEvent = z.infer<typeof StateInitEvent>

export const MoveRequestEvent = z.object({
  type: z.literal('move:request'),
  toAreaId: z.string(),
  // v2d: cross-map. Se presente, il move attraversa una transition.
  toMapId: z.string().optional()
})
export type MoveRequestEvent = z.infer<typeof MoveRequestEvent>

const PlayerSnapshotSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  role: z.enum(['user', 'master']),
  currentAreaId: z.string(),
  // v2d
  currentMapId: z.string().nullable().optional()
})

export const PlayerJoinedEvent = z.object({
  type: z.literal('player:joined'),
  player: PlayerSnapshotSchema
})
export type PlayerJoinedEvent = z.infer<typeof PlayerJoinedEvent>

export const PlayerLeftEvent = z.object({
  type: z.literal('player:left'),
  playerId: z.string(),
  reason: z.string().optional()
})
export type PlayerLeftEvent = z.infer<typeof PlayerLeftEvent>

export const PlayerMovedEvent = z.object({
  type: z.literal('player:moved'),
  playerId: z.string(),
  fromAreaId: z.string(),
  toAreaId: z.string(),
  // v2d: per move stessa-mappa entrambi null; per cross-map valorizzati.
  // Optional per backward compat con server pre-T15.
  fromMapId: z.string().nullable().optional(),
  toMapId: z.string().nullable().optional(),
  teleported: z.boolean()
})
export type PlayerMovedEvent = z.infer<typeof PlayerMovedEvent>

const AreaStateSnapshotSchema = z.object({
  partySeed: z.string(),
  // v2d
  mapId: z.string().nullable().optional(),
  areaId: z.string(),
  status: z.enum(['intact', 'infested', 'ruined', 'closed']),
  customName: z.string().nullable(),
  notes: z.string().nullable()
})

export const AreaUpdatedEvent = z.object({
  type: z.literal('area:updated'),
  patch: AreaStateSnapshotSchema
})
export type AreaUpdatedEvent = z.infer<typeof AreaUpdatedEvent>

const WeatherStateSchema = z.object({
  code: z.string(),
  intensity: z.number(),
  label: z.string()
})

export const WeatherUpdatedEvent = z.object({
  type: z.literal('weather:updated'),
  areaId: z.string().nullable(),
  effective: WeatherStateSchema.nullable()
})
export type WeatherUpdatedEvent = z.infer<typeof WeatherUpdatedEvent>

export const HistoryFetchEvent = z.object({
  type: z.literal('chat:history-before'),
  areaId: z.string().optional(),
  threadKey: z.string().optional(),
  before: z.number(),
  limit: z.number().int().min(1).max(200)
})
export type HistoryFetchEvent = z.infer<typeof HistoryFetchEvent>

export const HistoryBatchEvent = z.object({
  type: z.literal('chat:history-batch'),
  areaId: z.string().optional(),
  threadKey: z.string().optional(),
  messages: z.array(MessageRowSchema),
  hasMore: z.boolean()
})
export type HistoryBatchEvent = z.infer<typeof HistoryBatchEvent>

export const MasterAreaEvent = z.object({
  type: z.literal('master:area'),
  areaId: z.string(),
  status: z.enum(['intact', 'infested', 'ruined', 'closed']).optional(),
  customName: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
})
export type MasterAreaEvent = z.infer<typeof MasterAreaEvent>

export const ZombieSchema = z.object({
  id: z.string(),
  partySeed: z.string(),
  // v2d: zombie scoped per mappa.
  mapId: z.string().nullable().optional(),
  areaId: z.string(),
  x: z.number(),
  y: z.number(),
  spawnedAt: z.number(),
  npcName: z.string().min(1).max(64).nullable().optional(),
  npcRole: z.string().min(1).max(64).nullable().optional()
})
export type Zombie = z.infer<typeof ZombieSchema>

export const MasterSpawnZombieEvent = z.object({
  type: z.literal('master:spawn-zombie'),
  areaId: z.string(),
  x: z.number(),
  y: z.number(),
  npcName: z.string().min(1).max(64).nullable().optional(),
  npcRole: z.string().min(1).max(64).nullable().optional()
})
export type MasterSpawnZombieEvent = z.infer<typeof MasterSpawnZombieEvent>

export const MasterRemoveZombieEvent = z.object({
  type: z.literal('master:remove-zombie'),
  id: z.string()
})
export type MasterRemoveZombieEvent = z.infer<typeof MasterRemoveZombieEvent>

export const ZombieSpawnedEvent = z.object({
  type: z.literal('zombie:spawned'),
  zombie: ZombieSchema
})
export type ZombieSpawnedEvent = z.infer<typeof ZombieSpawnedEvent>

export const ZombieRemovedEvent = z.object({
  type: z.literal('zombie:removed'),
  id: z.string()
})
export type ZombieRemovedEvent = z.infer<typeof ZombieRemovedEvent>

export const MasterPlacePlayerEvent = z.object({
  type: z.literal('master:place-player'),
  playerId: z.string(),
  areaId: z.string(),
  x: z.number(),
  y: z.number()
})
export type MasterPlacePlayerEvent = z.infer<typeof MasterPlacePlayerEvent>

export const PlayerPlacedEvent = z.object({
  type: z.literal('player:placed'),
  playerId: z.string(),
  areaId: z.string(),
  x: z.number().nullable(),
  y: z.number().nullable()
})
export type PlayerPlacedEvent = z.infer<typeof PlayerPlacedEvent>

export const MasterMoveZombieEvent = z.object({
  type: z.literal('master:move-zombie'),
  id: z.string(),
  x: z.number(),
  y: z.number()
})
export type MasterMoveZombieEvent = z.infer<typeof MasterMoveZombieEvent>

export const ZombieMovedEvent = z.object({
  type: z.literal('zombie:moved'),
  id: z.string(),
  x: z.number(),
  y: z.number()
})
export type ZombieMovedEvent = z.infer<typeof ZombieMovedEvent>

export const MasterSpawnZombiesEvent = z.object({
  type: z.literal('master:spawn-zombies'),
  areaId: z.string(),
  positions: z.array(z.object({ x: z.number(), y: z.number() })).min(1).max(200)
})
export type MasterSpawnZombiesEvent = z.infer<typeof MasterSpawnZombiesEvent>

export const ZombiesBatchSpawnedEvent = z.object({
  type: z.literal('zombies:batch-spawned'),
  zombies: z.array(ZombieSchema)
})
export type ZombiesBatchSpawnedEvent = z.infer<typeof ZombiesBatchSpawnedEvent>

export const VoiceOfferEvent = z.object({
  type: z.literal('voice:offer'),
  targetPlayerId: z.string(),
  sdp: z.string()
})
export type VoiceOfferEvent = z.infer<typeof VoiceOfferEvent>

export const VoiceAnswerEvent = z.object({
  type: z.literal('voice:answer'),
  targetPlayerId: z.string(),
  sdp: z.string()
})
export type VoiceAnswerEvent = z.infer<typeof VoiceAnswerEvent>

export const VoiceIceEvent = z.object({
  type: z.literal('voice:ice'),
  targetPlayerId: z.string(),
  candidate: z.string() // JSON-serialized RTCIceCandidateInit
})
export type VoiceIceEvent = z.infer<typeof VoiceIceEvent>

export const VoiceLeaveEvent = z.object({
  type: z.literal('voice:leave'),
  targetPlayerId: z.string()
})
export type VoiceLeaveEvent = z.infer<typeof VoiceLeaveEvent>

// Evento inoltrato: server → client (con fromPlayerId)
export const VoiceSignalEvent = z.object({
  type: z.literal('voice:signal'),
  fromPlayerId: z.string(),
  signal: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('offer'), sdp: z.string() }),
    z.object({ kind: z.literal('answer'), sdp: z.string() }),
    z.object({ kind: z.literal('ice'), candidate: z.string() }),
    z.object({ kind: z.literal('leave') })
  ])
})
export type VoiceSignalEvent = z.infer<typeof VoiceSignalEvent>

export const MasterDeleteMessageEvent = z.object({
  type: z.literal('master:delete-message'),
  messageId: z.string()
})
export type MasterDeleteMessageEvent = z.infer<typeof MasterDeleteMessageEvent>

// "Oscura" (soft delete): la riga resta in DB con deletedAt valorizzato;
// gli utenti vedono "[messaggio rimosso]", il master vede ancora il body.
// Purge è hard delete: la riga sparisce per tutti.
export const MasterPurgeMessageEvent = z.object({
  type: z.literal('master:purge-message'),
  messageId: z.string()
})
export type MasterPurgeMessageEvent = z.infer<typeof MasterPurgeMessageEvent>

// Broadcast emesso dopo una purge: i client rimuovono la riga dal feed.
export const MessageRemovedEvent = z.object({
  type: z.literal('message:removed'),
  messageId: z.string()
})
export type MessageRemovedEvent = z.infer<typeof MessageRemovedEvent>

export const MasterAreaRenameEvent = z.object({
  type: z.literal('master:area-rename'),
  mapId: z.string(),
  areaId: z.string(),
  name: z.string().min(1).max(64)
})
export type MasterAreaRenameEvent = z.infer<typeof MasterAreaRenameEvent>

export const MasterAreaMoveEvent = z.object({
  type: z.literal('master:area-move'),
  mapId: z.string(),
  areaId: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number().min(20).max(400).optional(),
  h: z.number().min(20).max(400).optional()
})
export type MasterAreaMoveEvent = z.infer<typeof MasterAreaMoveEvent>

export const MasterAreaAddEvent = z.object({
  type: z.literal('master:area-add'),
  mapId: z.string(),
  name: z.string().min(1).max(64),
  x: z.number(),
  y: z.number(),
  w: z.number().min(20).max(400).default(120),
  h: z.number().min(20).max(400).default(90)
})
export type MasterAreaAddEvent = z.infer<typeof MasterAreaAddEvent>

export const MasterAreaRemoveEvent = z.object({
  type: z.literal('master:area-remove'),
  mapId: z.string(),
  areaId: z.string()
})
export type MasterAreaRemoveEvent = z.infer<typeof MasterAreaRemoveEvent>

// v2d-edit: aggiunge/rimuove una strada di collegamento fra due aree
// della stessa mappa. add = forza adiacenza anche se la prossimità auto
// non l'avrebbe creata. remove = oscura un'adiacenza calcolata auto.
// La coppia viene normalizzata server-side.
export const MasterRoadAddEvent = z.object({
  type: z.literal('master:road-add'),
  mapId: z.string(),
  areaA: z.string(),
  areaB: z.string()
})
export type MasterRoadAddEvent = z.infer<typeof MasterRoadAddEvent>

export const MasterRoadRemoveEvent = z.object({
  type: z.literal('master:road-remove'),
  mapId: z.string(),
  areaA: z.string(),
  areaB: z.string()
})
export type MasterRoadRemoveEvent = z.infer<typeof MasterRoadRemoveEvent>

// "Reset": cancella l'override per quella coppia (torna al
// comportamento prossimità auto).
export const MasterRoadResetEvent = z.object({
  type: z.literal('master:road-reset'),
  mapId: z.string(),
  areaA: z.string(),
  areaB: z.string()
})
export type MasterRoadResetEvent = z.infer<typeof MasterRoadResetEvent>

// Broadcast a tutti i player della party dopo qualsiasi area-edit.
export const AreaOverrideUpdatedEvent = z.object({
  type: z.literal('area-override:updated'),
  override: AreaOverridePublicSchema
})
export type AreaOverrideUpdatedEvent = z.infer<typeof AreaOverrideUpdatedEvent>

export const AreaOverrideRemovedEvent = z.object({
  type: z.literal('area-override:removed'),
  mapId: z.string(),
  areaId: z.string()
})
export type AreaOverrideRemovedEvent = z.infer<typeof AreaOverrideRemovedEvent>

export const AdjacencyOverrideUpdatedEvent = z.object({
  type: z.literal('adjacency-override:updated'),
  override: AdjacencyOverridePublicSchema
})
export type AdjacencyOverrideUpdatedEvent = z.infer<typeof AdjacencyOverrideUpdatedEvent>

export const AdjacencyOverrideRemovedEvent = z.object({
  type: z.literal('adjacency-override:removed'),
  mapId: z.string(),
  areaA: z.string(),
  areaB: z.string()
})
export type AdjacencyOverrideRemovedEvent = z.infer<typeof AdjacencyOverrideRemovedEvent>

export const MasterEditMessageEvent = z.object({
  type: z.literal('master:edit-message'),
  messageId: z.string(),
  newBody: z.string().min(1).max(2000)
})
export type MasterEditMessageEvent = z.infer<typeof MasterEditMessageEvent>

export const MasterMuteEvent = z.object({
  type: z.literal('master:mute'),
  playerId: z.string(),
  minutes: z.number().int().min(1).max(10080).nullable() // null = permanente
})
export type MasterMuteEvent = z.infer<typeof MasterMuteEvent>

export const MasterUnmuteEvent = z.object({
  type: z.literal('master:unmute'),
  playerId: z.string()
})
export type MasterUnmuteEvent = z.infer<typeof MasterUnmuteEvent>

export const MasterKickEvent = z.object({
  type: z.literal('master:kick'),
  playerId: z.string(),
  reason: z.string().nullable().optional()
})
export type MasterKickEvent = z.infer<typeof MasterKickEvent>

export const MasterBanEvent = z.object({
  type: z.literal('master:ban'),
  playerId: z.string(),
  reason: z.string().nullable().optional()
})
export type MasterBanEvent = z.infer<typeof MasterBanEvent>

export const MasterUnbanEvent = z.object({
  type: z.literal('master:unban'),
  nicknameLower: z.string()
})
export type MasterUnbanEvent = z.infer<typeof MasterUnbanEvent>

export const MasterNpcEvent = z.object({
  type: z.literal('master:npc'),
  areaId: z.string(),
  npcName: z.string().min(1).max(64),
  body: z.string().min(1).max(2000)
})
export type MasterNpcEvent = z.infer<typeof MasterNpcEvent>

export const MasterAnnounceEvent = z.object({
  type: z.literal('master:announce'),
  body: z.string().min(1).max(2000)
})
export type MasterAnnounceEvent = z.infer<typeof MasterAnnounceEvent>

export const MasterHiddenRollEvent = z.object({
  type: z.literal('master:hidden-roll'),
  expr: z.string().min(1).max(64)
})
export type MasterHiddenRollEvent = z.infer<typeof MasterHiddenRollEvent>

export const MasterWeatherOverrideEvent = z.object({
  type: z.literal('master:weather-override'),
  areaId: z.string().nullable(),
  code: z.string().nullable().optional(),
  intensity: z.number().min(0).max(1).nullable().optional(),
  clear: z.boolean().optional()
})
export type MasterWeatherOverrideEvent = z.infer<typeof MasterWeatherOverrideEvent>

export const MasterMovePlayerEvent = z.object({
  type: z.literal('master:move-player'),
  playerId: z.string(),
  toAreaId: z.string()
})
export type MasterMovePlayerEvent = z.infer<typeof MasterMovePlayerEvent>

const MasterActionRowSchema = z.object({
  id: z.string(),
  partySeed: z.string(),
  masterId: z.string(),
  action: z.string(),
  target: z.string().nullable(),
  payload: z.string().nullable(),
  createdAt: z.number()
})

const BanRowSchema = z.object({
  partySeed: z.string(),
  nicknameLower: z.string(),
  reason: z.string().nullable(),
  bannedAt: z.number()
})

export const MasterFetchActionsEvent = z.object({
  type: z.literal('master:fetch-actions'),
  limit: z.number().int().min(1).max(500).default(100)
})
export type MasterFetchActionsEvent = z.infer<typeof MasterFetchActionsEvent>

export const MasterActionsSnapshotEvent = z.object({
  type: z.literal('master:actions-snapshot'),
  actions: z.array(MasterActionRowSchema)
})
export type MasterActionsSnapshotEvent = z.infer<typeof MasterActionsSnapshotEvent>

export const MasterFetchBansEvent = z.object({
  type: z.literal('master:fetch-bans')
})
export type MasterFetchBansEvent = z.infer<typeof MasterFetchBansEvent>

export const MasterBansSnapshotEvent = z.object({
  type: z.literal('master:bans-snapshot'),
  bans: z.array(BanRowSchema)
})
export type MasterBansSnapshotEvent = z.infer<typeof MasterBansSnapshotEvent>

// Server → client
export const MessageUpdateEvent = z.object({
  type: z.literal('message:update'),
  message: MessageRowSchema
})
export type MessageUpdateEvent = z.infer<typeof MessageUpdateEvent>

export const PlayerMutedEvent = z.object({
  type: z.literal('player:muted'),
  playerId: z.string(),
  muted: z.boolean(),
  mutedUntil: z.number().nullable()
})
export type PlayerMutedEvent = z.infer<typeof PlayerMutedEvent>

export const KickedEvent = z.object({
  type: z.literal('kicked'),
  reason: z.string().nullable()
})
export type KickedEvent = z.infer<typeof KickedEvent>

export const ServerEvent = z.discriminatedUnion('type', [
  StateInitEvent, MessageNewEvent, TimeTickEvent, ServerErrorEvent,
  PlayerJoinedEvent, PlayerLeftEvent, PlayerMovedEvent,
  AreaUpdatedEvent, WeatherUpdatedEvent, HistoryBatchEvent,
  ZombieSpawnedEvent, ZombieRemovedEvent,
  PlayerPlacedEvent,
  ZombieMovedEvent, ZombiesBatchSpawnedEvent,
  VoiceSignalEvent,
  MessageUpdateEvent, MessageRemovedEvent, PlayerMutedEvent, KickedEvent,
  MasterActionsSnapshotEvent, MasterBansSnapshotEvent,
  AreaOverrideUpdatedEvent, AreaOverrideRemovedEvent,
  AdjacencyOverrideUpdatedEvent, AdjacencyOverrideRemovedEvent,
  AreaDiscoveredEvent
])
export type ServerEvent = z.infer<typeof ServerEvent>

export const ClientEvent = z.discriminatedUnion('type', [
  HelloEvent, ChatSendEvent, MoveRequestEvent, HistoryFetchEvent,
  MasterAreaEvent, MasterSpawnZombieEvent, MasterRemoveZombieEvent,
  MasterPlacePlayerEvent,
  MasterMoveZombieEvent, MasterSpawnZombiesEvent,
  VoiceOfferEvent, VoiceAnswerEvent, VoiceIceEvent, VoiceLeaveEvent,
  MasterDeleteMessageEvent, MasterPurgeMessageEvent, MasterEditMessageEvent,
  MasterMuteEvent, MasterUnmuteEvent,
  MasterKickEvent, MasterBanEvent, MasterUnbanEvent,
  MasterNpcEvent, MasterAnnounceEvent, MasterHiddenRollEvent,
  MasterWeatherOverrideEvent, MasterMovePlayerEvent,
  MasterFetchActionsEvent, MasterFetchBansEvent,
  MasterAreaRenameEvent, MasterAreaMoveEvent,
  MasterAreaAddEvent, MasterAreaRemoveEvent,
  MasterRoadAddEvent, MasterRoadRemoveEvent, MasterRoadResetEvent
])
export type ClientEvent = z.infer<typeof ClientEvent>
