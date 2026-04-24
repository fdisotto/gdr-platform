import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { bans } from '~~/server/db/schema'

export function addBan(db: Db, seed: string, nicknameLower: string, reason: string | null) {
  // upsert: se già presente, no-op
  const existing = db.select().from(bans).where(and(eq(bans.partySeed, seed), eq(bans.nicknameLower, nicknameLower))).all()
  if (existing.length > 0) return
  db.insert(bans).values({
    partySeed: seed,
    nicknameLower,
    reason,
    bannedAt: Date.now()
  }).run()
}

export function removeBan(db: Db, seed: string, nicknameLower: string) {
  db.delete(bans).where(and(eq(bans.partySeed, seed), eq(bans.nicknameLower, nicknameLower))).run()
}

export function listBans(db: Db, seed: string) {
  return db.select().from(bans).where(eq(bans.partySeed, seed)).all()
}
