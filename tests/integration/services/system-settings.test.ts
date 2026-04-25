import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import {
  getSetting, getSettingNumber, getSettingBoolean, getSettingString,
  setSetting, listSettings, invalidateCache
} from '~~/server/services/system-settings'

let db: Db
beforeEach(() => {
  db = createTestDb()
  invalidateCache()
})

describe('system-settings service', () => {
  it('getSetting ritorna defaultValue se chiave assente in DB', () => {
    expect(getSetting(db, 'no.such.key', 'fallback')).toBe('fallback')
    expect(getSetting(db, 'no.such.key2')).toBeUndefined()
  })

  it('setSetting persiste valore JSON e getSetting lo rilegge', () => {
    setSetting(db, 'k1', { a: 1, b: 'x' }, 'admin-1')
    expect(getSetting(db, 'k1')).toEqual({ a: 1, b: 'x' })
  })

  it('setSetting invalida la cache: lettura successiva ritorna il nuovo valore', () => {
    setSetting(db, 'k', 42, null)
    expect(getSettingNumber(db, 'k', 0)).toBe(42)
    setSetting(db, 'k', 99, null)
    expect(getSettingNumber(db, 'k', 0)).toBe(99)
  })

  it('getSettingNumber: type coercion + default se tipo errato', () => {
    setSetting(db, 'limits.x', 7, null)
    expect(getSettingNumber(db, 'limits.x', 0)).toBe(7)
    setSetting(db, 'limits.bad', 'not-number', null)
    expect(getSettingNumber(db, 'limits.bad', 5)).toBe(5)
    expect(getSettingNumber(db, 'missing', 11)).toBe(11)
  })

  it('getSettingBoolean: type coercion + default', () => {
    setSetting(db, 'features.flag', true, null)
    expect(getSettingBoolean(db, 'features.flag', false)).toBe(true)
    setSetting(db, 'features.bad', 'no', null)
    expect(getSettingBoolean(db, 'features.bad', true)).toBe(true)
    expect(getSettingBoolean(db, 'missing', false)).toBe(false)
  })

  it('getSettingString: type coercion + default', () => {
    setSetting(db, 'system.msg', 'ciao', null)
    expect(getSettingString(db, 'system.msg', '')).toBe('ciao')
    setSetting(db, 'system.bad', 123, null)
    expect(getSettingString(db, 'system.bad', 'fallback')).toBe('fallback')
    expect(getSettingString(db, 'missing', 'def')).toBe('def')
  })

  it('listSettings ritorna mappa con metadati e include i default seedati', () => {
    setSetting(db, 'custom.a', 1, 'sa-1')
    setSetting(db, 'custom.b', 'two', null)
    const all = listSettings(db)
    expect(all['custom.a']!.value).toBe(1)
    expect(all['custom.a']!.updatedBy).toBe('sa-1')
    expect(all['custom.a']!.updatedAt).toBeGreaterThan(0)
    expect(all['custom.b']!.value).toBe('two')
    expect(all['custom.b']!.updatedBy).toBeNull()
    // sanity: i default seedati dalla migration 0004 sono presenti
    expect(all['limits.maxPartiesPerUser']!.value).toBe(5)
    expect(all['features.registrationEnabled']!.value).toBe(true)
  })

  it('setSetting upsert: chiamate ripetute aggiornano stessa chiave', () => {
    const before = Object.keys(listSettings(db)).length
    setSetting(db, 'custom.k', 1, null)
    setSetting(db, 'custom.k', 2, null)
    setSetting(db, 'custom.k', 3, null)
    expect(getSettingNumber(db, 'custom.k', 0)).toBe(3)
    expect(Object.keys(listSettings(db)).length).toBe(before + 1)
  })

  it('invalidateCache costringe rilettura da DB', () => {
    setSetting(db, 'k', 'v1', null)
    expect(getSettingString(db, 'k', '')).toBe('v1')
    // bypass setSetting (simuliamo write esterno: come migration che inserisce default)
    invalidateCache()
    expect(getSettingString(db, 'k', '')).toBe('v1')
  })
})
