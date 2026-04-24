import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import {
  closeArea, openArea, isAreaClosed, listClosedAreas
} from '~~/server/services/area-access'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let seed: string

beforeEach(async () => {
  db = createTestDb()
  const userId = await createApprovedUser(db)
  const r = await createParty(db, { userId, displayName: 'M' })
  seed = r.seed
})

describe('area-access service', () => {
  it('isAreaClosed torna false di default', () => {
    expect(isAreaClosed(db, seed, 'piazza')).toBe(false)
  })

  it('closeArea + isAreaClosed + listClosedAreas', () => {
    closeArea(db, seed, 'fogne', 'inagibile')
    expect(isAreaClosed(db, seed, 'fogne')).toBe(true)
    expect(isAreaClosed(db, seed, 'piazza')).toBe(false)
    const closed = listClosedAreas(db, seed)
    expect(closed).toHaveLength(1)
    expect(closed[0]!.areaId).toBe('fogne')
    expect(closed[0]!.reason).toBe('inagibile')
  })

  it('closeArea è idempotente (non duplica la chiave)', () => {
    closeArea(db, seed, 'fogne', 'primo')
    closeArea(db, seed, 'fogne', 'secondo')
    const closed = listClosedAreas(db, seed)
    expect(closed).toHaveLength(1)
  })

  it('openArea rimuove la chiusura', () => {
    closeArea(db, seed, 'fogne', null)
    openArea(db, seed, 'fogne')
    expect(isAreaClosed(db, seed, 'fogne')).toBe(false)
    expect(listClosedAreas(db, seed)).toEqual([])
  })

  it('chiusure di party diverse sono isolate', async () => {
    const otherUserId = await createApprovedUser(db, 'other-master')
    const other = await createParty(db, { userId: otherUserId, displayName: 'M2' })
    closeArea(db, seed, 'fogne', null)
    expect(isAreaClosed(db, other.seed, 'fogne')).toBe(false)
  })
})
