<script setup lang="ts">
import { computed } from 'vue'
import type { Area } from '~~/shared/map/areas'

interface Props {
  area: Area
  state: {
    status: 'intact' | 'infested' | 'ruined' | 'closed'
    customName: string | null
  } | null
  isCurrent: boolean
  isAdjacent: boolean
  isMaster: boolean
  playerCount: number
  // v2d-shape-B: poligono Voronoi pre-calcolato in coord ASSOLUTE del
  // viewBox (NON relative al bbox). Quando presente sostituisce sia il
  // rect bbox sia il polygon organico per il rendering.
  voronoiPoints?: string | null
  // v2d-shape-B: rendering "splittato" per layering corretto in mappe
  // Voronoi (poligono base sotto strade/decor, marker+label sopra):
  // - 'all' (default): renderizza tutto in un blocco (legacy MVP)
  // - 'base': solo poligono fondo + pattern status (cliccabile, hover)
  // - 'marker': solo marker centrale + label + player count (no events)
  layer?: 'all' | 'base' | 'marker'
  // v2d-fog: se true l'area è "coperta da fog of war" (non ancora
  // esplorata dalla party). Il base fill diventa nero solido e marker/
  // label sono sostituiti da un punto interrogativo.
  fog?: boolean
}
const props = defineProps<Props>()
defineEmits<{ (e: 'click'): void }>()

const isVoronoi = computed(() => !!props.voronoiPoints)
const isPolygon = computed(() => !isVoronoi.value && props.area.svg.shape === 'polygon' && !!props.area.svg.points)
const polyPoints = computed(() => props.area.svg.points ?? '')
const showBase = computed(() => !props.layer || props.layer === 'all' || props.layer === 'base')
const showMarker = computed(() => !props.layer || props.layer === 'all' || props.layer === 'marker')

function strokeColor(): string {
  if (props.fog) return '#1f1f1f'
  if (props.isCurrent) return 'var(--z-green-100)'
  if (props.isAdjacent) return 'var(--z-green-300)'
  // v2d-shape-B: per le celle Voronoi neutre niente stroke — i bordi
  // condivisi sono disegnati una sola volta dal mesh path globale in
  // GameMap. Per legacy/organic manteniamo il bordo per cella.
  if (isVoronoi.value) return 'transparent'
  return 'var(--z-green-700)'
}
function baseFillUrl(): string {
  return props.fog ? 'url(#area-fog)' : 'url(#area-bg)'
}
function strokeWidth(): number {
  return props.isCurrent ? 2.5 : 1.5
}
function displayName(): string {
  return props.state?.customName ?? props.area.name
}
function status(): string {
  return props.state?.status ?? 'intact'
}
function fillOpacity(): number {
  // Voronoi: fill semi-trasparente così MapDecor/MapRoads renderizzati SOPRA
  // restano visibili. Con i pattern infested/ruined giocano da overlay.
  if (isVoronoi.value) {
    if (status() === 'closed') return 0.55
    if (status() === 'ruined') return 0.45
    return 0.40
  }
  // Legacy/organic: fill pieno come MVP.
  if (status() === 'ruined') return 0.65
  if (status() === 'closed') return 0.5
  return 1
}
function cursorStyle(): string {
  if (props.isCurrent) return 'cursor: pointer'
  if (props.isMaster) return 'cursor: pointer'
  const s = status()
  if (s === 'closed') return 'cursor: not-allowed'
  if (props.isAdjacent) return 'cursor: pointer'
  return 'cursor: default'
}
</script>

<template>
  <g>
    <!-- ── LAYER BASE: poligono Voronoi/organico/rect, cliccabile, hover. ── -->
    <g
      v-if="showBase"
      class="map-area-base"
      :style="cursorStyle()"
      @click="$emit('click')"
    >
      <polygon
        v-if="isVoronoi"
        :points="voronoiPoints!"
        :fill="baseFillUrl()"
        :stroke="strokeColor()"
        :stroke-width="strokeWidth()"
        :fill-opacity="fillOpacity()"
        stroke-linejoin="round"
      />
      <polygon
        v-else-if="isPolygon"
        :points="polyPoints"
        :transform="`translate(${area.svg.x}, ${area.svg.y})`"
        :fill="baseFillUrl()"
        :stroke="strokeColor()"
        :stroke-width="strokeWidth()"
        :fill-opacity="fillOpacity()"
        stroke-linejoin="round"
      />
      <rect
        v-else
        :x="area.svg.x"
        :y="area.svg.y"
        :width="area.svg.w"
        :height="area.svg.h"
        rx="8"
        ry="8"
        :fill="baseFillUrl()"
        :stroke="strokeColor()"
        :stroke-width="strokeWidth()"
        :fill-opacity="fillOpacity()"
      />
      <!-- pattern status: per Voronoi attaccato al poligono, per legacy al rect -->
      <polygon
        v-if="isVoronoi && status() === 'infested'"
        :points="voronoiPoints!"
        fill="url(#area-infested)"
        opacity="0.6"
        pointer-events="none"
      />
      <polygon
        v-else-if="isPolygon && status() === 'infested'"
        :points="polyPoints"
        :transform="`translate(${area.svg.x}, ${area.svg.y})`"
        fill="url(#area-infested)"
        opacity="0.6"
        pointer-events="none"
      />
      <rect
        v-else-if="status() === 'infested'"
        :x="area.svg.x"
        :y="area.svg.y"
        :width="area.svg.w"
        :height="area.svg.h"
        rx="8"
        ry="8"
        fill="url(#area-infested)"
        opacity="0.6"
        pointer-events="none"
      />
      <polygon
        v-if="isVoronoi && status() === 'ruined'"
        :points="voronoiPoints!"
        fill="url(#area-ruined)"
        opacity="0.35"
        pointer-events="none"
      />
      <polygon
        v-else-if="isPolygon && status() === 'ruined'"
        :points="polyPoints"
        :transform="`translate(${area.svg.x}, ${area.svg.y})`"
        fill="url(#area-ruined)"
        opacity="0.35"
        pointer-events="none"
      />
      <rect
        v-else-if="status() === 'ruined'"
        :x="area.svg.x"
        :y="area.svg.y"
        :width="area.svg.w"
        :height="area.svg.h"
        rx="8"
        ry="8"
        fill="url(#area-ruined)"
        opacity="0.35"
        pointer-events="none"
      />
    </g>

    <!-- ── LAYER MARKER: marker centrale + label + closed icon + player count.
         Renderizzato sopra strade/decor in modalità Voronoi.
         In fog: solo "?" centrale, niente label né player count. ── -->
    <g
      v-if="showMarker"
      :transform="`translate(${area.svg.x}, ${area.svg.y})`"
      pointer-events="none"
    >
      <g
        v-if="fog"
        :transform="`translate(${area.svg.w / 2}, ${area.svg.h / 2})`"
      >
        <circle
          r="9"
          fill="#0a0a0a"
          stroke="#3a3a3a"
          stroke-width="1.5"
        />
        <text
          text-anchor="middle"
          y="4"
          font-size="13"
          font-weight="700"
          fill="#5a5a5a"
        >
          ?
        </text>
      </g>
      <g
        v-else-if="isVoronoi"
        :transform="`translate(${area.svg.w / 2}, ${area.svg.h / 2})`"
      >
        <circle
          r="6"
          fill="var(--z-bg-900)"
          :stroke="strokeColor()"
          stroke-width="2"
        />
        <circle
          r="2"
          :fill="strokeColor()"
        />
      </g>
      <g
        v-if="status() === 'closed'"
        :transform="`translate(${area.svg.w / 2 - 12}, ${area.svg.h / 2 - 12})`"
      >
        <rect
          x="4"
          y="10"
          width="16"
          height="12"
          rx="2"
          fill="var(--z-text-lo)"
        />
        <path
          d="M 8 10 L 8 6 A 4 4 0 0 1 16 6 L 16 10"
          stroke="var(--z-text-lo)"
          stroke-width="2"
          fill="none"
        />
      </g>
      <g
        v-if="!fog"
        :transform="isVoronoi
          ? `translate(${area.svg.w / 2}, ${area.svg.h / 2 - 16})`
          : `translate(${area.svg.w / 2}, ${area.svg.h / 2 + 4})`"
      >
        <rect
          v-if="isVoronoi"
          :x="-(displayName().length * 3.6 + 6)"
          y="-9"
          :width="displayName().length * 7.2 + 12"
          height="14"
          rx="3"
          ry="3"
          fill="var(--z-bg-900)"
          opacity="0.85"
        />
        <text
          text-anchor="middle"
          :y="isVoronoi ? 1 : 0"
          font-size="11"
          font-weight="700"
          :fill="isCurrent ? 'var(--z-green-100)' : 'var(--z-text-hi)'"
          :opacity="status() === 'closed' ? 0.5 : 1"
        >
          {{ displayName() }}
        </text>
      </g>
      <g
        v-if="playerCount > 0 && !fog"
        :transform="`translate(${area.svg.w - 18}, 14)`"
      >
        <circle
          r="10"
          fill="var(--z-bg-700)"
          stroke="var(--z-green-500)"
          stroke-width="1.2"
        />
        <text
          text-anchor="middle"
          y="4"
          font-size="11"
          font-weight="700"
          fill="var(--z-green-300)"
        >
          {{ playerCount }}
        </text>
      </g>
    </g>
  </g>
</template>

<style scoped>
/* v2d-shape-B: hover effect sul poligono base. Aumenta saturazione fill
   e intensità stroke per feedback visivo immediato. */
.map-area-base polygon,
.map-area-base rect {
  transition: fill-opacity 0.12s ease, stroke-width 0.12s ease, filter 0.12s ease;
}
.map-area-base:hover polygon:not([pointer-events="none"]),
.map-area-base:hover rect:not([pointer-events="none"]) {
  fill-opacity: 0.7;
  filter: brightness(1.25);
}
</style>
