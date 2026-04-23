import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '~~/server/db/schema'
// Le migration SQL sono inlinate a build-time in migrations.generated.ts
// (rigenerato da scripts/bundle-migrations.ts) — così Nitro le bundla nel
// .output senza dover copiare la cartella migrations/ su disco.
import { MIGRATIONS } from '~~/server/db/migrations.generated'

export type Db = BetterSQLite3Database<typeof schema>

type SqliteInstance = Database.Database

let cached: Db | null = null

export function getDb(): Db {
  if (cached) return cached
  const url = process.env.DATABASE_URL ?? './data/gdr.sqlite'
  const sqlite = new Database(url)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  applyMigrations(sqlite)
  cached = drizzle(sqlite, { schema })
  return cached
}

export function createTestDb(): Db {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  applyMigrations(sqlite)
  return drizzle(sqlite, { schema })
}

function applyMigrations(sqlite: SqliteInstance) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    hash TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`)
  const has = sqlite.prepare('SELECT 1 FROM __drizzle_migrations WHERE hash = ?')
  const insert = sqlite.prepare('INSERT INTO __drizzle_migrations (hash, applied_at) VALUES (?, ?)')

  for (const m of MIGRATIONS) {
    if (has.get(m.hash)) continue
    // Drizzle separa gli statement con `--> statement-breakpoint`.
    const stmts = m.sql.split(/-->\s*statement-breakpoint/i)
    for (const stmt of stmts) {
      const trimmed = stmt.trim()
      if (trimmed) sqlite.exec(trimmed)
    }
    insert.run(m.hash, Date.now())
  }
}

export function resetCache() {
  cached = null
}
