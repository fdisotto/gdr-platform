import { useRoute } from 'vue-router'

/**
 * Ritorna la seed corrente desunta dalla route. Pensato per i componenti
 * che vivono dentro `/party/[seed]/*` e devono passare il seed agli store
 * keyed (`useChatStore(seed)`, `usePartyStore(seed)`, ecc).
 *
 * Fuori dalle route party torna stringa vuota: i call site sono già
 * progettati per non istanziare nulla in quel caso (i componenti party
 * sono renderizzati solo dentro la route).
 */
export function usePartySeed(): string {
  const route = useRoute()
  return String(route.params.seed ?? '')
}
