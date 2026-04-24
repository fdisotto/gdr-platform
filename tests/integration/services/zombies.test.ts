import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { insertZombie, insertZombies, deleteZombie, deleteZombies, updateZombiePosition, listZombiesForParty } from '~~/server/services/zombies'
import type { Zombie } from '~~/shared/protocol/ws'

let db: Db
let seed: string

beforeEach(async () => {
  db = createTestDb()
  const r = await createParty(db, { masterNickname: 'Master' })
  seed = r.seed
})

function mkZombie(overrides: Partial<Zombie> = {}): Zombie {
  return {
    id: overrides.id ?? `z-${Math.random().toString(36).slice(2)}`,
    partySeed: seed,
    areaId: 'piazza',
    x: 100,
    y: 200,
    spawnedAt: 1000,
    npcName: null,
    npcRole: null,
    ...overrides
  }
}

describe('zombies service', () => {
  it('insertZombie persiste e listZombiesForParty lo ritrova', () => {
    const z = mkZombie({ id: 'z1' })
    insertZombie(db, z)
    const list = listZombiesForParty(db, seed)
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe('z1')
    expect(list[0]!.x).toBe(100)
  })

  it('persiste npcName e npcRole', () => {
    insertZombie(db, mkZombie({ id: 'npc1', npcName: 'Robert', npcRole: 'poliziotto' }))
    const [row] = listZombiesForParty(db, seed)
    expect(row!.npcName).toBe('Robert')
    expect(row!.npcRole).toBe('poliziotto')
  })

  it('insertZombies batch', () => {
    insertZombies(db, [
      mkZombie({ id: 'b1', x: 1 }),
      mkZombie({ id: 'b2', x: 2 }),
      mkZombie({ id: 'b3', x: 3 })
    ])
    expect(listZombiesForParty(db, seed)).toHaveLength(3)
  })

  it('updateZombiePosition sposta le coord', () => {
    insertZombie(db, mkZombie({ id: 'm1', x: 0, y: 0 }))
    updateZombiePosition(db, seed, 'm1', 500, 600)
    const [row] = listZombiesForParty(db, seed)
    expect(row!.x).toBe(500)
    expect(row!.y).toBe(600)
  })

  it('deleteZombie rimuove solo quello giusto', () => {
    insertZombies(db, [mkZombie({ id: 'd1' }), mkZombie({ id: 'd2' })])
    deleteZombie(db, seed, 'd1')
    const list = listZombiesForParty(db, seed)
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe('d2')
  })

  it('deleteZombies batch', () => {
    insertZombies(db, [mkZombie({ id: 'x1' }), mkZombie({ id: 'x2' }), mkZombie({ id: 'x3' })])
    deleteZombies(db, seed, ['x1', 'x3'])
    const list = listZombiesForParty(db, seed)
    expect(list.map(z => z.id)).toEqual(['x2'])
  })
})
