import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { listAreasState, updateAreaState, findAreaState } from '~~/server/services/areas'
import { AREA_IDS } from '~~/shared/map/areas'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let seed: string

beforeEach(async () => {
  db = createTestDb()
  const userId = await createApprovedUser(db)
  const r = await createParty(db, { userId, displayName: 'Master' })
  seed = r.seed
})

describe('areas service', () => {
  it('listAreasState restituisce tutte le 14 aree', () => {
    const rows = listAreasState(db, seed)
    expect(rows).toHaveLength(14)
    const ids = rows.map(r => r.areaId).sort()
    expect(ids).toEqual([...AREA_IDS].sort())
  })

  it('piazza è sempre intact', () => {
    const rows = listAreasState(db, seed)
    const piazza = rows.find(r => r.areaId === 'piazza')!
    expect(piazza.status).toBe('intact')
  })
})

describe('updateAreaState', () => {
  it('aggiorna solo i campi patch passati', () => {
    updateAreaState(db, seed, 'fogne', { status: 'closed', notes: 'tappata' })
    const row = findAreaState(db, seed, 'fogne')
    expect(row?.status).toBe('closed')
    expect(row?.notes).toBe('tappata')
  })

  it('non tocca campi non in patch', () => {
    updateAreaState(db, seed, 'piazza', { customName: 'Nuova Piazza' })
    const row = findAreaState(db, seed, 'piazza')
    expect(row?.customName).toBe('Nuova Piazza')
    expect(row?.status).toBe('intact')
  })
})
