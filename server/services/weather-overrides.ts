import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { weatherOverrides } from '~~/server/db/schema'

const GLOBAL_KEY = '*'

export interface WeatherOverrideRow {
  partySeed: string
  mapId: string | null
  areaId: string // '*' = globale
  code: string
  intensity: number
  setAt: number
  expiresAt: number | null
}

function key(areaId: string | null): string {
  return areaId ?? GLOBAL_KEY
}

// v2d: mapId opzionale, propagato sulla colonna nullable (PK estesa solo
// in 0006). L'override globale (areaId=null) resta con mapId facoltativo.
export function setOverride(
  db: Db, seed: string, areaId: string | null,
  code: string, intensity: number, mapId?: string
) {
  const k = key(areaId)
  const existing = db.select().from(weatherOverrides)
    .where(and(eq(weatherOverrides.partySeed, seed), eq(weatherOverrides.areaId, k))).all()
  if (existing.length > 0) {
    db.update(weatherOverrides)
      .set({ code, intensity, setAt: Date.now(), expiresAt: null, mapId: mapId ?? null })
      .where(and(eq(weatherOverrides.partySeed, seed), eq(weatherOverrides.areaId, k)))
      .run()
  } else {
    db.insert(weatherOverrides).values({
      partySeed: seed,
      mapId: mapId ?? null,
      areaId: k,
      code,
      intensity,
      setAt: Date.now(),
      expiresAt: null
    }).run()
  }
}

export function clearOverride(db: Db, seed: string, areaId: string | null) {
  const k = key(areaId)
  db.delete(weatherOverrides)
    .where(and(eq(weatherOverrides.partySeed, seed), eq(weatherOverrides.areaId, k)))
    .run()
}

export interface WeatherOverridePublic {
  areaId: string | null // null = globale
  code: string
  intensity: number
}

export function listOverrides(db: Db, seed: string): WeatherOverridePublic[] {
  const rows = db.select().from(weatherOverrides)
    .where(eq(weatherOverrides.partySeed, seed)).all() as WeatherOverrideRow[]
  return rows.map(r => ({
    areaId: r.areaId === GLOBAL_KEY ? null : r.areaId,
    code: r.code,
    intensity: r.intensity
  }))
}
