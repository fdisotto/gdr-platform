import type { Db } from '~~/server/db/client'
import { hashPassword } from '~~/server/services/auth'
import { insertUser, approveUser } from '~~/server/services/users'
import { generateUuid } from '~~/server/utils/crypto'

// Helper condiviso per i test di servizio che usano `createTestDb()`
// in-process: crea un user approved, utilizzabile come FK `players.user_id`
// quando si chiama createParty/joinParty dopo il task 22.
//
// NB: NON usare dai test end-to-end (api/*, ws/*) che girano contro un
// Nitro process separato — lì bisogna registrare via /api/auth/register
// e approvare via /api/admin/... o via manipolazione diretta del DB file
// condiviso.
export async function createApprovedUser(
  db: Db,
  username?: string,
  password = 'testpass12'
): Promise<string> {
  const name = username ?? `user${Math.random().toString(36).slice(2, 10)}`
  const id = generateUuid()
  const hash = await hashPassword(password)
  insertUser(db, { id, username: name, passwordHash: hash })
  approveUser(db, id, 'system-test')
  return id
}
