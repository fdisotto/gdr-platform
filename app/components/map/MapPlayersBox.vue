<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePartyStore } from '~/stores/party'
import { AREAS } from '~~/shared/map/areas'

const party = usePartyStore()
const open = ref(false)

const areaNameById = new Map(AREAS.map(a => [a.id as string, a.name]))

const sortedPlayers = computed(() => {
  return [...party.players].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'master' ? -1 : 1
    return a.nickname.localeCompare(b.nickname)
  })
})
</script>

<template>
  <div
    class="absolute top-3 right-3 rounded-md text-xs"
    style="background: var(--z-bg-800); border: 1px solid var(--z-border); max-width: 260px"
  >
    <button
      type="button"
      class="w-full flex items-center justify-between px-3 py-2 gap-2"
      style="color: var(--z-text-md)"
      @click="open = !open"
    >
      <span class="uppercase tracking-wide">
        Connessi
        <span
          class="ml-1 font-mono-z"
          style="color: var(--z-green-300)"
        >{{ sortedPlayers.length }}</span>
      </span>
      <span style="color: var(--z-text-lo)">{{ open ? '▾' : '▸' }}</span>
    </button>
    <ul
      v-if="open && sortedPlayers.length"
      class="px-3 pb-2 space-y-1"
      style="border-top: 1px solid var(--z-border); padding-top: 6px; max-height: 40vh; overflow-y: auto"
    >
      <li
        v-for="p in sortedPlayers"
        :key="p.id"
        class="flex items-center gap-2"
      >
        <span
          class="size-2 rounded-full"
          :style="p.role === 'master'
            ? 'background: var(--z-blood-300)'
            : (party.me?.id === p.id ? 'background: var(--z-green-300)' : 'background: var(--z-green-700)')"
        />
        <span
          class="flex-1 truncate"
          :style="p.role === 'master'
            ? 'color: var(--z-blood-300); font-weight: 600'
            : 'color: var(--z-text-hi)'"
        >{{ p.nickname }}<span
          v-if="party.me?.id === p.id"
          class="ml-1"
          style="color: var(--z-text-lo)"
        >(tu)</span></span>
        <span
          class="font-mono-z"
          style="color: var(--z-text-lo)"
        >{{ areaNameById.get(p.currentAreaId) ?? p.currentAreaId }}</span>
      </li>
    </ul>
    <p
      v-else-if="open"
      class="px-3 pb-2 pt-1 italic"
      style="color: var(--z-text-lo); border-top: 1px solid var(--z-border)"
    >
      Nessun player connesso.
    </p>
  </div>
</template>
