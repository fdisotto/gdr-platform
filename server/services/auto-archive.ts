import { and, isNull, lt } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { parties } from '~~/server/db/schema'
import { archiveParty } from '~~/server/services/parties'
import { registry } from '~~/server/ws/state'
import { PARTY_INACTIVITY_ARCHIVE_DAYS } from '~~/shared/limits'

const ARCHIVE_THRESHOLD_MS = PARTY_INACTIVITY_ARCHIVE_DAYS * 24 * 60 * 60 * 1000

// Esportata per testabilità: archivia ogni party non già archived con
// lastActivityAt < now - threshold. Ritorna l'elenco dei seed archiviati.
// Tiene il side effect di chiudere i WS aperti per le party archiviate.
export function archiveStaleParties(db: Db, now: number = Date.now()): string[] {
  const cutoff = now - ARCHIVE_THRESHOLD_MS
  const stale = db.select().from(parties)
    .where(and(
      isNull(parties.archivedAt),
      lt(parties.lastActivityAt, cutoff)
    ))
    .all()
  const archived: string[] = []
  for (const p of stale) {
    archiveParty(db, p.seed)
    archived.push(p.seed)
    for (const conn of registry.listParty(p.seed)) {
      try {
        conn.ws.close(4004, 'archived')
      } catch { /* no-op */ }
    }
  }
  return archived
}
