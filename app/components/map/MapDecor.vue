<script setup lang="ts">
import { computed } from 'vue'
import { usePartyStore } from '~/stores/party'
import { usePartySeed } from '~/composables/usePartySeed'
import { mulberry32, seedFromString } from '~~/shared/seed/prng'
import { AREAS as LEGACY_AREAS, areaCenter, type Area } from '~~/shared/map/areas'

interface Building {
  id: string
  x: number
  y: number
  w: number
  h: number
  shade: string
}

// T20: GameMap passa le aree effettive (legacy o derivate da GeneratedMap).
const props = defineProps<{
  areas?: readonly Area[]
}>()

const effectiveAreas = computed<readonly Area[]>(() => props.areas ?? LEGACY_AREAS)

const partySeed = usePartySeed()
const party = usePartyStore(partySeed)

const buildings = computed<Building[]>(() => {
  const seed = party.party?.seed ?? 'fallback'
  const rng = mulberry32(seedFromString(seed + '|decor'))
  const BUILDINGS_PER_AREA = 14
  const items: Building[] = []
  const allAreas = effectiveAreas.value
  for (const area of allAreas) {
    const center = areaCenter(area)
    for (let i = 0; i < BUILDINGS_PER_AREA; i++) {
      // Posiziona attorno all'area (in un anello di distanza), skippiamo il centro
      const angle = rng() * Math.PI * 2
      const distance = 80 + rng() * 110
      const x = center.x + Math.cos(angle) * distance
      const y = center.y + Math.sin(angle) * distance
      if (x < 10 || x > 980 || y < 10 || y > 680) continue
      // Skip se dentro un altra area (evita sovrapposizione)
      const insideArea = allAreas.some(a =>
        x >= a.svg.x - 6 && x <= a.svg.x + a.svg.w + 6
        && y >= a.svg.y - 6 && y <= a.svg.y + a.svg.h + 6
      )
      if (insideArea) continue
      const w = 8 + rng() * 16
      const h = 8 + rng() * 16
      const shadeIdx = Math.floor(rng() * 4)
      const shades = ['#161a17', '#1c211d', '#232823', '#2d332e']
      items.push({
        id: `${area.id}-${i}`,
        x: x - w / 2,
        y: y - h / 2,
        w,
        h,
        shade: shades[shadeIdx]!
      })
    }
  }
  return items
})

// Grid di strade secondarie: linee orizzontali e verticali sparse (background grid)
const gridLines = computed(() => {
  const seed = party.party?.seed ?? 'fallback'
  const rng = mulberry32(seedFromString(seed + '|grid'))
  const lines: Array<{ id: string, x1: number, y1: number, x2: number, y2: number }> = []
  // Linee orizzontali
  for (let i = 0; i < 6; i++) {
    const y = 30 + rng() * 640
    lines.push({ id: `h-${i}`, x1: rng() * 80, y1: y, x2: 900 + rng() * 90, y2: y })
  }
  // Linee verticali
  for (let i = 0; i < 6; i++) {
    const x = 30 + rng() * 940
    lines.push({ id: `v-${i}`, x1: x, y1: rng() * 40, x2: x, y2: 620 + rng() * 70 })
  }
  return lines
})
</script>

<template>
  <g pointer-events="none">
    <!-- Grid stradale di sfondo -->
    <line
      v-for="l in gridLines"
      :key="l.id"
      :x1="l.x1"
      :y1="l.y1"
      :x2="l.x2"
      :y2="l.y2"
      stroke="#1a1e1b"
      stroke-width="4"
      opacity="0.4"
    />
    <line
      v-for="l in gridLines"
      :key="`${l.id}-inner`"
      :x1="l.x1"
      :y1="l.y1"
      :x2="l.x2"
      :y2="l.y2"
      stroke="#242a26"
      stroke-width="2.5"
      opacity="0.5"
    />
    <!-- Edifici sparsi -->
    <rect
      v-for="b in buildings"
      :key="b.id"
      :x="b.x"
      :y="b.y"
      :width="b.w"
      :height="b.h"
      :fill="b.shade"
      stroke="#0b0d0c"
      stroke-width="0.5"
      opacity="0.7"
    />
  </g>
</template>
