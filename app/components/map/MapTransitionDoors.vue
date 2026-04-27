<script setup lang="ts">
import { computed } from 'vue'
import type { Area } from '~~/shared/map/areas'

interface TransitionOutgoing {
  id: string
  fromMapId: string
  fromAreaId: string
  toMapId: string
  toAreaId: string
  label: string | null
}

const props = defineProps<{
  areas: readonly Area[]
  transitions: TransitionOutgoing[]
  // Logical viewBox della mappa (es. 1000x700) — usato per calcolare la
  // direzione "fuori" verso il bordo più vicino.
  logicalW: number
  logicalH: number
}>()

defineEmits<{
  (e: 'transition-click', toMapId: string, toAreaId: string): void
}>()

interface Door {
  id: string
  toMapId: string
  toAreaId: string
  label: string
  // Linea: dal centro dell'area edge verso un punto fuori, sul bordo.
  x1: number
  y1: number
  x2: number
  y2: number
  // Marker porta (cerchio terminale + label).
  cx: number
  cy: number
}

// Per ogni transition outgoing calcola la "porta": linea che parte dal
// centro dell'area edge e termina ESATTAMENTE sul bordo del viewBox
// nella direzione mappa→area. Così la porta esce visivamente dal frame
// della mappa (con i poligoni Voronoi che riempiono tutto, una linea
// breve di 70px finiva dentro una cella vicina ed era poco riconoscibile).
const doors = computed<Door[]>(() => {
  const cxMap = props.logicalW / 2
  const cyMap = props.logicalH / 2
  const result: Door[] = []
  for (const tr of props.transitions) {
    const area = props.areas.find(a => a.id === tr.fromAreaId)
    if (!area) continue
    const acx = area.svg.x + area.svg.w / 2
    const acy = area.svg.y + area.svg.h / 2
    // Vettore dal centro mappa al centro area (direzione "fuori")
    const dx = acx - cxMap
    const dy = acy - cyMap
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    // Punto di partenza: bordo del bbox area sul lato esterno
    const halfW = area.svg.w / 2
    const halfH = area.svg.h / 2
    const tEdgeX = Math.abs(ux) > 1e-3 ? halfW / Math.abs(ux) : Infinity
    const tEdgeY = Math.abs(uy) > 1e-3 ? halfH / Math.abs(uy) : Infinity
    const tEdge = Math.min(tEdgeX, tEdgeY)
    const startX = acx + ux * tEdge
    const startY = acy + uy * tEdge
    // Punto finale: bordo del viewBox lungo la stessa direzione, con un
    // piccolo margine per non appiccicare il cerchio terminale al bordo
    const MARGIN = 18
    const tBorderX = ux > 1e-3
      ? (props.logicalW - MARGIN - acx) / ux
      : (ux < -1e-3 ? (MARGIN - acx) / ux : Infinity)
    const tBorderY = uy > 1e-3
      ? (props.logicalH - MARGIN - acy) / uy
      : (uy < -1e-3 ? (MARGIN - acy) / uy : Infinity)
    const tBorder = Math.min(tBorderX, tBorderY)
    const endX = acx + ux * tBorder
    const endY = acy + uy * tBorder
    result.push({
      id: tr.id,
      toMapId: tr.toMapId,
      toAreaId: tr.toAreaId,
      label: tr.label || '→',
      x1: startX,
      y1: startY,
      x2: endX,
      y2: endY,
      cx: endX,
      cy: endY
    })
  }
  return result
})
</script>

<template>
  <g class="map-transition-doors">
    <g
      v-for="d in doors"
      :key="d.id"
      class="door"
      style="cursor: pointer"
      @click.stop="$emit('transition-click', d.toMapId, d.toAreaId)"
    >
      <!-- Halo scuro: bordo che fa risaltare la porta sopra qualunque
           cella voronoi sottostante -->
      <line
        :x1="d.x1"
        :y1="d.y1"
        :x2="d.x2"
        :y2="d.y2"
        stroke="#0b0d0c"
        stroke-width="12"
        stroke-linecap="round"
        opacity="0.9"
      />
      <!-- Strada principale rust dashed -->
      <line
        :x1="d.x1"
        :y1="d.y1"
        :x2="d.x2"
        :y2="d.y2"
        stroke="var(--z-rust-300, #d97757)"
        stroke-width="6"
        stroke-linecap="round"
        stroke-dasharray="14 6"
      />
      <!-- Cerchio porta terminale sul bordo del viewBox -->
      <circle
        :cx="d.cx"
        :cy="d.cy"
        r="20"
        fill="#0b0d0c"
        stroke="var(--z-rust-300, #d97757)"
        stroke-width="2.5"
      />
      <circle
        :cx="d.cx"
        :cy="d.cy"
        r="14"
        fill="var(--z-rust-700, #4a2418)"
        stroke="var(--z-rust-300, #d97757)"
        stroke-width="1.5"
      />
      <text
        :x="d.cx"
        :y="d.cy + 6"
        text-anchor="middle"
        font-size="18"
        font-weight="bold"
        fill="var(--z-rust-300, #d97757)"
        style="pointer-events: none; user-select: none"
      >
        →
      </text>
      <!-- Label transition (se non vuota) accanto alla porta -->
      <g
        v-if="d.label && d.label !== '→'"
        :transform="`translate(${d.cx}, ${d.cy - 30})`"
        pointer-events="none"
      >
        <rect
          :x="-(d.label.length * 3.4 + 6)"
          y="-9"
          :width="d.label.length * 6.8 + 12"
          height="14"
          rx="3"
          ry="3"
          fill="#0b0d0c"
          opacity="0.9"
        />
        <text
          text-anchor="middle"
          y="1"
          font-size="11"
          font-weight="600"
          fill="var(--z-rust-300, #d97757)"
        >
          {{ d.label }}
        </text>
      </g>
    </g>
  </g>
</template>
