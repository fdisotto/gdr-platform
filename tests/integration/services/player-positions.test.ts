import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { upsertPosition, deletePositionsForPlayer, listPartyPositions } from '~~/server/services/player-positions'

let db: Db
let seed: string

beforeEach(async () => {
  db = createTestDb()
  const r = await createParty(db, { masterNickname: 'Master' })
  seed = r.seed
})

describe('player-positions service', () => {
  it('upsertPosition inserisce e rilegge', () => {
    upsertPosition(db, seed, 'p1', 'piazza', 100, 200)
    const list = listPartyPositions(db, seed)
    expect(list).toHaveLength(1)
    expect(list[0]!.playerId).toBe('p1')
    expect(list[0]!.x).toBe(100)
  })

  it('upsertPosition aggiorna sulla stessa PK', () => {
    upsertPosition(db, seed, 'p1', 'piazza', 1, 1)
    upsertPosition(db, seed, 'p1', 'piazza', 99, 99)
    const list = listPartyPositions(db, seed)
    expect(list).toHaveLength(1)
    expect(list[0]!.x).toBe(99)
  })

  it('posizioni distinte per player e area', () => {
    upsertPosition(db, seed, 'p1', 'piazza', 1, 1)
    upsertPosition(db, seed, 'p1', 'giardino', 2, 2)
    upsertPosition(db, seed, 'p2', 'piazza', 3, 3)
    expect(listPartyPositions(db, seed)).toHaveLength(3)
  })

  it('deletePositionsForPlayer rimuove tutte le posizioni del player', () => {
    upsertPosition(db, seed, 'p1', 'piazza', 1, 1)
    upsertPosition(db, seed, 'p1', 'giardino', 2, 2)
    upsertPosition(db, seed, 'p2', 'piazza', 3, 3)
    deletePositionsForPlayer(db, seed, 'p1')
    const list = listPartyPositions(db, seed)
    expect(list).toHaveLength(1)
    expect(list[0]!.playerId).toBe('p2')
  })
})
