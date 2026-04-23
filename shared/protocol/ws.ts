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
