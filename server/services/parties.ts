import { eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { parties, players, areasState } from '~~/server/db/schema'
import { deriveCityState, type CityState } from '~~/shared/seed/derive-city'
import {
  generateToken, generateUuid, hashMasterToken, verifyMasterToken
} from '~~/server/utils/crypto'
import { DomainError } from '~~/shared/errors'

export interface CreatePartyInput {
  masterNickname: string
}

export interface CreatePartyResult {
  seed: string
  masterToken: string
  sessionToken: string
  masterPlayer: {
    id: string
    nickname: string
    role: 'master'
    currentAreaId: string
  }
  cityState: CityState
}

export async function createParty(db: Db, input: CreatePartyInput): Promise<CreatePartyResult> {
  const seed = generateUuid()
  const masterToken = generateToken(32)
  const hash = await hashMasterToken(masterToken)
  const now = Date.now()

  const cityState = deriveCityState(seed)

  db.insert(parties).values({
    seed,
    masterTokenHash: hash,
    cityName: cityState.cityName,
    createdAt: now,
    lastActivityAt: now
  }).run()

  const areaRows = Object.entries(cityState.areas).map(([areaId, s]) => ({
    partySeed: seed,
    areaId,
    status: s.status,
    customName: s.customName,
    notes: null
  }))
  db.insert(areasState).values(areaRows).run()

  const masterId = generateUuid()
  const sessionToken = generateToken(32)
  db.insert(players).values({
    id: masterId,
    partySeed: seed,
    nickname: input.masterNickname.trim(),
    role: 'master',
    currentAreaId: 'piazza',
    isMuted: false,
    mutedUntil: null,
    isKicked: false,
    joinedAt: now,
    lastSeenAt: now,
    sessionToken
  }).run()

  return {
    seed,
    masterToken,
    sessionToken,
    masterPlayer: {
      id: masterId,
      nickname: input.masterNickname.trim(),
      role: 'master',
      currentAreaId: 'piazza'
    },
    cityState
  }
}

export function findParty(db: Db, seed: string) {
  const rows = db.select().from(parties).where(eq(parties.seed, seed)).all()
  return rows[0] ?? null
}

export async function verifyMaster(db: Db, seed: string, masterToken: string): Promise<boolean> {
  const p = findParty(db, seed)
  if (!p) return false
  return verifyMasterToken(masterToken, p.masterTokenHash)
}

export function touchParty(db: Db, seed: string) {
  db.update(parties)
    .set({ lastActivityAt: Date.now() })
    .where(eq(parties.seed, seed))
    .run()
}

export function partyMustExist(db: Db, seed: string) {
  const p = findParty(db, seed)
  if (!p) throw new DomainError('not_found', `party ${seed}`)
  return p
}
