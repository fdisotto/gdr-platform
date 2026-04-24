/**
 * Seed script idempotente del superadmin di default (admin/changeme).
 *
 * Usato dopo drizzle-kit migrate per garantire che esista almeno un account
 * admin al primo deploy. Se esiste già un superadmin, no-op.
 *
 * Uso: `pnpm tsx scripts/seed-superadmin.ts` (viene chiamato automaticamente
 * da `pnpm db:migrate`).
 *
 * Il superadmin creato ha mustReset=true: al primo login web verrà forzato
 * il cambio password prima di poter accedere a qualunque altro endpoint admin.
 */
import { getDb } from '~~/server/db/client'
import { seedDefaultSuperadmin } from '~~/server/services/superadmins'

const db = getDb()
const inserted = await seedDefaultSuperadmin(db)
if (inserted) {
  console.log('[seed] superadmin admin/changeme creato (mustReset=true). Cambia la password al primo login.')
} else {
  console.log('[seed] superadmin già presente, nessuna azione.')
}
