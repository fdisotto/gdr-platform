import { z } from 'zod'

export const NICKNAME_REGEX = /^[a-zA-Z0-9 _-]+$/

const Nickname = z.string().min(2).max(24).regex(NICKNAME_REGEX).trim()

export const CreatePartyBody = z.object({
  masterNickname: Nickname
})
export type CreatePartyBody = z.infer<typeof CreatePartyBody>

export const JoinPartyBody = z.object({
  nickname: Nickname
})
export type JoinPartyBody = z.infer<typeof JoinPartyBody>

export const ReclaimMasterBody = z.object({
  masterToken: z.string().min(1).max(256)
})
export type ReclaimMasterBody = z.infer<typeof ReclaimMasterBody>

export const ResumeBody = z.object({
  sessionToken: z.string().min(1).max(256)
})
export type ResumeBody = z.infer<typeof ResumeBody>

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
