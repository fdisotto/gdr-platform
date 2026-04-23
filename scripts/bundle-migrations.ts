// Legge tutti i file .sql in server/db/migrations/ e li embeda in
// server/db/migrations.generated.ts come array di stringhe. Questo serve
// perché il bundler Nitro non copia la cartella migrations nel .output,
// quindi a runtime serve la SQL inlinata.
//
// Uso: pnpm tsx scripts/bundle-migrations.ts
//      (lo script esce 0 se nulla è cambiato, non-zero se ha riscritto il file)

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const MIG_DIR = resolve(ROOT, 'server/db/migrations')
const OUT = resolve(ROOT, 'server/db/migrations.generated.ts')

const files = readdirSync(MIG_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()

const bundles = files.map((file) => {
  const hash = file.replace(/\.sql$/, '')
  const sql = readFileSync(resolve(MIG_DIR, file), 'utf8')
  // Escape per template literal: backtick e ${ devono essere escapati.
  const escaped = sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${')
  return { hash, sql: escaped }
})

const header = `// GENERATO DA scripts/bundle-migrations.ts — NON modificare a mano.
// Contiene il contenuto di ogni file .sql in server/db/migrations/ come
// stringa, così Nitro lo bundla direttamente nel server di produzione
// (dove la cartella migrations/ NON viene copiata).

export interface BundledMigration {
  hash: string
  sql: string
}

export const MIGRATIONS: BundledMigration[] = [
`

const body = bundles.map(b => `  {\n    hash: '${b.hash}',\n    sql: \`${b.sql}\`\n  }`).join(',\n')

const footer = '\n]\n'

const next = header + body + footer
const current = (() => {
  try {
    return readFileSync(OUT, 'utf8')
  } catch {
    return ''
  }
})()

if (current !== next) {
  writeFileSync(OUT, next, 'utf8')
  console.log(`bundled ${bundles.length} migration(s) → ${OUT}`)
} else {
  console.log(`migrations.generated.ts up to date (${bundles.length} bundle(s))`)
}
