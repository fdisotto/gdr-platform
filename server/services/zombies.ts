import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { zombies } from '~~/server/db/schema'
import type { Zombie } from '~~/shared/protocol/ws'

type ZombieRow = {
  id: string
  partySeed: string
  areaId: string
  x: number
  y: number
  spawnedAt: number
  npcName: string | null
  npcRole: string | null
}

function toDomain(r: ZombieRow): Zombie {
  return {
    id: r.id,
    partySeed: r.partySeed,
    areaId: r.areaId,
    x: r.x,
    y: r.y,
    spawnedAt: r.spawnedAt,
    npcName: r.npcName,
    npcRole: r.npcRole
  }
}

export function listZombiesForParty(db: Db, partySeed: string): Zombie[] {
  const rows = db.select().from(zombies)
    .where(eq(zombies.partySeed, partySeed))
    .all() as ZombieRow[]
  return rows.map(toDomain)
}

export function insertZombie(db: Db, z: Zombie): void {
  db.insert(zombies).values({
    id: z.id,
    partySeed: z.partySeed,
    areaId: z.areaId,
    x: z.x,
    y: z.y,
    spawnedAt: z.spawnedAt,
    npcName: z.npcName ?? null,
    npcRole: z.npcRole ?? null
  }).run()
}

export function insertZombies(db: Db, zs: Zombie[]): void {
  if (zs.length === 0) return
  db.insert(zombies).values(zs.map(z => ({
    id: z.id,
    partySeed: z.partySeed,
    areaId: z.areaId,
    x: z.x,
    y: z.y,
    spawnedAt: z.spawnedAt,
    npcName: z.npcName ?? null,
    npcRole: z.npcRole ?? null
  }))).run()
}

export function deleteZombie(db: Db, partySeed: string, id: string): void {
  db.delete(zombies)
    .where(and(eq(zombies.partySeed, partySeed), eq(zombies.id, id)))
    .run()
}

export function deleteZombies(db: Db, partySeed: string, ids: string[]): void {
  if (ids.length === 0) return
  db.delete(zombies)
    .where(and(eq(zombies.partySeed, partySeed), inArray(zombies.id, ids)))
    .run()
}

export function updateZombiePosition(db: Db, partySeed: string, id: string, x: number, y: number): void {
  db.update(zombies)
    .set({ x, y })
    .where(and(eq(zombies.partySeed, partySeed), eq(zombies.id, id)))
    .run()
}
