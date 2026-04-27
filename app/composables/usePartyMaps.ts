import { computed } from 'vue'
import { usePartyStore } from '~/stores/party'
import type { PartyMapPublic, TransitionPublic } from '~~/shared/protocol/ws'

/**
 * Selettori reattivi sopra `usePartyStore(seed)` per il dominio multi-mappa.
 * - `maps`: lista mappe del party.
 * - `currentMapId`: id mappa attiva del giocatore corrente.
 * - `activeMap`: la mappa puntata da `currentMapId`, o null.
 * - `spawnMap`: la mappa con `isSpawn: true`, o null.
 * - `transitions`: tutte le transitions cross-map del party.
 * - `transitionsForActiveMap`: subset filtrato per `fromMapId === currentMapId`.
 */
export function usePartyMaps(seed: string) {
  const party = usePartyStore(seed)
  const maps = computed<PartyMapPublic[]>(() => party.maps ?? [])
  const currentMapId = computed<string | null>(() => party.currentMapId ?? null)
  const activeMap = computed<PartyMapPublic | null>(() => {
    const id = currentMapId.value
    if (!id) return null
    return maps.value.find(m => m.id === id) ?? null
  })
  const spawnMap = computed<PartyMapPublic | null>(
    () => maps.value.find(m => m.isSpawn) ?? null
  )
  const transitions = computed<TransitionPublic[]>(() => party.transitions ?? [])
  const transitionsForActiveMap = computed<TransitionPublic[]>(() => {
    const id = currentMapId.value
    if (!id) return []
    return transitions.value.filter(t => t.fromMapId === id)
  })
  return {
    maps,
    currentMapId,
    activeMap,
    spawnMap,
    transitions,
    transitionsForActiveMap
  }
}
