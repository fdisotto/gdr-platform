/**
 * Applica le migration al DB locale via bundle runner (stessa logica di
 * getDb a runtime). È la fonte unica di verità: drizzle-kit migrate non
 * viene più chiamato per applicare le migration, solo per generarle.
 *
 * Idempotente: tollera tabelle/colonne già presenti se il DB era stato
 * migrato in precedenza con un tracker diverso.
 */
import { getDb, resetCache } from '~~/server/db/client'

const url = process.env.DATABASE_URL ?? './data/gdr.sqlite'

resetCache()
getDb()

console.log(`[migrate] migrazioni applicate al DB ${url}`)
