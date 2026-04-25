import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty, findParty } from '~~/server/services/parties'
import { parties } from '~~/server/db/schema'
import { archiveStaleParties } from '~~/server/services/auto-archive'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let userId: string

beforeEach(async () => {
  db = createTestDb()
  userId = await createApprovedUser(db)
})

describe('archiveStaleParties', () => {
  it('archivia party con lastActivityAt < now - 30g', async () => {
    const now = 10_000_000_000
    const old = await createParty(db, { userId, displayName: 'Old' })
    const fresh = await createParty(db, { userId, displayName: 'Fresh' })
    db.update(parties)
      .set({ lastActivityAt: now - 31 * 24 * 60 * 60 * 1000 })
      .where(eq(parties.seed, old.seed))
      .run()
    db.update(parties)
      .set({ lastActivityAt: now - 1000 })
      .where(eq(parties.seed, fresh.seed))
      .run()
    const archived = archiveStaleParties(db, now)
    expect(archived).toEqual([old.seed])
    expect(findParty(db, old.seed)?.archivedAt).not.toBeNull()
    expect(findParty(db, fresh.seed)?.archivedAt).toBeNull()
  })

  it('skippa party già archiviate', async () => {
    const now = 10_000_000_000
    const r = await createParty(db, { userId, displayName: 'Old' })
    db.update(parties)
      .set({
        lastActivityAt: now - 31 * 24 * 60 * 60 * 1000,
        archivedAt: now - 1000
      })
      .where(eq(parties.seed, r.seed))
      .run()
    const archived = archiveStaleParties(db, now)
    expect(archived).toHaveLength(0)
  })

  it('niente da archiviare se tutte fresh', async () => {
    await createParty(db, { userId, displayName: 'Fresh' })
    expect(archiveStaleParties(db)).toHaveLength(0)
  })
})
