import { z } from 'zod'

export const NICKNAME_REGEX = /^[a-zA-Z0-9 _-]+$/

const Nickname = z.string().min(2).max(24).regex(NICKNAME_REGEX).trim()

// v2a: il nickname del master ha perso ogni funzione d'identità (sostituito
// dall'account user); resta solo come display name visibile nella party.
// Lo spec v2a lo omette dal body di create, ma serve comunque per il player
// master creato contestualmente — se non lo passassimo il server dovrebbe
// inventarsi un fallback (es. username), mischiando identità e display.
export const CreatePartyBody = z.object({
  displayName: Nickname,
  cityName: z.string().min(1).max(64).optional()
})
export type CreatePartyBody = z.infer<typeof CreatePartyBody>

export const JoinPartyBody = z.object({
  displayName: Nickname
})
export type JoinPartyBody = z.infer<typeof JoinPartyBody>

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
