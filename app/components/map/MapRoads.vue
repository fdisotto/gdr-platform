<script setup lang="ts">
import { computed } from 'vue'
import { AREAS, uniqueAdjacencyPairs, areaCenter, exitPoint, type AreaId } from '~~/shared/map/areas'

const areaById = computed(() => {
  const m = new Map<AreaId, typeof AREAS[number]>()
  for (const a of AREAS) m.set(a.id, a)
  return m
})

const roads = computed(() => {
  const pairs = uniqueAdjacencyPairs()
  return pairs.map(([a, b]) => {
    const areaA = areaById.value.get(a)
    const areaB = areaById.value.get(b)
    if (!areaA || !areaB) return null
    const centerA = areaCenter(areaA)
    const centerB = areaCenter(areaB)
    const startPoint = exitPoint(areaA, centerB)
    const endPoint = exitPoint(areaB, centerA)
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
    <!-- Strada (bordi scuri) -->
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
    <!-- Asfalto -->
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
    <!-- Linea centrale tratteggiata -->
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
  </g>
</template>
