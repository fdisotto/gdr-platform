<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)

const ITEMS: { status: 'intact' | 'infested' | 'ruined' | 'closed', label: string, description: string }[] = [
  { status: 'intact', label: 'Intatta', description: 'Area agibile, niente infestazione' },
  { status: 'infested', label: 'Infestata', description: 'Zombi presenti' },
  { status: 'ruined', label: 'In rovina', description: 'Crolli, detriti' },
  { status: 'closed', label: 'Chiusa', description: 'Sbarrata, ingresso negato' }
]
</script>

<template>
  <div
    class="absolute bottom-3 left-3 rounded-md text-xs"
    style="background: var(--z-bg-800); border: 1px solid var(--z-border); max-width: 220px"
  >
    <button
      type="button"
      class="w-full flex items-center justify-between px-3 py-2"
      style="color: var(--z-text-md)"
      @click="open = !open"
    >
      <span class="uppercase tracking-wide">Legenda</span>
      <span style="color: var(--z-text-lo)">{{ open ? '▾' : '▸' }}</span>
    </button>
    <ul
      v-if="open"
      class="px-3 pb-2 space-y-1.5"
      style="border-top: 1px solid var(--z-border); padding-top: 6px"
    >
      <li
        v-for="i in ITEMS"
        :key="i.status"
        class="flex items-start gap-2"
      >
        <svg
          width="24"
          height="18"
          viewBox="0 0 24 18"
          style="flex-shrink: 0; margin-top: 2px"
        >
          <defs>
            <pattern
              id="legend-infested"
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="4"
                stroke="var(--z-green-500)"
                stroke-width="0.8"
              />
            </pattern>
            <pattern
              id="legend-ruined"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 0 4 L 8 1 M 1 8 L 5 0 M 4 8 L 8 6"
                stroke="var(--z-text-lo)"
                stroke-width="0.5"
                fill="none"
              />
            </pattern>
          </defs>
          <rect
            x="1"
            y="1"
            width="22"
            height="16"
            rx="3"
            fill="var(--z-bg-700)"
            stroke="var(--z-green-700)"
            stroke-width="1"
            :opacity="i.status === 'ruined' ? 0.65 : i.status === 'closed' ? 0.5 : 1"
          />
          <rect
            v-if="i.status === 'infested'"
            x="1"
            y="1"
            width="22"
            height="16"
            rx="3"
            fill="url(#legend-infested)"
            opacity="0.7"
          />
          <rect
            v-if="i.status === 'ruined'"
            x="1"
            y="1"
            width="22"
            height="16"
            rx="3"
            fill="url(#legend-ruined)"
            opacity="0.5"
          />
          <g
            v-if="i.status === 'closed'"
            transform="translate(9, 6)"
          >
            <rect
              x="0"
              y="2"
              width="6"
              height="4"
              rx="0.5"
              fill="var(--z-text-lo)"
            />
            <path
              d="M 1.5 2 L 1.5 1 A 1.5 1.5 0 0 1 4.5 1 L 4.5 2"
              stroke="var(--z-text-lo)"
              stroke-width="0.7"
              fill="none"
            />
          </g>
        </svg>
        <div class="flex-1 leading-tight">
          <div
            class="font-semibold"
            style="color: var(--z-text-hi)"
          >
            {{ i.label }}
          </div>
          <div style="color: var(--z-text-lo); font-size: 0.72rem">
            {{ i.description }}
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
