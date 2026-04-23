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

export const ServerEvent = z.discriminatedUnion('type', [
  StateInitEvent, MessageNewEvent, TimeTickEvent, ServerErrorEvent
])
export type ServerEvent = z.infer<typeof ServerEvent>

export const ClientEvent = z.discriminatedUnion('type', [
  HelloEvent, ChatSendEvent
])
export type ClientEvent = z.infer<typeof ClientEvent>
