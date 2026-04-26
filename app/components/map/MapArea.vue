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
}
const props = defineProps<Props>()
defineEmits<{ (e: 'click'): void }>()

const isPolygon = computed(() => props.area.svg.shape === 'polygon' && !!props.area.svg.points)
const polyPoints = computed(() => props.area.svg.points ?? '')

function strokeColor(): string {
  if (props.isCurrent) return 'var(--z-green-100)'
  if (props.isAdjacent) return 'var(--z-green-300)'
  return 'var(--z-green-700)'
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
function opacity(): number {
  const s = status()
  if (s === 'ruined') return 0.65
  if (s === 'closed') return 0.5
  return 1
}
function cursorStyle(): string {
  // Area corrente: click apre il dettaglio → pointer
  if (props.isCurrent) return 'cursor: pointer'
  // Master può muoversi ovunque
  if (props.isMaster) return 'cursor: pointer'
  const s = status()
  // Aree chiuse per non-master: ingresso negato
  if (s === 'closed') return 'cursor: not-allowed'
  // Aree adiacenti raggiungibili
  if (props.isAdjacent) return 'cursor: pointer'
  // Aree remote: niente click utile per il giocatore
  return 'cursor: default'
}
</script>

<template>
  <g
    :transform="`translate(${area.svg.x}, ${area.svg.y})`"
    :style="cursorStyle()"
    @click="$emit('click')"
  >
    <!-- v2d-shape: poligono organico (preferito) o rect legacy/custom area. -->
    <polygon
      v-if="isPolygon"
      :points="polyPoints"
      fill="url(#area-bg)"
      :stroke="strokeColor()"
      :stroke-width="strokeWidth()"
      :opacity="opacity()"
      stroke-linejoin="round"
    />
    <rect
      v-else
      :width="area.svg.w"
      :height="area.svg.h"
      rx="8"
      ry="8"
      fill="url(#area-bg)"
      :stroke="strokeColor()"
      :stroke-width="strokeWidth()"
      :opacity="opacity()"
    />
    <polygon
      v-if="isPolygon && status() === 'infested'"
      :points="polyPoints"
      fill="url(#area-infested)"
      opacity="0.6"
      pointer-events="none"
    />
    <rect
      v-else-if="status() === 'infested'"
      :width="area.svg.w"
      :height="area.svg.h"
      rx="8"
      ry="8"
      fill="url(#area-infested)"
      opacity="0.6"
      pointer-events="none"
    />
    <polygon
      v-if="isPolygon && status() === 'ruined'"
      :points="polyPoints"
      fill="url(#area-ruined)"
      opacity="0.35"
      pointer-events="none"
    />
    <rect
      v-else-if="status() === 'ruined'"
      :width="area.svg.w"
      :height="area.svg.h"
      rx="8"
      ry="8"
      fill="url(#area-ruined)"
      opacity="0.35"
      pointer-events="none"
    />
    <g
      v-if="status() === 'closed'"
      :transform="`translate(${area.svg.w / 2 - 12}, ${area.svg.h / 2 - 12})`"
      pointer-events="none"
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
    <text
      :x="area.svg.w / 2"
      :y="area.svg.h / 2 + 4"
      text-anchor="middle"
      font-size="13"
      font-weight="600"
      :fill="isCurrent ? 'var(--z-green-100)' : 'var(--z-text-hi)'"
      :opacity="status() === 'closed' ? 0.5 : 1"
      style="pointer-events: none; user-select: none"
    >
      {{ displayName() }}
    </text>
    <g
      v-if="playerCount > 0"
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
</template>
