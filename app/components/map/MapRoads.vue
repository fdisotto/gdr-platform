<script setup lang="ts">
import { computed } from 'vue'
import { AREAS as LEGACY_AREAS, uniqueAdjacencyPairs, areaCenter, exitPoint, type Area, type AreaId } from '~~/shared/map/areas'

// T20: il GameMap passa areas + pairs derivati dalla GeneratedMap quando
// presente. In assenza fallback alle costanti legacy.
// v2d-shape-B: lo stile di default deriva dal tipo di mappa (urban/path/
// wasteland/mixed). v2d-roads: il master può forzare per-strada uno dei
// 5 stili disponibili (urban, path, wasteland, highway, bridge) tramite
// la prop road-kinds (Map<"areaA::areaB" → kind>).
type RoadKind = 'urban' | 'path' | 'wasteland' | 'highway' | 'bridge' | 'mixed'

const props = defineProps<{
  areas?: readonly Area[]
  pairs?: ReadonlyArray<readonly [string, string]>
  mapTypeId?: string | null
  roadKinds?: Map<string, RoadKind>
  // v2d-edit: coppie "a::b" (a<b) la cui strada è marcata broken dal
  // master: vengono renderizzate con stile distinto (linea spezzata
  // rossa) sopra la strada base.
  brokenPairs?: Set<string>
}>()

const defaultRoadKind = computed<RoadKind>(() => {
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

// Modalità multi-mappa: in v2d (mapTypeId valorizzato) le strade partono
// dal CENTROIDE area = marker centrale. Fallback exitPoint per legacy MVP.
const useCentroids = computed(() => props.mapTypeId !== null && props.mapTypeId !== undefined)

interface Road {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  kind: RoadKind
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`
}
// Esposto al template per il filtro broken-overlay (le funzioni nello
// `<script setup>` sono già accessibili come props.* nello scope template,
// ma teniamo l'export-name esplicito per chiarezza).

const roads = computed<Road[]>(() => {
  return effectivePairs.value.map(([a, b]) => {
    const areaA = areaById.value.get(a)
    const areaB = areaById.value.get(b)
    if (!areaA || !areaB) return null
    const centerA = areaCenter(areaA)
    const centerB = areaCenter(areaB)
    const startPoint = useCentroids.value ? centerA : exitPoint(areaA, centerB)
    const endPoint = useCentroids.value ? centerB : exitPoint(areaB, centerA)
    const kindOverride = props.roadKinds?.get(pairKey(a, b))
    return {
      id: `${a}::${b}`,
      x1: startPoint.x, y1: startPoint.y,
      x2: endPoint.x, y2: endPoint.y,
      kind: kindOverride ?? defaultRoadKind.value
    }
  }).filter((r): r is Road => r !== null)
})

function roadsOfKind(k: RoadKind): Road[] {
  return roads.value.filter(r => r.kind === k)
}
</script>

<template>
  <g pointer-events="none">
    <!-- urban: asfalto a 3 layer (bordo + manto + linea bianca) -->
    <template
      v-for="r in roadsOfKind('urban')"
      :key="`u-${r.id}`"
    >
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#1a1e1b"
        stroke-width="11"
        stroke-linecap="round"
      />
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#2a2f2c"
        stroke-width="7"
        stroke-linecap="round"
      />
      <line
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

    <!-- path: sentiero sterrato beige -->
    <template
      v-for="r in roadsOfKind('path')"
      :key="`p-${r.id}`"
    >
      <line
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

    <!-- wasteland: strada crepata -->
    <template
      v-for="r in roadsOfKind('wasteland')"
      :key="`w-${r.id}`"
    >
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#1c1612"
        stroke-width="10"
        stroke-linecap="round"
      />
      <line
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

    <!-- highway: doppia corsia + bordi gialli (look interstate) -->
    <template
      v-for="r in roadsOfKind('highway')"
      :key="`h-${r.id}`"
    >
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#0e1110"
        stroke-width="15"
        stroke-linecap="round"
      />
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#e6c34d"
        stroke-width="13"
        stroke-linecap="butt"
        opacity="0.55"
      />
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#3a3f3c"
        stroke-width="11"
        stroke-linecap="round"
      />
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#e6c34d"
        stroke-width="0.7"
        opacity="0.85"
      />
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#ffffff"
        stroke-width="0.7"
        stroke-dasharray="10 6"
        stroke-linecap="butt"
        opacity="0.7"
      />
    </template>

    <!-- bridge: passerella sopra acqua, bordo doppio, plank dashed -->
    <template
      v-for="r in roadsOfKind('bridge')"
      :key="`b-${r.id}`"
    >
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#22507a"
        stroke-width="13"
        stroke-linecap="butt"
        opacity="0.6"
      />
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#7c5a3a"
        stroke-width="8"
        stroke-linecap="butt"
      />
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#3a2a1a"
        stroke-width="0.8"
        stroke-dasharray="3 4"
        stroke-linecap="butt"
        opacity="0.85"
      />
    </template>

    <!-- mixed/legacy fallback: stile MVP -->
    <template
      v-for="r in roadsOfKind('mixed')"
      :key="`m-${r.id}`"
    >
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#1a1e1b"
        stroke-width="11"
        stroke-linecap="round"
      />
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#2a2f2c"
        stroke-width="7"
        stroke-linecap="round"
      />
      <line
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

    <!-- v2d-edit: overlay "strada interrotta". Renderizzato sopra a
         qualsiasi stile base: tratto rosso interrotto + glifo X al
         centro per segnalare che il passaggio non è praticabile. -->
    <template
      v-for="r in roads.filter(rr => props.brokenPairs?.has(pairKey(rr.id.split('::')[0]!, rr.id.split('::')[1]!)))"
      :key="`brk-${r.id}`"
    >
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="#0b0d0c"
        stroke-width="14"
        stroke-linecap="butt"
        opacity="0.85"
      />
      <line
        :x1="r.x1"
        :y1="r.y1"
        :x2="r.x2"
        :y2="r.y2"
        stroke="var(--z-blood-300, #c26f8e)"
        stroke-width="4"
        stroke-dasharray="6 8"
        stroke-linecap="round"
        opacity="0.95"
      />
      <g
        :transform="`translate(${(r.x1 + r.x2) / 2}, ${(r.y1 + r.y2) / 2})`"
      >
        <circle
          r="11"
          fill="#0b0d0c"
          stroke="var(--z-blood-300, #c26f8e)"
          stroke-width="2"
        />
        <line
          x1="-5"
          y1="-5"
          x2="5"
          y2="5"
          stroke="var(--z-blood-300, #c26f8e)"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <line
          x1="5"
          y1="-5"
          x2="-5"
          y2="5"
          stroke="var(--z-blood-300, #c26f8e)"
          stroke-width="2.5"
          stroke-linecap="round"
        />
      </g>
    </template>
  </g>
</template>
