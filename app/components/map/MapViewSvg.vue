<script setup lang="ts">
import { computed } from 'vue'
import GameMap from '~/components/map/GameMap.vue'
import { useGeneratedMap } from '~/composables/useGeneratedMap'
import { usePartyMaps } from '~/composables/usePartyMaps'
import { usePartySeed } from '~/composables/usePartySeed'
import { usePartyStore } from '~/stores/party'
import type { PartyMapPublic } from '~~/shared/protocol/ws'
import type { GeneratedMap, GeneratedArea } from '~~/shared/map/generators/types'

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

const generatedMap = computed<GeneratedMap | null>(() => {
  const base = baseGeneratedMap.value
  if (!base) return null
  const mapId = props.map?.id
  if (!mapId) return base
  const overrides = party.areaOverrides.filter(o => o.mapId === mapId)
  if (overrides.length === 0) return base

  const byArea = new Map(overrides.map(o => [o.areaId, o]))
  // 1) Applica patch alle aree generate (rinomina/sposta/rimuovi).
  const patched: GeneratedArea[] = []
  for (const a of base.areas) {
    const o = byArea.get(a.id)
    if (o?.removed) continue
    if (!o) {
      patched.push(a)
      continue
    }
    patched.push({
      ...a,
      name: o.customName ?? a.name,
      shape: {
        ...a.shape,
        x: o.x ?? a.shape.x,
        y: o.y ?? a.shape.y,
        w: o.w ?? a.shape.w,
        h: o.h ?? a.shape.h
      }
    })
  }
  // 2) Aggiungi le aree custom (customAdded=true).
  for (const o of overrides) {
    if (!o.customAdded) continue
    if (o.removed) continue
    patched.push({
      id: o.areaId,
      name: o.customName ?? 'Senza nome',
      shape: {
        kind: 'rect',
        x: o.x ?? 100,
        y: o.y ?? 100,
        w: o.w ?? 120,
        h: o.h ?? 90
      },
      edge: false,
      spawn: false,
      decor: [],
      detail: { layout: 'open', width: 800, height: 600, props: [] }
    })
  }

  // 3) Ricalcola adjacency client-side: aree i cui centri distano meno
  //    della soglia di prossimità sono adiacenti. Poi applica gli
  //    adjacency overrides del master ('add' aggiunge la coppia, 'remove'
  //    la rimuove). Lo spawnAreaId/edge restano dal generatore base.
  const ADJ_THRESHOLD = 280
  const adjacency: Record<string, string[]> = {}
  for (const a of patched) adjacency[a.id] = []
  function addPair(aId: string, bId: string) {
    if (!adjacency[aId]!.includes(bId)) adjacency[aId]!.push(bId)
    if (!adjacency[bId]!.includes(aId)) adjacency[bId]!.push(aId)
  }
  function removePair(aId: string, bId: string) {
    adjacency[aId] = (adjacency[aId] ?? []).filter(x => x !== bId)
    adjacency[bId] = (adjacency[bId] ?? []).filter(x => x !== aId)
  }
  for (let i = 0; i < patched.length; i++) {
    for (let j = i + 1; j < patched.length; j++) {
      const a = patched[i]!
      const b = patched[j]!
      const ax = a.shape.x + a.shape.w / 2
      const ay = a.shape.y + a.shape.h / 2
      const bx = b.shape.x + b.shape.w / 2
      const by = b.shape.y + b.shape.h / 2
      if (Math.hypot(bx - ax, by - ay) <= ADJ_THRESHOLD) {
        addPair(a.id, b.id)
      }
    }
  }
  // Adjacency overrides (kind='add' forza la coppia, 'remove' la cancella).
  const adjOverrides = party.adjacencyOverrides.filter(o => o.mapId === mapId)
  const validIds = new Set(patched.map(a => a.id))
  for (const o of adjOverrides) {
    if (!validIds.has(o.areaA) || !validIds.has(o.areaB)) continue
    if (o.kind === 'add') addPair(o.areaA, o.areaB)
    else removePair(o.areaA, o.areaB)
  }
  const visibleIds = new Set(patched.map(a => a.id))
  const spawnAreaId = visibleIds.has(base.spawnAreaId)
    ? base.spawnAreaId
    : (patched[0]?.id ?? base.spawnAreaId)
  const edgeAreaIds = base.edgeAreaIds.filter(id => visibleIds.has(id))

  return {
    areas: patched,
    adjacency,
    spawnAreaId,
    edgeAreaIds,
    background: base.background
  }
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
  />
</template>
