<script setup lang="ts">
import { computed } from 'vue'
import GameMap from '~/components/map/GameMap.vue'
import { useGeneratedMap } from '~/composables/useGeneratedMap'
import { usePartyMaps } from '~/composables/usePartyMaps'
import { usePartySeed } from '~/composables/usePartySeed'
import { usePartyStore } from '~/stores/party'
import type { PartyMapPublic } from '~~/shared/protocol/ws'
import type { GeneratedMap } from '~~/shared/map/generators/types'
import { buildEffectiveMap, buildEffectiveAdjacency, applyAreaOverrides } from '~~/shared/map/effective-map'

// T20: il render SVG consuma una GeneratedMap deterministica derivata da
// (mapTypeId, mapSeed, params) della mappa attiva. Usa lo stesso generator
// del server (cache process-locale → no recompute a parità di input).
// T28: passa anche le transitions outgoing al GameMap così il click su
// un'area edge con transizione invia move:request cross-map (toMapId+toAreaId).
// v2d-edit: applica gli area_overrides del master alla GeneratedMap base
// prima di passarla al renderer (rinomina, sposta, nascondi, aggiungi).
const props = defineProps<{
  map: PartyMapPublic | null
}>()

const seed = usePartySeed()
const party = usePartyStore(seed)
const { transitionsForActiveMap } = usePartyMaps(seed)

const mapTypeId = computed<string | null>(() => props.map?.mapTypeId ?? null)
const mapSeed = computed<string | null>(() => props.map?.mapSeed ?? null)
const params = computed<Record<string, unknown>>(() => props.map?.params ?? {})

const baseGeneratedMap = useGeneratedMap(mapTypeId, mapSeed, params)

// Sempre passare per buildEffectiveMap così il client e il server
// (che usa la stessa funzione in handleMoveRequest) condividono il
// medesimo grafo: niente più mismatch fra strade visibili e raggiungibili
// e niente "salti" visivi quando si aggiunge il primo override.
const generatedMap = computed<GeneratedMap | null>(() => {
  const base = baseGeneratedMap.value
  if (!base) return null
  const mapId = props.map?.id
  if (!mapId) return base
  const areaOv = party.areaOverrides.filter(o => o.mapId === mapId)
  const adjOv = party.adjacencyOverrides.filter(o => o.mapId === mapId)
  return buildEffectiveMap(base, areaOv, adjOv)
})

// Strade marcate "broken": il client le disegna come strade visibili
// (compaiono nelle adjacencyPairs di GameMap) ma vengono passate giù
// per stilarle distinte e per il check "non puoi attraversare".
const brokenPairs = computed<Set<string>>(() => {
  const base = baseGeneratedMap.value
  if (!base) return new Set()
  const mapId = props.map?.id
  if (!mapId) return new Set()
  const areaOv = party.areaOverrides.filter(o => o.mapId === mapId)
  const adjOv = party.adjacencyOverrides.filter(o => o.mapId === mapId)
  const patchedAreas = applyAreaOverrides(base.areas, areaOv)
  return buildEffectiveAdjacency(patchedAreas, adjOv).brokenPairs
})
</script>

<template>
  <!-- v2d-shape-B: finché la mappa attiva non è stata caricata via state:init,
       NON renderizzare GameMap così l'utente non vede flash della mappa
       MVP legacy prima del Voronoi. Placeholder vuoto sullo sfondo bg. -->
  <div
    v-if="!map"
    class="w-full flex-1 min-h-0"
    style="background: var(--z-bg-900)"
  />
  <GameMap
    v-else
    :generated-map="generatedMap"
    :transitions="transitionsForActiveMap"
    :map-id="map?.id ?? null"
    :map-type-id="map?.mapTypeId ?? null"
    :map-name="map?.name ?? null"
    :broken-pairs="brokenPairs"
  />
</template>
