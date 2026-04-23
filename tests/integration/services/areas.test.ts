import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import { AREA_IDS } from '~~/shared/map/areas'

let db: Db
let seed: string

beforeEach(async () => {
  db = createTestDb()
  const r = await createParty(db, { masterNickname: 'Master' })
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
