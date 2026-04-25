import { and, asc, between, eq, gte, lt } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import {
  users, parties, messages, authEvents, dailyMetrics
} from '~~/server/db/schema'

export interface DailyMetricsRow {
  date: string
  usersTotal: number
  usersApproved: number
  usersPending: number
  usersBanned: number
  partiesTotal: number
  partiesActive: number
  partiesArchived: number
  messagesNew: number
  authLoginSuccess: number
  authLoginFailed: number
  computedAt: number
}

const DAY_MS = 86400_000

// Converte 'YYYY-MM-DD' in [startMs, endMs) UTC, dove end = start + 1 day.
function dayRangeUtc(date: string): { start: number, end: number } {
  const [y, m, d] = date.split('-').map(n => Number(n))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`invalid date: ${date}`)
  }
  const start = Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0)
  return { start, end: start + DAY_MS }
}

function isoFromMs(ms: number): string {
  const d = new Date(ms)
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  return utc.toISOString().slice(0, 10)
}

function countAll<T>(rows: T[]): number {
  return rows.length
}

// Aggrega tutti i counter del giorno richiesto (UTC) leggendo da tabelle live.
// I count by-status di users/parties sono "stato attuale" — coerente con la
// definizione spec (non snapshot storico, che richiederebbe history table).
export function computeDailyMetrics(db: Db, date: string): DailyMetricsRow {
  const { start, end } = dayRangeUtc(date)

  // users: count by status totali (stato corrente)
  const allUsers = db.select({ status: users.status }).from(users).all() as { status: string }[]
  let usersPending = 0, usersApproved = 0, usersBanned = 0
  for (const u of allUsers) {
    if (u.status === 'pending') usersPending++
    else if (u.status === 'approved') usersApproved++
    else if (u.status === 'banned') usersBanned++
  }

  // parties: count active vs archived (stato corrente)
  const allParties = db.select({ archivedAt: parties.archivedAt }).from(parties).all() as { archivedAt: number | null }[]
  let partiesActive = 0, partiesArchived = 0
  for (const p of allParties) {
    if (p.archivedAt == null) partiesActive++
    else partiesArchived++
  }

  // messaggi creati nel giorno
  const msgRows = db.select({ id: messages.id }).from(messages)
    .where(and(gte(messages.createdAt, start), lt(messages.createdAt, end)))
    .all()

  // auth events login/login_failed nel giorno
  const loginRows = db.select({ id: authEvents.id }).from(authEvents)
    .where(and(
      eq(authEvents.event, 'login'),
      gte(authEvents.createdAt, start),
      lt(authEvents.createdAt, end)
    )).all()
  const loginFailRows = db.select({ id: authEvents.id }).from(authEvents)
    .where(and(
      eq(authEvents.event, 'login_failed'),
      gte(authEvents.createdAt, start),
      lt(authEvents.createdAt, end)
    )).all()

  return {
    date,
    usersTotal: usersPending + usersApproved + usersBanned,
    usersApproved,
    usersPending,
    usersBanned,
    partiesTotal: partiesActive + partiesArchived,
    partiesActive,
    partiesArchived,
    messagesNew: countAll(msgRows),
    authLoginSuccess: countAll(loginRows),
    authLoginFailed: countAll(loginFailRows),
    computedAt: Date.now()
  }
}

export function upsertDailyMetrics(db: Db, row: DailyMetricsRow): void {
  // SQLite INSERT OR REPLACE via drizzle: eseguiamo SQL raw per usare
  // ON CONFLICT su date PK (REPLACE distrugge FK; qui non ci sono FK).
  const existing = db.select().from(dailyMetrics)
    .where(eq(dailyMetrics.date, row.date)).get()
  if (existing) {
    db.update(dailyMetrics).set({
      usersTotal: row.usersTotal,
      usersApproved: row.usersApproved,
      usersPending: row.usersPending,
      usersBanned: row.usersBanned,
      partiesTotal: row.partiesTotal,
      partiesActive: row.partiesActive,
      partiesArchived: row.partiesArchived,
      messagesNew: row.messagesNew,
      authLoginSuccess: row.authLoginSuccess,
      authLoginFailed: row.authLoginFailed,
      computedAt: row.computedAt
    }).where(eq(dailyMetrics.date, row.date)).run()
  } else {
    db.insert(dailyMetrics).values(row).run()
  }
}

export function getDailyMetrics(db: Db, date: string): DailyMetricsRow | null {
  const r = db.select().from(dailyMetrics)
    .where(eq(dailyMetrics.date, date))
    .get() as DailyMetricsRow | undefined
  return r ?? null
}

export function listDailyMetrics(db: Db, fromDate: string, toDate: string): DailyMetricsRow[] {
  return db.select().from(dailyMetrics)
    .where(between(dailyMetrics.date, fromDate, toDate))
    .orderBy(asc(dailyMetrics.date))
    .all() as DailyMetricsRow[]
}

// Per ognuno degli ultimi N giorni (esclusa la data UTC odierna che non è
// ancora chiusa), se la riga manca compute+upsert. Ritorna numero di
// inserimenti effettivi.
export function recoverMissingDays(db: Db, days = 30): number {
  let inserted = 0
  const now = Date.now()
  // partiamo da ieri e andiamo indietro N giorni
  for (let i = 1; i <= days; i++) {
    const ms = now - i * DAY_MS
    const date = isoFromMs(ms)
    const existing = getDailyMetrics(db, date)
    if (existing) continue
    const row = computeDailyMetrics(db, date)
    upsertDailyMetrics(db, row)
    inserted++
  }
  return inserted
}
