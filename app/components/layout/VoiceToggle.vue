<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { useSettingsStore } from '~/stores/settings'
import { useVoiceChat } from '~/composables/useVoiceChat'
import { usePartyStore } from '~/stores/party'

const settings = useSettingsStore()
const party = usePartyStore()
const voice = useVoiceChat()
const open = ref(false)
const wrapper = ref<HTMLElement | null>(null)

const peersInArea = computed(() => {
  if (!party.me) return []
  return party.players.filter(p =>
    p.id !== party.me!.id
    && p.currentAreaId === party.me!.currentAreaId
  )
})

const speakingCount = computed(() => {
  let n = 0
  for (const p of peersInArea.value) {
    if (voice.speakingPeers.value.has(p.id)) n++
  }
  return n
})

function toggleOn() {
  if (settings.voiceEnabled) {
    settings.disableVoice()
  } else {
    settings.enableVoice()
  }
}

function toggleOpen(e: Event) {
  e.stopPropagation()
  open.value = !open.value
}

function close() {
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (!open.value || !wrapper.value) return
  if (wrapper.value.contains(e.target as Node)) return
  close()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

if (typeof window !== 'undefined') {
  document.addEventListener('mousedown', onDocClick)
  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocClick)
    window.removeEventListener('keydown', onKey)
  })
}
</script>

<template>
  <div
    ref="wrapper"
    class="relative"
  >
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="text-xs px-2 py-1 rounded flex items-center gap-1"
        :title="settings.voiceEnabled ? 'Disattiva voce' : 'Attiva voce'"
        :style="settings.voiceEnabled
          ? 'background: var(--z-green-700); color: var(--z-green-100)'
          : 'background: var(--z-bg-700); color: var(--z-text-md)'"
        @click="toggleOn"
      >
        <UIcon
          :name="settings.voiceEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'"
          class="size-4"
        />
        <span
          v-if="speakingCount > 0"
          class="font-mono-z"
        >&#x25CF;{{ speakingCount }}</span>
      </button>
      <button
        v-if="settings.voiceEnabled"
        type="button"
        class="text-xs px-1 py-1 rounded"
        title="Lista voci"
        style="background: var(--z-bg-700); color: var(--z-text-md)"
        @click="toggleOpen"
      >
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4"
        />
      </button>
    </div>
    <p
      v-if="voice.error.value"
      class="text-xs absolute right-0 top-full mt-1 px-2 py-1 rounded"
      style="background: var(--z-blood-700); color: var(--z-blood-300); white-space: nowrap; z-index: 30"
    >
      {{ voice.error.value }}
    </p>
    <div
      v-if="open && settings.voiceEnabled"
      class="absolute right-0 top-full mt-1 z-20 rounded-md p-3"
      style="background: var(--z-bg-700); border: 1px solid var(--z-border); min-width: 240px"
      @click.stop
    >
      <h4
        class="text-xs uppercase tracking-wide mb-2"
        style="color: var(--z-text-md)"
      >
        Voci nell area
      </h4>
      <ul
        v-if="peersInArea.length"
        class="space-y-2"
      >
        <li
          v-for="p in peersInArea"
          :key="p.id"
          class="flex items-center gap-2"
        >
          <span
            class="size-2 rounded-full"
            :style="voice.speakingPeers.value.has(p.id)
              ? 'background: var(--z-green-300)'
              : 'background: var(--z-bg-900)'"
          />
          <span
            class="text-xs flex-1"
            style="color: var(--z-text-hi)"
          >{{ p.nickname }}</span>
          <button
            type="button"
            class="text-xs px-1 py-0.5 rounded"
            :title="settings.voiceMutedPeers.has(p.id) ? 'Riattiva' : 'Muta'"
            :style="settings.voiceMutedPeers.has(p.id)
              ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
              : 'background: var(--z-bg-800); color: var(--z-text-md)'"
            @click="settings.togglePeerMute(p.id)"
          >
            <UIcon
              :name="settings.voiceMutedPeers.has(p.id) ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
              class="size-3.5"
            />
          </button>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="Math.round((settings.voicePerPeerVolumes[p.id] ?? 1) * 100)"
            class="w-20 accent-green-600"
            @input="settings.setPeerVolume(p.id, Number(($event.target as HTMLInputElement).value) / 100)"
          >
        </li>
      </ul>
      <p
        v-else
        class="text-xs italic"
        style="color: var(--z-text-lo)"
      >
        Nessun altro player nell area corrente.
      </p>
    </div>
  </div>
</template>
