import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { players, bans, partyMaps } from '~~/server/db/schema'
import { generateToken, generateUuid } from '~~/server/utils/crypto'
import { DomainError } from '~~/shared/errors'
import {
  partyMustExist, listMasters,
  countActivePartiesForUser
} from '~~/server/services/parties'
import { logMasterAction } from '~~/server/services/master-actions'
import {
  MAX_PARTIES_PER_USER, MAX_MEMBERS_PER_PARTY
} from '~~/shared/limits'
import { getSettingNumber } from '~~/server/services/system-settings'
import { findSpawnMap } from '~~/server/services/party-maps'
import { findMapType, parseDefaultParams } from '~~/server/services/map-types'
import { generate } from '~~/shared/map/generators'

export interface PlayerRow {
  id: string
  partySeed: string
  nickname: string
  role: 'user' | 'master'
  // v2d: currentMapId è la mappa attiva del player. Nullable finché T17 non
  // estende joinParty per impostarla allo spawn map della party.
  currentMapId: string | null
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
  // v2d (T16): mapId/areaId opzionali. Se omessi e la party ha una spawn
  // map, fallback su (spawnMap.id, spawnMap.spawnAreaId). Se la party non
  // ha spawn map (party legacy pre-T16), areaId default 'piazza' e
  // currentMapId resta null.
  mapId?: string
  areaId?: string
}

export function joinParty(db: Db, seed: string, displayName: string, opts: JoinPartyOptions): PlayerRow {
  partyMustExist(db, seed)
  const nick = displayName.trim()

  if (isBanned(db, seed, nick)) {
    throw new DomainError('banned', nick)
  }

  // v2b/v2c: limiti membership letti runtime da system_settings con
  // fallback sui default hard-coded in shared/limits.ts.
  // 1) party_limit: l'utente non deve avere già N party attive. Se ha
  //    lasciato e sta rientrando in una stessa party non contiamo doppio
  //    (rejoin sotto). Quindi consideriamo il limite solo quando NON
  //    esiste già una riga (active o inactive) per (party,user).
  const maxPartiesPerUser = getSettingNumber(db, 'limits.maxPartiesPerUser', MAX_PARTIES_PER_USER)
  const maxMembersPerParty = getSettingNumber(db, 'limits.maxMembersPerParty', MAX_MEMBERS_PER_PARTY)
  const existingForUser = findAnyPlayerRow(db, seed, opts.userId)
  if (!existingForUser) {
    const active = countActivePartiesForUser(db, opts.userId)
    if (active >= maxPartiesPerUser) {
      throw new DomainError('party_limit', `max ${maxPartiesPerUser}`)
    }
  }

  // 2) member_limit: la party non deve aver già N membri attivi (master
  //    inclusi).
  const memberCount = countActiveMembers(db, seed)
  if (memberCount >= maxMembersPerParty) {
    throw new DomainError('member_limit', `max ${maxMembersPerParty}`)
  }

  const conflict = findPlayerByNickname(db, seed, nick)
  if (conflict && (!existingForUser || conflict.id !== existingForUser.id)) {
    throw new DomainError('conflict', `nickname ${nick}`)
  }

  const sessionToken = generateToken(32)
  const now = Date.now()

  // v2d (T16): risoluzione spawn map.
  //   - opts.mapId esplicito → uso quello, areaId esplicito o spawnArea
  //     della mappa indicata.
  //   - opts.mapId omesso → cerco la spawn map della party. Se trovata,
  //     uso (spawnMap.id, generated.spawnAreaId).
  //   - nessuna spawn map (party legacy) → currentMapId=null,
  //     currentAreaId='piazza' come prima.
  const resolved = resolveSpawn(db, seed, opts)
  const targetMapId = resolved.mapId
  const targetAreaId = resolved.areaId

  // Rejoin: se esiste già una riga per (party,user) (anche se ha leftAt),
  // riusiamo l'id storico per non rompere i riferimenti dei messaggi
  // (authorPlayerId). Aggiorniamo nickname/leftAt/isKicked/joinedAt/...
  if (existingForUser) {
    db.update(players)
      .set({
        nickname: nick,
        role: existingForUser.role, // role storico preservato
        currentMapId: targetMapId,
        currentAreaId: targetAreaId,
        isMuted: false,
        mutedUntil: null,
        isKicked: false,
        joinedAt: now,
        lastSeenAt: now,
        sessionToken,
        leftAt: null
      })
      .where(eq(players.id, existingForUser.id))
      .run()
    return {
      id: existingForUser.id,
      partySeed: seed,
      nickname: nick,
      role: existingForUser.role,
      currentMapId: targetMapId,
      currentAreaId: targetAreaId,
      isMuted: false,
      mutedUntil: null,
      isKicked: false,
      joinedAt: now,
      lastSeenAt: now,
      sessionToken
    }
  }

  const id = generateUuid()
  db.insert(players).values({
    id,
    partySeed: seed,
    userId: opts.userId,
    nickname: nick,
    role: 'user',
    currentMapId: targetMapId,
    currentAreaId: targetAreaId,
    isMuted: false,
    mutedUntil: null,
    isKicked: false,
    joinedAt: now,
    lastSeenAt: now,
    sessionToken
  }).run()

  return {
    id, partySeed: seed, nickname: nick, role: 'user',
    currentMapId: targetMapId,
    currentAreaId: targetAreaId,
    isMuted: false, mutedUntil: null,
    isKicked: false, joinedAt: now, lastSeenAt: now, sessionToken
  }
}

// v2d (T16): risolve (mapId, areaId) per joinParty in funzione degli
// override del chiamante e dello spawn map della party. Estratto perché
// usato sia nel branch rejoin sia in quello insert.
function resolveSpawn(
  db: Db, seed: string, opts: JoinPartyOptions
): { mapId: string | null, areaId: string } {
  if (opts.mapId !== undefined) {
    // Caller esplicito: rispetta mapId. Se areaId mancante, prova a
    // calcolarlo dalla GeneratedMap del map type associato.
    const areaId = opts.areaId ?? deriveSpawnAreaForMap(db, opts.mapId) ?? 'piazza'
    return { mapId: opts.mapId, areaId }
  }
  const spawn = findSpawnMap(db, seed)
  if (!spawn) {
    return { mapId: null, areaId: opts.areaId ?? 'piazza' }
  }
  if (opts.areaId !== undefined) {
    return { mapId: spawn.id, areaId: opts.areaId }
  }
  const areaId = deriveSpawnAreaForMap(db, spawn.id) ?? 'piazza'
  return { mapId: spawn.id, areaId }
}

function deriveSpawnAreaForMap(db: Db, mapId: string): string | null {
  // Lookup partyMap row + map type → genera la mappa per leggere lo
  // spawnAreaId. Le chiamate sono cacheate in shared/map/generators.
  const map = db.select().from(partyMaps).where(eq(partyMaps.id, mapId)).get() as
    { id: string, mapTypeId: string, mapSeed: string } | undefined
  if (!map) return null
  const type = findMapType(db, map.mapTypeId)
  if (!type) return null
  const generated = generate(map.mapTypeId, map.mapSeed, parseDefaultParams(type))
  return generated.spawnAreaId
}

// Trova una riga players per (party,user) ignorando leftAt/isKicked. Serve
// per il rejoin logic del joinParty.
function findAnyPlayerRow(db: Db, seed: string, userId: string): PlayerRow | null {
  const rows = db.select().from(players)
    .where(and(eq(players.partySeed, seed), eq(players.userId, userId)))
    .all()
  return (rows[0] as PlayerRow | undefined) ?? null
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

export function findPlayerBySession(db: Db, seed: string, sessionToken: string): PlayerRow | null {
  const rows = db.select().from(players)
    .where(and(eq(players.partySeed, seed), eq(players.sessionToken, sessionToken)))
    .all()
  return (rows[0] as PlayerRow | undefined) ?? null
}

// v2a: lookup del player della party a partire dall'utenza autenticata,
// usato dal WS /ws/party dopo aver risolto l'identità dal cookie.
// v2b: filtra anche righe con leftAt (membership cessata) e kickate.
export function findPlayerByUserInParty(db: Db, seed: string, userId: string): PlayerRow | null {
  const rows = db.select().from(players)
    .where(and(
      eq(players.partySeed, seed),
      eq(players.userId, userId),
      isNull(players.leftAt)
    ))
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

// v2d: updatePlayerArea può aggiornare anche la mappa corrente in caso di
// cross-map move. Quando mapId è undefined non tocca currentMapId; quando è
// stringa lo aggiorna insieme ad areaId. T16 farà il refactor strutturale.
export function updatePlayerArea(db: Db, playerId: string, areaId: string, mapId?: string) {
  if (mapId !== undefined) {
    db.update(players)
      .set({ currentAreaId: areaId, currentMapId: mapId })
      .where(eq(players.id, playerId))
      .run()
    return
  }
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

// v2b: l'utente lascia la party (soft-delete con leftAt). Se è l'unico
// master attivo, blocca con 'last_master' — deve prima promuoverne un altro.
export function leaveParty(db: Db, seed: string, userId: string): void {
  const me = findPlayerByUserInParty(db, seed, userId)
  if (!me) throw new DomainError('not_found', `not member of ${seed}`)
  if (me.role === 'master') {
    const masters = listMasters(db, seed)
    if (masters.length <= 1) {
      throw new DomainError('last_master', 'promote another master before leaving')
    }
  }
  db.update(players)
    .set({ leftAt: Date.now() })
    .where(eq(players.id, me.id))
    .run()
}

// v2b: promuove un membro a master. Audit master_actions con target=userId.
// Non c'è check di role precedente: idempotente per design (set role='master').
export function promoteToMaster(
  db: Db,
  seed: string,
  targetUserId: string,
  byUserId: string
): void {
  const target = findPlayerByUserInParty(db, seed, targetUserId)
  if (!target) throw new DomainError('not_found', `target not member`)
  const me = findPlayerByUserInParty(db, seed, byUserId)
  if (!me) throw new DomainError('forbidden', 'not member')
  db.update(players)
    .set({ role: 'master' })
    .where(eq(players.id, target.id))
    .run()
  logMasterAction(db, {
    partySeed: seed,
    masterId: me.id,
    action: 'promote',
    target: target.id,
    payload: { targetUserId, prevRole: target.role }
  })
}

// v2b: demote da master a user. Vieta se è l'ultimo master attivo.
export function demoteFromMaster(
  db: Db,
  seed: string,
  targetUserId: string,
  byUserId: string
): void {
  const target = findPlayerByUserInParty(db, seed, targetUserId)
  if (!target) throw new DomainError('not_found', `target not member`)
  if (target.role !== 'master') {
    throw new DomainError('conflict', 'target is not master')
  }
  const me = findPlayerByUserInParty(db, seed, byUserId)
  if (!me) throw new DomainError('forbidden', 'not member')
  const masters = listMasters(db, seed)
  if (masters.length <= 1) {
    throw new DomainError('last_master', 'cannot demote the only master')
  }
  db.update(players)
    .set({ role: 'user' })
    .where(eq(players.id, target.id))
    .run()
  logMasterAction(db, {
    partySeed: seed,
    masterId: me.id,
    action: 'demote',
    target: target.id,
    payload: { targetUserId }
  })
}
