import { z } from 'zod'

export const NICKNAME_REGEX = /^[a-zA-Z0-9 _-]+$/

const Nickname = z.string().min(2).max(24).regex(NICKNAME_REGEX).trim()

// v2a: il nickname del master ha perso ogni funzione d'identità (sostituito
// dall'account user); resta solo come display name visibile nella party.
// Lo spec v2a lo omette dal body di create, ma serve comunque per il player
// master creato contestualmente — se non lo passassimo il server dovrebbe
// inventarsi un fallback (es. username), mischiando identità e display.
// v2b: visibility/joinPolicy opzionali; default lato service = private+request.
export const PartyVisibility = z.enum(['public', 'private'])
export type PartyVisibility = z.infer<typeof PartyVisibility>

export const PartyJoinPolicy = z.enum(['auto', 'request'])
export type PartyJoinPolicy = z.infer<typeof PartyJoinPolicy>

export const CreatePartyBody = z.object({
  displayName: Nickname,
  cityName: z.string().min(1).max(64).optional(),
  visibility: PartyVisibility.optional(),
  joinPolicy: PartyJoinPolicy.optional()
})
export type CreatePartyBody = z.infer<typeof CreatePartyBody>

// v2b: inviteToken? su join consente l'accesso a private (bypass policy)
// e a public con joinPolicy=request senza creare richiesta.
export const JoinPartyBody = z.object({
  displayName: Nickname,
  inviteToken: z.string().min(8).max(128).optional()
})
export type JoinPartyBody = z.infer<typeof JoinPartyBody>

// v2b: query string del browser /api/parties. Tutti i campi opzionali.
// Coercion stringa→numero per limit (arriva sempre come stringa da URL).
export const BrowserQueryParams = z.object({
  sort: z.enum(['lastActivity', 'members', 'recent']).optional(),
  q: z.string().max(64).optional(),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  // filtri come stringhe truthy (presenza implica true). UI passa "1" o "true".
  mine: z.union([z.literal('1'), z.literal('true')]).optional(),
  auto: z.union([z.literal('1'), z.literal('true')]).optional(),
  withSlots: z.union([z.literal('1'), z.literal('true')]).optional()
})
export type BrowserQueryParams = z.infer<typeof BrowserQueryParams>

export const JoinRequestCreateBody = z.object({
  displayName: Nickname,
  message: z.string().max(500).optional()
})
export type JoinRequestCreateBody = z.infer<typeof JoinRequestCreateBody>

export const RejectRequestBody = z.object({
  reason: z.string().max(500).optional()
})
export type RejectRequestBody = z.infer<typeof RejectRequestBody>

export const PromoteBody = z.object({
  targetUserId: z.string().min(1).max(64)
})
export type PromoteBody = z.infer<typeof PromoteBody>

export const CreateInviteResponse = z.object({
  id: z.string(),
  token: z.string(),
  url: z.string(),
  expiresAt: z.number().int()
})
export type CreateInviteResponse = z.infer<typeof CreateInviteResponse>

// v2a auth: schemi per registrazione, login, cambio password.
export const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/
const Username = z.string().min(3).max(32).regex(USERNAME_REGEX)
const Password = z.string().min(8).max(256)

export const RegisterBody = z.object({
  username: Username,
  password: Password
})
export type RegisterBody = z.infer<typeof RegisterBody>

export const LoginBody = z.object({
  username: Username,
  // Niente regex su password in login: validazione reale è la verify
  password: z.string().min(1).max(256)
})
export type LoginBody = z.infer<typeof LoginBody>

export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: Password
})
export type ChangePasswordBody = z.infer<typeof ChangePasswordBody>

export const BanUserBody = z.object({
  reason: z.string().max(500).optional()
})
export type BanUserBody = z.infer<typeof BanUserBody>

export const RejectRegistrationBody = z.object({
  reason: z.string().max(500).optional()
})
export type RejectRegistrationBody = z.infer<typeof RejectRegistrationBody>

export const MeResponse = z.object({
  kind: z.enum(['user', 'superadmin']),
  id: z.string(),
  username: z.string(),
  mustReset: z.boolean()
})
export type MeResponse = z.infer<typeof MeResponse>
