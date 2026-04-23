import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as schema from '~~/server/db/schema'

export type Db = BetterSQLite3Database<typeof schema>

let cached: Db | null = null

export function getDb(): Db {
  if (cached) return cached
  const url = process.env.DATABASE_URL ?? './data/gdr.sqlite'
  const sqlite = new Database(url)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  applyMigrations(db)
  cached = db
  return db
}

export function createTestDb(): Db {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  applyMigrations(db)
  return db
}

function applyMigrations(db: Db) {
  const here = dirname(fileURLToPath(import.meta.url))
  const migrationsFolder = resolve(here, './migrations')
  migrate(db, { migrationsFolder })
}

export function resetCache() {
  cached = null
}
