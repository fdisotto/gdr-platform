<script setup lang="ts">
import { computed } from 'vue'
import { usePartyStore } from '~/stores/party'
import { usePartySeed } from '~/composables/usePartySeed'
import { mulberry32, seedFromString } from '~~/shared/seed/prng'
import { AREAS as LEGACY_AREAS, type Area } from '~~/shared/map/areas'
import AreaSprite from '~/components/map/AreaSprite.vue'

// Decor "ricco" per la mappa principale: stessi sprite del dettaglio
// area (alberi, edifici, auto, macerie, casse, lampioni, fuochi)
// disposti dentro ogni cella, scalati in base al bbox dell'area così
// restano visibili anche su celle piccole. Posizione e rotazione
// deterministiche su (partySeed, areaId, status, mapTypeId).
type DecorKind = 'tree' | 'building' | 'car' | 'rubble' | 'crate' | 'lamp' | 'fire'
type AreaStatus = 'intact' | 'infested' | 'ruined' | 'closed'
type MapTypeId = 'city' | 'country' | 'wasteland' | 'mixed'

interface DecorPlacement {
  id: string
  kind: DecorKind
  x: number
  y: number
  scale: number
  rot: number
}

interface GridLine {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

const props = defineProps<{
  areas?: readonly Area[]
  // v2d-shape-B: il tipo di mappa pilota la palette del decor — city
  // dominata da edifici, country da alberi, wasteland da macerie.
  // Quando assente fallback a 'mixed' (palette equilibrata).
  mapTypeId?: string | null
}>()

const effectiveAreas = computed<readonly Area[]>(() => props.areas ?? LEGACY_AREAS)

const partySeed = usePartySeed()
const party = usePartyStore(partySeed)

// Palette differenziate per (mapTypeId × status). I duplicati nei pool
// aumentano la frequenza dello sprite e modellano l'ambiente:
// - city: edifici dominanti, lampioni, qualche auto
// - country: alberi dominanti, edifici sporadici
// - wasteland: macerie ovunque, alberi morti rari, fuochi spontanei
// - mixed (legacy/fallback): mix bilanciato di tutto
const PALETTES: Record<MapTypeId, Record<AreaStatus, DecorKind[]>> = {
  city: {
    intact: ['building', 'building', 'building', 'lamp', 'lamp', 'car', 'crate'],
    infested: ['building', 'car', 'fire', 'rubble', 'building', 'crate'],
    ruined: ['rubble', 'rubble', 'building', 'car', 'rubble', 'crate'],
    closed: ['building', 'building', 'lamp', 'crate', 'rubble']
  },
  country: {
    intact: ['tree', 'tree', 'tree', 'tree', 'building', 'crate', 'lamp'],
    infested: ['tree', 'tree', 'rubble', 'fire', 'car', 'building'],
    ruined: ['tree', 'rubble', 'rubble', 'building', 'tree'],
    closed: ['tree', 'building', 'crate', 'tree']
  },
  wasteland: {
    intact: ['rubble', 'rubble', 'crate', 'car', 'lamp', 'tree'],
    infested: ['rubble', 'fire', 'fire', 'car', 'rubble', 'crate'],
    ruined: ['rubble', 'rubble', 'rubble', 'rubble', 'car'],
    closed: ['rubble', 'rubble', 'crate', 'building']
  },
  mixed: {
    intact: ['tree', 'building', 'crate', 'lamp', 'tree', 'building'],
    infested: ['car', 'crate', 'fire', 'rubble', 'building', 'fire'],
    ruined: ['rubble', 'rubble', 'car', 'building', 'crate', 'rubble'],
    closed: ['building', 'crate', 'lamp', 'building', 'rubble']
  }
}
function paletteForMap(typeId: string | null | undefined): Record<AreaStatus, DecorKind[]> {
  if (typeId === 'city' || typeId === 'country' || typeId === 'wasteland') return PALETTES[typeId]
  return PALETTES.mixed
}

const statusByArea = computed(() => {
  const m = new Map<string, AreaStatus>()
  for (const s of party.areasState) m.set(s.areaId, s.status)
  return m
})

const placements = computed<DecorPlacement[]>(() => {
  const out: DecorPlacement[] = []
  const seedStr = party.party?.seed ?? 'fallback'
  const palette = paletteForMap(props.mapTypeId)
  // mapTypeId nel seed così cambiando il tipo (es. drop+ricreate) cambia
  // anche la disposizione, evitando l'effetto "stessa scena diverso bg".
  const typeKey = props.mapTypeId ?? 'mixed'
  for (const area of effectiveAreas.value) {
    const status = statusByArea.value.get(area.id) ?? 'intact'
    const pool = palette[status]
    const rng = mulberry32(seedFromString(`${seedStr}|decor|${typeKey}|${area.id}|${status}`))
    // Numero sprite proporzionale all'area: bbox grande → più sprite,
    // bbox piccola → meno. Range 6-14.
    const areaSize = area.svg.w * area.svg.h
    const count = Math.max(6, Math.min(14, Math.round(Math.sqrt(areaSize) / 14)))
    // Scala proporzionale al lato minore dell'area: più la cella è
    // grande più gli sprite possono essere visibili. Range 0.30–0.55.
    const minDim = Math.min(area.svg.w, area.svg.h)
    const baseScale = Math.max(0.30, Math.min(0.55, minDim / 200))
    // Safe zone centrale per non coprire il marker centrale (cerchio +
    // label). Ridotta rispetto a prima: lasciamo più spazio agli sprite.
    const cx = area.svg.x + area.svg.w / 2
    const cy = area.svg.y + area.svg.h / 2
    const safeR = Math.min(area.svg.w, area.svg.h) * 0.14
    for (let i = 0; i < count; i++) {
      let x = 0
      let y = 0
      let attempts = 0
      do {
        x = area.svg.x + 6 + rng() * Math.max(0, area.svg.w - 12)
        y = area.svg.y + 6 + rng() * Math.max(0, area.svg.h - 12)
        attempts++
      } while (Math.hypot(x - cx, y - cy) < safeR && attempts < 8)
      const kind = pool[Math.floor(rng() * pool.length)]!
      const scale = baseScale * (0.85 + rng() * 0.5)
      const rot = Math.floor(rng() * 360)
      out.push({ id: `${area.id}-${i}`, kind, x, y, scale, rot })
    }
  }
  return out
})

// Grid stradale di sfondo: linee orizzontali e verticali sparse che
// passano fra le celle. Aiuta a riempire la sensazione di "mappa
// urbana" anche senza zoom sulle singole zone.
const gridLines = computed<GridLine[]>(() => {
  const seedStr = party.party?.seed ?? 'fallback'
  const rng = mulberry32(seedFromString(seedStr + '|grid'))
  const lines: GridLine[] = []
  for (let i = 0; i < 7; i++) {
    const y = 30 + rng() * 640
    lines.push({ id: `h-${i}`, x1: rng() * 80, y1: y, x2: 900 + rng() * 90, y2: y })
  }
  for (let i = 0; i < 7; i++) {
    const x = 30 + rng() * 940
    lines.push({ id: `v-${i}`, x1: x, y1: rng() * 40, x2: x, y2: 620 + rng() * 70 })
  }
  return lines
})
</script>

<template>
  <g pointer-events="none">
    <!-- Grid stradale di sfondo (sotto alle celle, sopra al bg) -->
    <g opacity="0.55">
      <line
        v-for="l in gridLines"
        :key="`out-${l.id}`"
        :x1="l.x1"
        :y1="l.y1"
        :x2="l.x2"
        :y2="l.y2"
        stroke="#1a1e1b"
        stroke-width="4"
      />
      <line
        v-for="l in gridLines"
        :key="`in-${l.id}`"
        :x1="l.x1"
        :y1="l.y1"
        :x2="l.x2"
        :y2="l.y2"
        stroke="#242a26"
        stroke-width="2.5"
      />
    </g>
    <!-- Sprite dentro ogni cella -->
    <g
      v-for="d in placements"
      :key="d.id"
      :transform="`translate(${d.x}, ${d.y}) rotate(${d.rot}) scale(${d.scale})`"
    >
      <AreaSprite :kind="d.kind" />
    </g>
  </g>
</template>
