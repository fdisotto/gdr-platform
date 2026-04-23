import { getDb } from '~~/server/db/client'

export function useDb() {
  return getDb()
}
