import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { users, parties, messages, authEvents, dailyMetrics } from '~~/server/db/schema'
import {
  computeDailyMetrics, upsertDailyMetrics, getDailyMetrics,
  listDailyMetrics, recoverMissingDays
} from '~~/server/services/daily-metrics'
import { generateUuid } from '~~/server/utils/crypto'

let db: Db
beforeEach(() => {
  db = createTestDb()
})

function tsForDate(dateStr: string, hour = 12): number {
  // Costruisce un timestamp UTC dato YYYY-MM-DD a hour:00:00
  const [y, m, d] = dateStr.split('-').map(n => Number(n))
  return Date.UTC(y!, m! - 1, d!, hour, 0, 0)
}

function seedUser(status: 'pending' | 'approved' | 'banned', createdAt: number) {
  db.insert(users).values({
    id: generateUuid(),
    username: `u${createdAt}`,
    usernameLower: `u${createdAt}`,
    passwordHash: 'h',
    mustReset: false,
    status,
    createdAt
  }).run()
}

function seedParty(archivedAt: number | null, createdAt: number): string {
  const seed = generateUuid()
  db.insert(parties).values({
    seed,
    masterTokenHash: 'h',
    cityName: 'X',
    createdAt,
    lastActivityAt: createdAt,
    visibility: 'public',
    joinPolicy: 'auto',
    archivedAt
  }).run()
  return seed
}

function seedMessage(createdAt: number, seed: string) {
  db.insert(messages).values({
    id: generateUuid(),
    partySeed: seed,
    kind: 'say',
    authorPlayerId: null,
    authorDisplay: 'a',
    areaId: 'piazza',
    targetPlayerId: null,
    body: 'b',
    rollPayload: null,
    createdAt,
    deletedAt: null,
    deletedBy: null,
    editedAt: null
  }).run()
}

function seedAuthEvent(event: 'login' | 'login_failed', createdAt: number) {
  db.insert(authEvents).values({
    id: generateUuid(),
    actorKind: 'anonymous',
    actorId: null,
    usernameAttempted: 'x',
    event,
    ip: null,
    userAgent: null,
    detail: null,
    createdAt
  }).run()
}

describe('daily-metrics service', () => {
  it('computeDailyMetrics aggrega counts correttamente per il giorno richiesto', () => {
    const target = '2026-04-23'
    // utenti
    seedUser('pending', tsForDate(target, 9))
    seedUser('approved', tsForDate(target, 10))
    seedUser('approved', tsForDate('2026-04-22', 5))
    seedUser('banned', tsForDate('2026-04-22', 6))
    // party
    const p1 = seedParty(null, tsForDate('2026-04-22', 5))
    seedParty(null, tsForDate(target, 8))
    seedParty(tsForDate(target, 11), tsForDate('2026-04-21', 5))
    // messaggi: 2 dentro target, 1 fuori (riutilizziamo party esistente)
    seedMessage(tsForDate(target, 9), p1)
    seedMessage(tsForDate(target, 22), p1)
    seedMessage(tsForDate('2026-04-22', 12), p1)
    // auth events: 3 login success target + 2 fail target + 1 success fuori
    seedAuthEvent('login', tsForDate(target, 7))
    seedAuthEvent('login', tsForDate(target, 14))
    seedAuthEvent('login', tsForDate(target, 23))
    seedAuthEvent('login_failed', tsForDate(target, 8))
    seedAuthEvent('login_failed', tsForDate(target, 15))
    seedAuthEvent('login', tsForDate('2026-04-22', 14))

    const row = computeDailyMetrics(db, target)
    expect(row.date).toBe(target)
    expect(row.usersTotal).toBe(4)
    expect(row.usersPending).toBe(1)
    expect(row.usersApproved).toBe(2)
    expect(row.usersBanned).toBe(1)
    expect(row.partiesTotal).toBe(3)
    expect(row.partiesActive).toBe(2)
    expect(row.partiesArchived).toBe(1)
    expect(row.messagesNew).toBe(2)
    expect(row.authLoginSuccess).toBe(3)
    expect(row.authLoginFailed).toBe(2)
    expect(row.computedAt).toBeGreaterThan(0)
  })

  it('upsertDailyMetrics persiste e getDailyMetrics rilegge', () => {
    const date = '2026-04-20'
    const row = computeDailyMetrics(db, date)
    upsertDailyMetrics(db, row)
    const got = getDailyMetrics(db, date)
    expect(got).not.toBeNull()
    expect(got!.date).toBe(date)
    expect(got!.usersTotal).toBe(0)
  })

  it('upsertDailyMetrics rimpiazza stessa data (replace)', () => {
    const date = '2026-04-20'
    const r1 = computeDailyMetrics(db, date)
    upsertDailyMetrics(db, r1)
    seedUser('approved', tsForDate(date, 10))
    const r2 = computeDailyMetrics(db, date)
    upsertDailyMetrics(db, r2)
    const got = getDailyMetrics(db, date)
    expect(got!.usersTotal).toBe(1)
  })

  it('listDailyMetrics ritorna range incluso ordine asc', () => {
    upsertDailyMetrics(db, { ...computeDailyMetrics(db, '2026-04-20') })
    upsertDailyMetrics(db, { ...computeDailyMetrics(db, '2026-04-21') })
    upsertDailyMetrics(db, { ...computeDailyMetrics(db, '2026-04-22') })
    const rows = listDailyMetrics(db, '2026-04-20', '2026-04-21')
    expect(rows.map(r => r.date)).toEqual(['2026-04-20', '2026-04-21'])
  })

  it('recoverMissingDays inserisce solo i giorni mancanti negli ultimi N', () => {
    // ipotesi: oggi è una certa data — usiamo today UTC come reference
    const todayUtc = new Date()
    const yesterday = new Date(Date.UTC(
      todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate() - 1
    ))
    // pre-popola un giorno → recover dovrebbe saltarlo
    const yIso = yesterday.toISOString().slice(0, 10)
    upsertDailyMetrics(db, computeDailyMetrics(db, yIso))

    const inserted = recoverMissingDays(db, 5)
    // 5 giorni totali, 1 già presente → ne inserisce 4
    expect(inserted).toBe(4)

    const all = db.select().from(dailyMetrics).all()
    expect(all.length).toBe(5)

    // idempotenza: un secondo run non inserisce nulla
    expect(recoverMissingDays(db, 5)).toBe(0)
  })

  it('recoverMissingDays non include il giorno odierno (non ancora chiuso)', () => {
    recoverMissingDays(db, 3)
    const todayUtc = new Date()
    const todayIso = new Date(Date.UTC(
      todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate()
    )).toISOString().slice(0, 10)
    expect(getDailyMetrics(db, todayIso)).toBeNull()
  })
})
