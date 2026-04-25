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

// Per ogni transition outgoing trova l'area corrispondente, calcola il
// vettore dal centro mappa al centro area e lo proietta fuori dal bordo
// dell'area di un offset fisso. Il punto finale è la "porta" cliccabile.
const doors = computed<Door[]>(() => {
  const cxMap = props.logicalW / 2
  const cyMap = props.logicalH / 2
  const result: Door[] = []
  for (const tr of props.transitions) {
    const area = props.areas.find(a => a.id === tr.fromAreaId)
    if (!area) continue
    const acx = area.svg.x + area.svg.w / 2
    const acy = area.svg.y + area.svg.h / 2
    // Vettore dal centro mappa al centro area
    const dx = acx - cxMap
    const dy = acy - cyMap
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    // Punto di partenza sul bordo dell'area (proiettato sul rettangolo)
    const halfW = area.svg.w / 2
    const halfH = area.svg.h / 2
    const tX = Math.abs(ux) > 1e-3 ? halfW / Math.abs(ux) : Infinity
    const tY = Math.abs(uy) > 1e-3 ? halfH / Math.abs(uy) : Infinity
    const tEdge = Math.min(tX, tY)
    const startX = acx + ux * tEdge
    const startY = acy + uy * tEdge
    const DOOR_LEN = 70
    const endX = startX + ux * DOOR_LEN
    const endY = startY + uy * DOOR_LEN
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
      <!-- Strada/sentiero con dash per distinguerla dalle adiacenze normali -->
      <line
        :x1="d.x1"
        :y1="d.y1"
        :x2="d.x2"
        :y2="d.y2"
        stroke="var(--z-rust-300, #d97757)"
        stroke-width="6"
        stroke-linecap="round"
        stroke-dasharray="10 6"
        opacity="0.85"
      />
      <!-- Cerchio porta terminale -->
      <circle
        :cx="d.cx"
        :cy="d.cy"
        r="14"
        fill="var(--z-rust-700, #4a2418)"
        stroke="var(--z-rust-300, #d97757)"
        stroke-width="2"
      />
      <text
        :x="d.cx"
        :y="d.cy + 5"
        text-anchor="middle"
        font-size="14"
        font-weight="bold"
        fill="var(--z-rust-300, #d97757)"
        style="pointer-events: none; user-select: none"
      >
        →
      </text>
      <!-- Label transition (se non vuota) sopra la porta -->
      <text
        v-if="d.label && d.label !== '→'"
        :x="d.cx"
        :y="d.cy - 22"
        text-anchor="middle"
        font-size="11"
        fill="var(--z-rust-300, #d97757)"
        style="pointer-events: none; user-select: none"
      >
        {{ d.label }}
      </text>
    </g>
  </g>
</template>
