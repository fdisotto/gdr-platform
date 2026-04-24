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
  body: z.string().max(2000),
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

export const StateInitEvent = z.object({
  type: z.literal('state:init'),
  me: PlayerSnapshot,
  party: PartySnapshot,
  players: z.array(PlayerSnapshot),
  areasState: z.array(AreaStateSnapshot),
  messagesByArea: z.record(z.array(MessageRowSchema)),
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

export const ServerEvent = z.discriminatedUnion('type', [
  StateInitEvent, MessageNewEvent, TimeTickEvent, ServerErrorEvent,
  PlayerJoinedEvent, PlayerLeftEvent, PlayerMovedEvent,
  AreaUpdatedEvent, WeatherUpdatedEvent, HistoryBatchEvent
])
export type ServerEvent = z.infer<typeof ServerEvent>

export const ClientEvent = z.discriminatedUnion('type', [
  HelloEvent, ChatSendEvent, MoveRequestEvent, HistoryFetchEvent
])
export type ClientEvent = z.infer<typeof ClientEvent>
