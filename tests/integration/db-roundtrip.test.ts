import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { parties } from '~~/server/db/schema'

describe('DB round-trip', () => {
  let db: Db

  beforeEach(() => {
    db = createTestDb()
  })

  it('inserisce e legge una party', () => {
    const now = Date.now()
    db.insert(parties).values({
      seed: '11111111-1111-1111-1111-111111111111',
      masterTokenHash: 'hash',
      cityName: 'Valmorta',
      createdAt: now,
      lastActivityAt: now
    }).run()

    const rows = db.select().from(parties).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.cityName).toBe('Valmorta')
  })
})
