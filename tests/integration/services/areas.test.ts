import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { listAreasState, updateAreaState, findAreaState } from '~~/server/services/areas'
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
  // v2d (T16): createParty non pre-popola più areas_state. Lo status
  // implicito di default è 'intact'; areas_state contiene solo override
  // espliciti del master.
  it('listAreasState dopo createParty è vuoto', () => {
    expect(listAreasState(db, seed)).toEqual([])
  })

  it('updateAreaState upserta una nuova riga se non esiste', () => {
    updateAreaState(db, seed, 'fogne', { status: 'closed', notes: 'tappata' })
    const row = findAreaState(db, seed, 'fogne')
    expect(row?.status).toBe('closed')
    expect(row?.notes).toBe('tappata')
  })
})

describe('updateAreaState', () => {
  it('aggiorna solo i campi patch passati su riga esistente', () => {
    // upsert iniziale per crearne una
    updateAreaState(db, seed, 'fogne', { status: 'intact' })
    updateAreaState(db, seed, 'fogne', { status: 'closed', notes: 'tappata' })
    const row = findAreaState(db, seed, 'fogne')
    expect(row?.status).toBe('closed')
    expect(row?.notes).toBe('tappata')
  })

  it('non tocca campi non in patch su riga esistente', () => {
    updateAreaState(db, seed, 'piazza', { status: 'intact' })
    updateAreaState(db, seed, 'piazza', { customName: 'Nuova Piazza' })
    const row = findAreaState(db, seed, 'piazza')
    expect(row?.customName).toBe('Nuova Piazza')
    expect(row?.status).toBe('intact')
  })

  it('upsert con mapId persiste il riferimento alla mappa', () => {
    updateAreaState(db, seed, 'fogne', { status: 'closed' }, 'map-xyz')
    const row = findAreaState(db, seed, 'fogne')
    expect(row?.mapId).toBe('map-xyz')
  })
})
