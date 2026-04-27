import { computed, type ComputedRef } from 'vue'
import { usePartyMaps } from '~/composables/usePartyMaps'
import { useGeneratedMap } from '~/composables/useGeneratedMap'
import { usePartyStore } from '~/stores/party'
import { AREA_IDS, AREAS } from '~~/shared/map/areas'

export interface ActiveAreaSummary {
  id: string
  name: string
}

/**
 * Aree effettive della mappa attiva del player corrente, post override
 * master (rinomina/sposta/aggiungi/rimuovi) e con preferenza per il
 * customName di `areasState`. Fallback alle AREAS legacy quando il
 * party non ha multi-mappa attiva (es. legacy MVP).
 *
 * Usato per l'autocomplete dei comandi chat (/open, /close, /status,
 * /setname, /weather, /move) così suggerisce le zone reali della mappa
 * corrente invece degli ID hardcoded MVP.
 */
export function useActiveMapAreas(seed: string): ComputedRef<readonly ActiveAreaSummary[]> {
  const party = usePartyStore(seed)
  const { activeMap } = usePartyMaps(seed)

  const mapTypeId = computed<string | null>(() => activeMap.value?.mapTypeId ?? null)
  const mapSeed = computed<string | null>(() => activeMap.value?.mapSeed ?? null)
  const params = computed<Record<string, unknown>>(() => activeMap.value?.params ?? {})
  const baseGenerated = useGeneratedMap(mapTypeId, mapSeed, params)

  return computed<readonly ActiveAreaSummary[]>(() => {
    const map = activeMap.value
    if (!map) {
      // Fallback legacy MVP: 14 aree hardcoded
      return AREAS.map(a => ({ id: a.id, name: a.name }))
    }
    const overrides = party.areaOverrides.filter(o => o.mapId === map.id)
    const byArea = new Map(overrides.map(o => [o.areaId, o]))
    const stateById = new Map(party.areasState.map(s => [s.areaId, s]))
    const out: ActiveAreaSummary[] = []
    const base = baseGenerated.value
    if (base) {
      for (const a of base.areas) {
        const o = byArea.get(a.id)
        if (o?.removed) continue
        const customName = o?.customName ?? stateById.get(a.id)?.customName ?? null
        out.push({ id: a.id, name: customName ?? a.name })
      }
    }
    // Aree custom-added dal master
    for (const o of overrides) {
      if (!o.customAdded || o.removed) continue
      const customName = o.customName ?? stateById.get(o.areaId)?.customName ?? null
      out.push({ id: o.areaId, name: customName ?? 'Senza nome' })
    }
    if (out.length === 0) {
      // Generator non ha prodotto nulla (params/seed non validi) → fallback
      return (AREA_IDS as readonly string[]).map(id => ({ id, name: id }))
    }
    return out
  })
}
