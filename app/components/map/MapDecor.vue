<script setup lang="ts">
import { computed } from 'vue'
import { usePartyStore } from '~/stores/party'
import { usePartySeed } from '~/composables/usePartySeed'
import { mulberry32, seedFromString } from '~~/shared/seed/prng'
import { AREAS as LEGACY_AREAS, type Area } from '~~/shared/map/areas'
import AreaSprite from '~/components/map/AreaSprite.vue'

// Decor "ricco" per la mappa principale: stessi sprite del dettaglio
// area (alberi, edifici, auto, macerie, casse, lampioni, fuochi) ma a
// scala piccola, deterministico per (areaId + status). 4-6 sprite per
// area, posizionati dentro il bbox dell'area lasciando libero il
// centro per il marker della cella.
type DecorKind = 'tree' | 'building' | 'car' | 'rubble' | 'crate' | 'lamp' | 'fire'
type AreaStatus = 'intact' | 'infested' | 'ruined' | 'closed'

interface DecorPlacement {
  id: string
  kind: DecorKind
  x: number
  y: number
  scale: number
  rot: number
}

const props = defineProps<{
  areas?: readonly Area[]
}>()

const effectiveAreas = computed<readonly Area[]>(() => props.areas ?? LEGACY_AREAS)

const partySeed = usePartySeed()
const party = usePartyStore(partySeed)

const SPRITES_PER_AREA = 5

const palette: Record<AreaStatus, DecorKind[]> = {
  intact: ['tree', 'building', 'crate', 'lamp', 'tree'],
  infested: ['car', 'crate', 'fire', 'rubble', 'building'],
  ruined: ['rubble', 'rubble', 'car', 'building', 'crate'],
  closed: ['building', 'crate', 'lamp', 'building']
}

const statusByArea = computed(() => {
  const m = new Map<string, AreaStatus>()
  for (const s of party.areasState) m.set(s.areaId, s.status)
  return m
})

const placements = computed<DecorPlacement[]>(() => {
  const out: DecorPlacement[] = []
  const seedStr = party.party?.seed ?? 'fallback'
  for (const area of effectiveAreas.value) {
    const status = statusByArea.value.get(area.id) ?? 'intact'
    const pool = palette[status]
    const rng = mulberry32(seedFromString(`${seedStr}|decor|${area.id}|${status}`))
    // Safe zone centrale: lascia visibile il marker centrale (cerchio +
    // label nelle celle voronoi). Tieni gli sprite dai bordi del bbox.
    const cx = area.svg.x + area.svg.w / 2
    const cy = area.svg.y + area.svg.h / 2
    const safeR = Math.min(area.svg.w, area.svg.h) * 0.20
    for (let i = 0; i < SPRITES_PER_AREA; i++) {
      let x = 0
      let y = 0
      let attempts = 0
      do {
        // Padding interno 8 unità così gli sprite non sbordano dal bbox.
        x = area.svg.x + 8 + rng() * Math.max(0, area.svg.w - 16)
        y = area.svg.y + 8 + rng() * Math.max(0, area.svg.h - 16)
        attempts++
      } while (Math.hypot(x - cx, y - cy) < safeR && attempts < 6)
      const kind = pool[Math.floor(rng() * pool.length)]!
      // Scala piccola — l'unità "naturale" degli sprite (~20x40 unità) è
      // rapportata a un bbox area che mediamente vale 100-200 unità → 0.18–0.30.
      const scale = 0.18 + rng() * 0.14
      const rot = Math.floor(rng() * 360)
      out.push({ id: `${area.id}-${i}`, kind, x, y, scale, rot })
    }
  }
  return out
})
</script>

<template>
  <g pointer-events="none">
    <g
      v-for="d in placements"
      :key="d.id"
      :transform="`translate(${d.x}, ${d.y}) rotate(${d.rot}) scale(${d.scale})`"
    >
      <AreaSprite :kind="d.kind" />
    </g>
  </g>
</template>
