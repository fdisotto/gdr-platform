import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { players, bans } from '~~/server/db/schema'
import { generateToken, generateUuid } from '~~/server/utils/crypto'
import { DomainError } from '~~/shared/errors'
import { partyMustExist } from '~~/server/services/parties'

export interface PlayerRow {
  id: string
  partySeed: string
  nickname: string
  role: 'user' | 'master'
  currentAreaId: string
  isMuted: boolean
  mutedUntil: number | null
  isKicked: boolean
  joinedAt: number
  lastSeenAt: number
  sessionToken: string
}

export interface JoinPartyOptions {
  userId: string
}

export function joinParty(db: Db, seed: string, displayName: string, opts: JoinPartyOptions): PlayerRow {
  partyMustExist(db, seed)
  const nick = displayName.trim()

  if (isBanned(db, seed, nick)) {
    throw new DomainError('banned', nick)
  }

  const existing = findPlayerByNickname(db, seed, nick)
  if (existing) throw new DomainError('conflict', `nickname ${nick}`)

  const id = generateUuid()
  const sessionToken = generateToken(32)
  const now = Date.now()

  db.insert(players).values({
    id,
    partySeed: seed,
    userId: opts.userId,
    nickname: nick,
    role: 'user',
    currentAreaId: 'piazza',
    isMuted: false,
    mutedUntil: null,
    isKicked: false,
    joinedAt: now,
    lastSeenAt: now,
    sessionToken
  }).run()

  return {
    id, partySeed: seed, nickname: nick, role: 'user',
    currentAreaId: 'piazza', isMuted: false, mutedUntil: null,
    isKicked: false, joinedAt: now, lastSeenAt: now, sessionToken
  }
}

export function findPlayerBySession(db: Db, seed: string, sessionToken: string): PlayerRow | null {
  const rows = db.select().from(players)
    .where(and(eq(players.partySeed, seed), eq(players.sessionToken, sessionToken)))
    .all()
  return (rows[0] as PlayerRow | undefined) ?? null
}

// v2a: lookup del player della party a partire dall'utenza autenticata,
// usato dal WS /ws/party dopo aver risolto l'identità dal cookie.
// Ignora righe kickate.
export function findPlayerByUserInParty(db: Db, seed: string, userId: string): PlayerRow | null {
  const rows = db.select().from(players)
    .where(and(eq(players.partySeed, seed), eq(players.userId, userId)))
    .all()
  const row = rows[0] as PlayerRow | undefined
  if (!row) return null
  if (row.isKicked) return null
  return row
}

export function findPlayerByNickname(db: Db, seed: string, nickname: string): PlayerRow | null {
  const rows = db.select().from(players)
    .where(and(
      eq(players.partySeed, seed),
      sql`LOWER(${players.nickname}) = ${nickname.toLowerCase()}`
    ))
    .all()
  return (rows[0] as PlayerRow | undefined) ?? null
}

export function listOnlinePlayers(db: Db, seed: string): PlayerRow[] {
  return db.select().from(players)
    .where(and(eq(players.partySeed, seed), eq(players.isKicked, false)))
    .all() as PlayerRow[]
}

export function isBanned(db: Db, seed: string, nickname: string): boolean {
  const rows = db.select().from(bans)
    .where(and(eq(bans.partySeed, seed), eq(bans.nicknameLower, nickname.toLowerCase())))
    .all()
  return rows.length > 0
}

export function touchPlayer(db: Db, playerId: string, now: number = Date.now()) {
  db.update(players).set({ lastSeenAt: now }).where(eq(players.id, playerId)).run()
}

export function rotateSessionToken(db: Db, playerId: string): string {
  const token = generateToken(32)
  db.update(players).set({ sessionToken: token }).where(eq(players.id, playerId)).run()
  return token
}

export function findMaster(db: Db, seed: string): PlayerRow | null {
  const rows = db.select().from(players)
    .where(and(eq(players.partySeed, seed), eq(players.role, 'master')))
    .all()
  return (rows[0] as PlayerRow | undefined) ?? null
}

export function updatePlayerArea(db: Db, playerId: string, areaId: string) {
  db.update(players).set({ currentAreaId: areaId }).where(eq(players.id, playerId)).run()
}

export function setMute(db: Db, playerId: string, muted: boolean, mutedUntil: number | null = null) {
  db.update(players).set({
    isMuted: muted,
    mutedUntil: muted ? mutedUntil : null
  }).where(eq(players.id, playerId)).run()
}

export function kickPlayer(db: Db, playerId: string) {
  db.update(players).set({
    isKicked: true
  }).where(eq(players.id, playerId)).run()
}

export function findPlayerById(db: Db, seed: string, playerId: string): PlayerRow | null {
  const rows = db.select().from(players)
    .where(and(eq(players.partySeed, seed), eq(players.id, playerId)))
    .all()
  return (rows[0] as PlayerRow | undefined) ?? null
}
