import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type Db } from '~~/server/db/client'
import { mapTypes } from '~~/server/db/schema'
import {
  listMapTypes,
  listEnabledMapTypes,
  findMapType,
  updateMapType,
  parseDefaultParams
} from '~~/server/services/map-types'
import { DomainError } from '~~/shared/errors'

let db: Db
beforeEach(() => {
  db = createTestDb()
})

describe('map-types service', () => {
  it('listMapTypes ritorna almeno le 3 righe seedate ordinate per id asc', () => {
    const rows = listMapTypes(db)
    const ids = rows.map(r => r.id)
    expect(ids).toContain('city')
    expect(ids).toContain('country')
    expect(ids).toContain('wasteland')
    expect(rows.length).toBeGreaterThanOrEqual(3)
    // ordering asc per id
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.id <= rows[i]!.id).toBe(true)
    }
  })

  it('listEnabledMapTypes ritorna solo le righe enabled', () => {
    updateMapType(db, 'city', { enabled: false })
    const enabled = listEnabledMapTypes(db)
    expect(enabled.find(r => r.id === 'city')).toBeUndefined()
    expect(enabled.find(r => r.id === 'country')).toBeDefined()
    expect(enabled.find(r => r.id === 'wasteland')).toBeDefined()
  })

  it('findMapType ritorna riga esistente o null', () => {
    const city = findMapType(db, 'city')
    expect(city).not.toBeNull()
    expect(city!.name).toBe('Città')
    expect(findMapType(db, 'foo-non-esiste')).toBeNull()
  })

  it('updateMapType: enabled=false disabilita la riga', () => {
    updateMapType(db, 'city', { enabled: false })
    const city = findMapType(db, 'city')
    expect(city!.enabled).toBe(false)
  })

  it('updateMapType: defaultParams aggiornato e parseDefaultParams lo rilegge', () => {
    updateMapType(db, 'city', { defaultParams: { density: 0.7 } })
    const city = findMapType(db, 'city')!
    expect(parseDefaultParams(city)).toEqual({ density: 0.7 })
  })

  it('updateMapType: areaCountMin e areaCountMax aggiornati insieme', () => {
    updateMapType(db, 'city', { areaCountMin: 8, areaCountMax: 14 })
    const city = findMapType(db, 'city')!
    expect(city.areaCountMin).toBe(8)
    expect(city.areaCountMax).toBe(14)
  })

  it('updateMapType su id inesistente lancia DomainError(not_found)', () => {
    let caught: unknown
    try {
      updateMapType(db, 'inexistent', { enabled: false })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DomainError)
    expect((caught as DomainError).code).toBe('not_found')
  })

  it('updateMapType tocca updatedAt sull update', async () => {
    // Forziamo un updatedAt iniziale noto via update diretto su DB.
    db.update(mapTypes).set({ updatedAt: 1 }).where(eq(mapTypes.id, 'city')).run()
    const before = findMapType(db, 'city')!.updatedAt
    expect(before).toBe(1)
    updateMapType(db, 'city', { enabled: true })
    const after = findMapType(db, 'city')!.updatedAt
    expect(after).toBeGreaterThan(before)
  })

  it('parseDefaultParams ritorna {} se JSON malformato', () => {
    db.update(mapTypes).set({ defaultParams: 'not-json{{' }).where(eq(mapTypes.id, 'city')).run()
    const city = findMapType(db, 'city')!
    expect(parseDefaultParams(city)).toEqual({})
  })
})
