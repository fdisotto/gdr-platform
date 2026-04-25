import { eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { systemSettings } from '~~/server/db/schema'

// Cache process-local del valore parsed di ogni setting. Una entry presente
// significa "abbiamo già letto il DB per questa chiave" — copre anche il caso
// "chiave assente in DB" via NOT_FOUND sentinel per evitare re-lookup ripetuti.
// Nei test il cache va resettato con invalidateCache() per ogni beforeEach.

export interface SettingValue {
  value: unknown
  updatedAt: number
  updatedBy: string | null
}

const NOT_FOUND = Symbol('not_found')

interface CacheEntry {
  value: unknown | typeof NOT_FOUND
  updatedAt: number
  updatedBy: string | null
}

const cache = new Map<string, CacheEntry>()

function readFromDb(db: Db, key: string): CacheEntry {
  const row = db.select().from(systemSettings)
    .where(eq(systemSettings.key, key))
    .get() as {
      key: string
      value: string
      updatedAt: number
      updatedBy: string | null
    } | undefined
  if (!row) {
    return { value: NOT_FOUND, updatedAt: 0, updatedBy: null }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(row.value)
  } catch {
    parsed = NOT_FOUND
  }
  return { value: parsed, updatedAt: row.updatedAt, updatedBy: row.updatedBy }
}

function ensureCached(db: Db, key: string): CacheEntry {
  const hit = cache.get(key)
  if (hit) return hit
  const entry = readFromDb(db, key)
  cache.set(key, entry)
  return entry
}

export function getSetting(db: Db, key: string, defaultValue?: unknown): unknown {
  const entry = ensureCached(db, key)
  if (entry.value === NOT_FOUND) return defaultValue
  return entry.value
}

export function getSettingNumber(db: Db, key: string, defaultValue: number): number {
  const v = getSetting(db, key)
  return typeof v === 'number' && Number.isFinite(v) ? v : defaultValue
}

export function getSettingBoolean(db: Db, key: string, defaultValue: boolean): boolean {
  const v = getSetting(db, key)
  return typeof v === 'boolean' ? v : defaultValue
}

export function getSettingString(db: Db, key: string, defaultValue: string): string {
  const v = getSetting(db, key)
  return typeof v === 'string' ? v : defaultValue
}

export function listSettings(db: Db): Record<string, SettingValue> {
  const rows = db.select().from(systemSettings).all() as Array<{
    key: string
    value: string
    updatedAt: number
    updatedBy: string | null
  }>
  const out: Record<string, SettingValue> = {}
  for (const r of rows) {
    let parsed: unknown
    try {
      parsed = JSON.parse(r.value)
    } catch {
      parsed = null
    }
    out[r.key] = { value: parsed, updatedAt: r.updatedAt, updatedBy: r.updatedBy }
  }
  return out
}

export function setSetting(db: Db, key: string, value: unknown, updatedBy: string | null): void {
  const now = Date.now()
  const serialized = JSON.stringify(value)
  const existing = db.select().from(systemSettings)
    .where(eq(systemSettings.key, key))
    .get()
  if (existing) {
    db.update(systemSettings)
      .set({ value: serialized, updatedAt: now, updatedBy })
      .where(eq(systemSettings.key, key))
      .run()
  } else {
    db.insert(systemSettings).values({
      key, value: serialized, updatedAt: now, updatedBy
    }).run()
  }
  // invalida cache per la chiave: il prossimo get rilegge da DB
  cache.delete(key)
}

// Helper: usato dai test e dal plugin di bootstrap quando applichiamo seed
// massivo dalle migration (per garantire che la cache parta vuota).
export function invalidateCache(): void {
  cache.clear()
}
