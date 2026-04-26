<script setup lang="ts">
import { computed } from 'vue'
import { AREAS as LEGACY_AREAS, uniqueAdjacencyPairs, areaCenter, exitPoint, type Area, type AreaId } from '~~/shared/map/areas'

// T20: il GameMap passa areas + pairs derivati dalla GeneratedMap quando
// presente. In assenza fallback alle costanti legacy.
// v2d-shape-B: lo stile della strada cambia col tipo di mappa. urban
// (city) → asfalto a due corsie con linea bianca centrale; path (country)
// → sentiero sterrato beige tratteggiato; wasteland → strada crepata
// rossiccia con interruzioni; mixed/legacy → fallback asfalto MVP.
type RoadStyle = 'urban' | 'path' | 'wasteland' | 'mixed'

const props = defineProps<{
  areas?: readonly Area[]
  pairs?: ReadonlyArray<readonly [string, string]>
  mapTypeId?: string | null
}>()

const roadStyle = computed<RoadStyle>(() => {
  switch (props.mapTypeId) {
    case 'city': return 'urban'
    case 'country': return 'path'
    case 'wasteland': return 'wasteland'
    default: return 'mixed'
  }
})

const effectiveAreas = computed<readonly Area[]>(() => props.areas ?? LEGACY_AREAS)

const areaById = computed(() => {
  const m = new Map<string, Area>()
  for (const a of effectiveAreas.value) m.set(a.id, a)
  return m
})

const effectivePairs = computed<ReadonlyArray<readonly [string, string]>>(() => {
  if (props.pairs) return props.pairs
  return uniqueAdjacencyPairs() as ReadonlyArray<readonly [AreaId, AreaId]>
})

// v2d-shape-B: in modalità multi-mappa (mapTypeId valorizzato) le strade
// partono e arrivano direttamente al CENTROIDE dell'area (= marker central),
// così visivamente si "innestano" nel pin della zona, look cartina vera.
// In modalità legacy (mapTypeId null) restano sul bordo bbox come MVP.
const useCentroids = computed(() => props.mapTypeId !== null && props.mapTypeId !== undefined)

const roads = computed(() => {
  return effectivePairs.value.map(([a, b]) => {
    const areaA = areaById.value.get(a)
    const areaB = areaById.value.get(b)
    if (!areaA || !areaB) return null
    const centerA = areaCenter(areaA)
    const centerB = areaCenter(areaB)
    const startPoint = useCentroids.value ? centerA : exitPoint(areaA, centerB)
    const endPoint = useCentroids.value ? centerB : exitPoint(areaB, centerA)
    return {
      id: `${a}::${b}`,
      x1: startPoint.x, y1: startPoint.y,
      x2: endPoint.x, y2: endPoint.y
    }
  }).filter((r): r is { id: string, x1: number, y1: number, x2: number, y2: number } => r !== null)
})
</script>

<template>
  <g pointer-events="none">
    <!-- urban: asfalto a 3 layer (bordo + manto + linea bianca) -->
    <template v-if="roadStyle === 'urban'">
      <line
        v-for="r in roads"
        :key="`${r.id}-outer`"
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#1a1e1b"
        stroke-width="11"
        stroke-linecap="round"
      />
      <line
        v-for="r in roads"
        :key="`${r.id}-inner`"
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#2a2f2c"
        stroke-width="7"
        stroke-linecap="round"
      />
      <line
        v-for="r in roads"
        :key="`${r.id}-center`"
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#cfcabf"
        stroke-width="0.7"
        stroke-dasharray="6 8"
        stroke-linecap="butt"
        opacity="0.55"
      />
    </template>

    <!-- path: sentiero sterrato beige, dash più lungo, niente linea centrale -->
    <template v-else-if="roadStyle === 'path'">
      <line
        v-for="r in roads"
        :key="`${r.id}-outer`"
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#3b3023"
        stroke-width="9"
        stroke-linecap="round"
        opacity="0.8"
      />
      <line
        v-for="r in roads"
        :key="`${r.id}-inner`"
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#7a6648"
        stroke-width="5"
        stroke-dasharray="14 6"
        stroke-linecap="round"
        opacity="0.85"
      />
    </template>

    <!-- wasteland: strada crepata rossiccia con tratti spezzati -->
    <template v-else-if="roadStyle === 'wasteland'">
      <line
        v-for="r in roads"
        :key="`${r.id}-outer`"
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#1c1612"
        stroke-width="10"
        stroke-linecap="round"
      />
      <line
        v-for="r in roads"
        :key="`${r.id}-inner`"
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#5b3e2c"
        stroke-width="6"
        stroke-dasharray="22 5 4 5"
        stroke-linecap="butt"
        opacity="0.9"
      />
      <line
        v-for="r in roads"
        :key="`${r.id}-crack`"
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#a04432"
        stroke-width="0.8"
        stroke-dasharray="3 14"
        stroke-linecap="butt"
        opacity="0.6"
      />
    </template>

    <!-- mixed/legacy fallback: stile MVP -->
    <template v-else>
      <line
        v-for="r in roads"
        :key="`${r.id}-outer`"
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#1a1e1b"
        stroke-width="11"
        stroke-linecap="round"
      />
      <line
        v-for="r in roads"
        :key="`${r.id}-inner`"
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#2a2f2c"
        stroke-width="7"
        stroke-linecap="round"
      />
      <line
        v-for="r in roads"
        :key="`${r.id}-center`"
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#5a6057"
        stroke-width="0.6"
        stroke-dasharray="4 6"
        stroke-linecap="butt"
        opacity="0.6"
      />
    </template>
  </g>
</template>
