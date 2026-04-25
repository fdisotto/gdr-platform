<script setup lang="ts">
import { computed } from 'vue'
import type { Area } from '~~/shared/map/areas'
import { seedFromString } from '~~/shared/seed/prng'
import { useChatStore } from '~/stores/chat'
import { usePartySeed } from '~/composables/usePartySeed'

interface Props {
  player: { id: string, nickname: string, role: 'user' | 'master', currentAreaId: string }
  area: Area
  index: number
  isSelf: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

const seed = usePartySeed()
const chatStore = useChatStore(seed)

const AVATAR_COLORS = [
  '#7cbe79', '#9aa13a', '#d4965b', '#a8572a',
  '#6a4e7a', '#8e8e78', '#b96565', '#4f8aa3'
]

const color = computed(() => {
  const h = seedFromString(props.player.nickname)
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
})

const position = computed(() => {
  const col = props.index % 4
  const row = Math.floor(props.index / 4)
  const paddingX = 14
  const paddingY = 30
  const cellW = 18
  const cellH = 18
  return {
    x: paddingX + col * cellW,
    y: paddingY + row * cellH
  }
})

const isMaster = computed(() => props.player.role === 'master')
const isLastSpeaker = computed(() => chatStore.lastSpeakerPlayerId === props.player.id)
</script>

<template>
  <g
    :transform="`translate(${area.svg.x + position.x}, ${area.svg.y + position.y})`"
    style="cursor: pointer"
    @click="(ev: MouseEvent) => emit('click', ev)"
  >
    <title>{{ player.nickname }}{{ isMaster ? ' (master)' : '' }}</title>
    <circle
      r="7"
      :fill="color"
      :stroke="isSelf ? 'var(--z-green-100)' : 'var(--z-bg-900)'"
      :stroke-width="isSelf ? 2 : 1.5"
    />
    <path
      v-if="isMaster"
      d="M -5 -10 L -3 -6 L 0 -12 L 3 -6 L 5 -10 L 5 -7 L -5 -7 Z"
      fill="var(--z-blood-300)"
      stroke="var(--z-bg-900)"
      stroke-width="0.5"
    />
    <!-- Badge "ha appena parlato": fumetto in alto a destra dell'avatar -->
    <g
      v-if="isLastSpeaker"
      transform="translate(6, -6)"
      style="pointer-events: none"
    >
      <title>Ha parlato di recente</title>
      <ellipse
        rx="4.5"
        ry="3.5"
        fill="var(--z-bg-900)"
        stroke="var(--z-green-300)"
        stroke-width="1"
      />
      <path
        d="M -1.5 3 L 0 5.5 L 1 3 Z"
        fill="var(--z-bg-900)"
        stroke="var(--z-green-300)"
        stroke-width="1"
        stroke-linejoin="round"
      />
      <circle
        cx="-2"
        cy="0"
        r="0.6"
        fill="var(--z-green-300)"
      />
      <circle
        cx="0"
        cy="0"
        r="0.6"
        fill="var(--z-green-300)"
      />
      <circle
        cx="2"
        cy="0"
        r="0.6"
        fill="var(--z-green-300)"
      />
    </g>
  </g>
</template>
