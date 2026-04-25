import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { parties, players, areasState, partyJoinRequests } from '~~/server/db/schema'
import { MAX_MEMBERS_PER_PARTY } from '~~/shared/limits'
import { getSettingNumber } from '~~/server/services/system-settings'
import { deriveCityState, type CityState } from '~~/shared/seed/derive-city'
import {
  generateToken, generateUuid, hashMasterToken, verifyMasterToken
} from '~~/server/utils/crypto'
import { DomainError } from '~~/shared/errors'

export type PartyVisibility = 'public' | 'private'
export type PartyJoinPolicy = 'auto' | 'request'

export interface CreatePartyInput {
  userId: string
  displayName: string
  // cityName non è ancora usato nella derivazione (deriveCityState è
  // deterministica sul seed); lo accettiamo per compat con l'endpoint.
  cityName?: string
  // v2b: default come da schema (private + request) quando non specificati.
  visibility?: PartyVisibility
  joinPolicy?: PartyJoinPolicy
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
  const displayName = input.displayName.trim()

  const cityState = deriveCityState(seed)

  db.insert(parties).values({
    seed,
    masterTokenHash: hash,
    cityName: cityState.cityName,
    createdAt: now,
    lastActivityAt: now,
    visibility: input.visibility ?? 'private',
    joinPolicy: input.joinPolicy ?? 'request'
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
    userId: input.userId,
    nickname: displayName,
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
      nickname: displayName,
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

export function archiveParty(db: Db, seed: string): void {
  db.update(parties)
    .set({ archivedAt: Date.now() })
    .where(eq(parties.seed, seed))
    .run()
}

export function restoreParty(db: Db, seed: string): void {
  db.update(parties)
    .set({ archivedAt: null })
    .where(eq(parties.seed, seed))
    .run()
}

// v2c: hard delete della party. FK CASCADE su tutte le tabelle dipendenti
// (players, messages, areas_state, area_access_bans, weather_overrides,
// master_actions, bans, zombies, player_positions, party_invites,
// party_join_requests). Operazione irreversibile, esposta solo dall'admin
// API con conferma esplicita.
export function hardDeleteParty(db: Db, seed: string): void {
  db.delete(parties).where(eq(parties.seed, seed)).run()
}

// v2c: trasferisce il ruolo di master da un player attivo a un altro membro
// attivo della stessa party. Throw se le pre-condizioni non sono rispettate.
// Non logghiamo `master_actions` perché l'azione è admin-driven (audit
// dedicato in `admin_actions`).
export function transferMaster(
  db: Db, seed: string, fromUserId: string, toUserId: string
): void {
  partyMustExist(db, seed)
  if (fromUserId === toUserId) {
    throw new DomainError('invalid_payload', 'fromUserId === toUserId')
  }
  const fromRows = db.select().from(players)
    .where(and(
      eq(players.partySeed, seed),
      eq(players.userId, fromUserId),
      eq(players.role, 'master'),
      isNull(players.leftAt),
      eq(players.isKicked, false)
    ))
    .all()
  if (fromRows.length === 0) {
    throw new DomainError('not_found', 'fromUserId not active master')
  }
  const toRows = db.select().from(players)
    .where(and(
      eq(players.partySeed, seed),
      eq(players.userId, toUserId),
      isNull(players.leftAt),
      eq(players.isKicked, false)
    ))
    .all()
  if (toRows.length === 0) {
    throw new DomainError('not_found', 'toUserId not active member')
  }
  db.update(players)
    .set({ role: 'user' })
    .where(eq(players.id, (fromRows[0] as { id: string }).id))
    .run()
  db.update(players)
    .set({ role: 'master' })
    .where(eq(players.id, (toRows[0] as { id: string }).id))
    .run()
}

// v2b: una membership "attiva" = riga players con leftAt IS NULL e
// isKicked=false. Il count opera su righe distinte (party,user). I master
// contano come membri.
export function countActivePartiesForUser(db: Db, userId: string): number {
  const rows = db.select({
    seed: players.partySeed
  }).from(players)
    .where(and(
      eq(players.userId, userId),
      isNull(players.leftAt),
      eq(players.isKicked, false)
    ))
    .all() as { seed: string }[]
  // Una sola riga attiva per (party,user) per costruzione, ma usiamo Set
  // come difesa in profondità contro eventuali residui.
  return new Set(rows.map(r => r.seed)).size
}

export function isMaster(db: Db, seed: string, userId: string): boolean {
  const rows = db.select().from(players)
    .where(and(
      eq(players.partySeed, seed),
      eq(players.userId, userId),
      eq(players.role, 'master'),
      isNull(players.leftAt),
      eq(players.isKicked, false)
    ))
    .all()
  return rows.length > 0
}

export interface MasterPlayerRow {
  id: string
  userId: string
  nickname: string
  joinedAt: number
}

export function listMasters(db: Db, seed: string): MasterPlayerRow[] {
  return db.select({
    id: players.id,
    userId: players.userId,
    nickname: players.nickname,
    joinedAt: players.joinedAt
  }).from(players)
    .where(and(
      eq(players.partySeed, seed),
      eq(players.role, 'master'),
      isNull(players.leftAt),
      eq(players.isKicked, false)
    ))
    .orderBy(asc(players.joinedAt))
    .all() as MasterPlayerRow[]
}

export type BrowserSort = 'lastActivity' | 'members' | 'recent'

export interface BrowserFilters {
  mine?: boolean
  auto?: boolean
  withSlots?: boolean
}

export interface BrowserOpts {
  userId: string
  sort?: BrowserSort
  filters?: BrowserFilters
  q?: string
  cursor?: string
  limit?: number
}

export interface BrowserItem {
  seed: string
  cityName: string
  visibility: PartyVisibility
  joinPolicy: PartyJoinPolicy
  memberCount: number
  masterDisplays: string[]
  lastActivityAt: number
  isMember: boolean
  hasPendingRequest: boolean
}

export interface BrowserPage {
  items: BrowserItem[]
  nextCursor: string | null
}

// Cursor è il `lastActivityAt:seed` della riga finale, codifica numerica
// per evitare ambiguità di parse e tie-break sul seed. listPartiesForBrowser
// applica i filtri post-query in 2 step quando servono aggregati per evitare
// JOIN complessi su SQLite — accettabile per scale MVP (≤100 party).
export function listPartiesForBrowser(db: Db, opts: BrowserOpts): BrowserPage {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100)
  const sort = opts.sort ?? 'lastActivity'
  const filters = opts.filters ?? {}

  // Step 1: shortlist party non archiviate, applichiamo filtro visibility e
  // ricerca su cityName a livello SQL. Per il filtro `mine` partiamo dalla
  // membership attiva.
  const allParties = db.select().from(parties)
    .where(isNull(parties.archivedAt))
    .all()

  const myMembership = db.select({ seed: players.partySeed }).from(players)
    .where(and(
      eq(players.userId, opts.userId),
      isNull(players.leftAt),
      eq(players.isKicked, false)
    ))
    .all() as { seed: string }[]
  const mySeeds = new Set(myMembership.map(r => r.seed))

  const pendingSeeds = new Set(
    listPendingRequestSeedsForUser(db, opts.userId)
  )

  // Filtra per visibility/q/membership
  const q = opts.q?.trim().toLowerCase() ?? ''
  const filtered = allParties.filter((p) => {
    // private visibili solo se membership
    if (p.visibility === 'private' && !mySeeds.has(p.seed)) return false
    if (q && !p.cityName.toLowerCase().includes(q)) return false
    if (filters.mine && !mySeeds.has(p.seed)) return false
    if (filters.auto && p.joinPolicy !== 'auto') return false
    return true
  })

  // Hydrate aggregati: memberCount + masterDisplays per ogni party rimasta.
  const items: BrowserItem[] = filtered.map((p) => {
    const memberCount = countActiveMembers(db, p.seed)
    const masters = listMasters(db, p.seed)
    return {
      seed: p.seed,
      cityName: p.cityName,
      visibility: p.visibility as PartyVisibility,
      joinPolicy: p.joinPolicy as PartyJoinPolicy,
      memberCount,
      masterDisplays: masters.map(m => m.nickname),
      lastActivityAt: p.lastActivityAt,
      isMember: mySeeds.has(p.seed),
      hasPendingRequest: pendingSeeds.has(p.seed)
    }
  })

  // withSlots dopo aver calcolato memberCount: limite runtime da settings.
  const maxMembers = getSettingNumber(db, 'limits.maxMembersPerParty', MAX_MEMBERS_PER_PARTY)
  const slotted = filters.withSlots
    ? items.filter(i => i.memberCount < maxMembers)
    : items

  // Sort
  if (sort === 'members') {
    slotted.sort((a, b) => b.memberCount - a.memberCount || b.lastActivityAt - a.lastActivityAt)
  } else if (sort === 'recent') {
    // recent = creazione recente. usiamo lastActivityAt come proxy se non
    // abbiamo createdAt qui — recuperiamolo dalla shortlist.
    const createdMap = new Map(allParties.map(p => [p.seed, p.createdAt]))
    slotted.sort((a, b) =>
      (createdMap.get(b.seed) ?? 0) - (createdMap.get(a.seed) ?? 0)
    )
  } else {
    slotted.sort((a, b) => b.lastActivityAt - a.lastActivityAt || a.seed.localeCompare(b.seed))
  }

  // Cursor: numero+seed tie-break. Ignoriamo il cursor per gli altri sort
  // (semplificazione MVP: il browser usa lastActivity by default).
  let startIdx = 0
  if (opts.cursor && sort === 'lastActivity') {
    const [tsStr, cseed] = opts.cursor.split(':')
    const ts = Number(tsStr)
    if (Number.isFinite(ts)) {
      startIdx = slotted.findIndex(i =>
        i.lastActivityAt < ts || (i.lastActivityAt === ts && i.seed > (cseed ?? ''))
      )
      if (startIdx < 0) startIdx = slotted.length
    }
  }

  const pageItems = slotted.slice(startIdx, startIdx + limit)
  const nextCursor = startIdx + limit < slotted.length
    ? `${pageItems.at(-1)!.lastActivityAt}:${pageItems.at(-1)!.seed}`
    : null
  return { items: pageItems, nextCursor }
}

function countActiveMembers(db: Db, seed: string): number {
  const rows = db.select({ id: players.id }).from(players)
    .where(and(
      eq(players.partySeed, seed),
      isNull(players.leftAt),
      eq(players.isKicked, false)
    ))
    .all()
  return rows.length
}

function listPendingRequestSeedsForUser(db: Db, userId: string): string[] {
  const rows = db.select({ seed: partyJoinRequests.partySeed }).from(partyJoinRequests)
    .where(and(
      eq(partyJoinRequests.userId, userId),
      eq(partyJoinRequests.status, 'pending')
    ))
    .all() as { seed: string }[]
  return rows.map(r => r.seed)
}
