import { z } from 'zod'
import { ERROR_CODES } from '~~/shared/errors'

export const MESSAGE_KINDS = [
  'say', 'whisper', 'emote', 'ooc', 'roll', 'shout', 'dm', 'npc', 'announce', 'system'
] as const
export type MessageKind = typeof MESSAGE_KINDS[number]

// Zod v4: top-level z.uuid() per stringhe UUID
const UuidSeed = z.uuid()

export const HelloEvent = z.object({
  type: z.literal('hello'),
  seed: UuidSeed,
  sessionToken: z.string().min(1).max(256)
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
  currentAreaId: z.string()
})

const PartySnapshot = z.object({
  seed: z.string(),
  cityName: z.string(),
  createdAt: z.number(),
  lastActivityAt: z.number()
})

const AreaStateSnapshot = z.object({
  partySeed: z.string(),
  areaId: z.string(),
  status: z.enum(['intact', 'infested', 'ruined', 'closed']),
  customName: z.string().nullable(),
  notes: z.string().nullable()
})

export const PlayerPositionSchema = z.object({
  playerId: z.string(),
  areaId: z.string(),
  x: z.number(),
  y: z.number()
})
export type PlayerPosition = z.infer<typeof PlayerPositionSchema>

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
    areaId: z.string(),
    x: z.number(),
    y: z.number(),
    spawnedAt: z.number()
  })),
  playerPositions: z.array(PlayerPositionSchema),
  serverTime: z.number()
})
export type StateInitEvent = z.infer<typeof StateInitEvent>

export const MoveRequestEvent = z.object({
  type: z.literal('move:request'),
  toAreaId: z.string()
})
export type MoveRequestEvent = z.infer<typeof MoveRequestEvent>

const PlayerSnapshotSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  role: z.enum(['user', 'master']),
  currentAreaId: z.string()
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
  teleported: z.boolean()
})
export type PlayerMovedEvent = z.infer<typeof PlayerMovedEvent>

const AreaStateSnapshotSchema = z.object({
  partySeed: z.string(),
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
  effective: WeatherStateSchema
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
  areaId: z.string(),
  x: z.number(),
  y: z.number(),
  spawnedAt: z.number()
})
export type Zombie = z.infer<typeof ZombieSchema>

export const MasterSpawnZombieEvent = z.object({
  type: z.literal('master:spawn-zombie'),
  areaId: z.string(),
  x: z.number(),
  y: z.number()
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
  MessageUpdateEvent, PlayerMutedEvent, KickedEvent
])
export type ServerEvent = z.infer<typeof ServerEvent>

export const ClientEvent = z.discriminatedUnion('type', [
  HelloEvent, ChatSendEvent, MoveRequestEvent, HistoryFetchEvent,
  MasterAreaEvent, MasterSpawnZombieEvent, MasterRemoveZombieEvent,
  MasterPlacePlayerEvent,
  MasterMoveZombieEvent, MasterSpawnZombiesEvent,
  VoiceOfferEvent, VoiceAnswerEvent, VoiceIceEvent, VoiceLeaveEvent,
  MasterDeleteMessageEvent, MasterEditMessageEvent,
  MasterMuteEvent, MasterUnmuteEvent,
  MasterKickEvent, MasterBanEvent, MasterUnbanEvent
])
export type ClientEvent = z.infer<typeof ClientEvent>
