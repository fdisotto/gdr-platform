import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty, findParty, verifyMaster } from '~~/server/services/parties'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let userId: string
beforeEach(async () => {
  db = createTestDb()
  userId = await createApprovedUser(db)
})

describe('parties service', () => {
  it('createParty genera seed uuid, cityName, masterToken in chiaro e master player', async () => {
    const r = await createParty(db, { userId, displayName: 'Nick' })
    expect(r.seed).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/)
    expect(r.masterToken.length).toBeGreaterThan(20)
    expect(r.masterPlayer.role).toBe('master')
    expect(r.masterPlayer.nickname).toBe('Nick')
    expect(r.masterPlayer.currentAreaId).toBe('piazza')
    expect(r.cityState.areas.piazza.status).toBe('intact')
  })

  it('findParty ritrova la party per seed', async () => {
    const r = await createParty(db, { userId, displayName: 'Nick' })
    const found = findParty(db, r.seed)
    expect(found?.cityName).toBe(r.cityState.cityName)
  })

  it('verifyMaster accetta solo il token corretto', async () => {
    const r = await createParty(db, { userId, displayName: 'Nick' })
    expect(await verifyMaster(db, r.seed, r.masterToken)).toBe(true)
    expect(await verifyMaster(db, r.seed, 'wrong')).toBe(false)
  })
})
