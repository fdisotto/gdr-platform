import { computed, type ComputedRef } from 'vue'
import { generate } from '~~/shared/map/generators'
import type { GeneratedMap } from '~~/shared/map/generators/types'

/**
 * Wrapper computed sopra il generator deterministico condiviso. Nessuna
 * chiamata HTTP: il client usa lo stesso generator del server, sfruttando la
 * cache process-locale di `shared/map/generators/index.ts` per evitare il
 * ricalcolo a parità di `(typeId, seed, params)`.
 */
export function useGeneratedMap(
  mapTypeId: ComputedRef<string | null>,
  mapSeed: ComputedRef<string | null>,
  params: ComputedRef<Record<string, unknown>>
) {
  return computed<GeneratedMap | null>(() => {
    const t = mapTypeId.value
    const s = mapSeed.value
    if (!t || !s) return null
    return generate(t, s, params.value)
  })
}
