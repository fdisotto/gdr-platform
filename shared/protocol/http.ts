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
