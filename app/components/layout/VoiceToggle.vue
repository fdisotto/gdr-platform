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
const capturingKey = ref(false)

const isMasterGlobal = computed(() => party.me?.role === 'master' && settings.masterVoiceScope === 'global')
const isPtt = computed(() => settings.voiceMode === 'ptt')

const visiblePeers = computed(() => {
  if (!party.me) return []
  return party.players.filter(p =>
    p.id !== party.me!.id
    && (isMasterGlobal.value || p.currentAreaId === party.me!.currentAreaId)
  )
})

const speakingCount = computed(() => {
  let n = 0
  for (const p of visiblePeers.value) {
    if (voice.speakingPeers.value.has(p.id)) n++
  }
  return n
})

// Rende event.code in etichette IT leggibili per lo shortcut PTT.
function keyLabel(code: string): string {
  if (code === 'Space') return 'Spazio'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt'
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl'
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift'
  if (code === 'MetaLeft' || code === 'MetaRight') return 'Meta'
  return code
}
const pttKeyLabel = computed(() => keyLabel(settings.pttKey))

function toggleOn() {
  if (settings.voiceEnabled) {
    settings.disableVoice()
  } else {
    settings.enableVoice()
  }
}

// Hold-to-talk (mobile): pointerdown inizia trasmissione, pointerup/cancel la ferma
function onTalkPointerDown(e: PointerEvent) {
  e.preventDefault()
  voice.startTransmit()
  ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)
}
function onTalkPointerUp(e: PointerEvent) {
  voice.stopTransmit()
  ;(e.target as Element | null)?.releasePointerCapture?.(e.pointerId)
}

// Cattura la prossima combinazione di tasti per lo shortcut PTT
function startCaptureKey() {
  capturingKey.value = true
}
function onCaptureKeyDown(e: KeyboardEvent) {
  if (!capturingKey.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.code === 'Escape') {
    capturingKey.value = false
    return
  }
  // ignora modifier-only: ci sono scenari (es. Tab) in cui ha senso ma limitiamo ai tasti utili
  settings.setPttKey(e.code)
  capturingKey.value = false
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
  // Il capture keydown per il PTT shortcut deve intercettare PRIMA del
  // listener globale in useVoiceChat (capture: true lo mette al bubbling
  // outer). Registriamo in cattura globale.
  window.addEventListener('keydown', onCaptureKeyDown, { capture: true })
  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocClick)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('keydown', onCaptureKeyDown, { capture: true })
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
        class="mic-btn relative text-xs px-2 py-1 rounded flex items-center gap-1"
        :class="{ 'mic-pulse': voice.isSelfSpeaking.value }"
        :title="settings.voiceEnabled ? 'Disattiva voce' : 'Attiva voce'"
        :style="voice.isTransmitting.value
          ? 'background: var(--z-blood-500); color: var(--z-bg-900)'
          : settings.voiceEnabled
            ? 'background: var(--z-green-700); color: var(--z-green-100)'
            : 'background: var(--z-bg-700); color: var(--z-text-md)'"
        @click="toggleOn"
      >
        <UIcon
          :name="settings.voiceEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'"
          class="size-4"
        />
        <span
          v-if="voice.isTransmitting.value"
          class="font-mono-z"
        >●</span>
        <span
          v-else-if="speakingCount > 0"
          class="font-mono-z"
        >&#x25CF;{{ speakingCount }}</span>
      </button>
      <!-- Hold-to-talk: visibile solo in PTT mode + voice enabled. Su mobile
           l'utente tocca e tiene premuto questo bottone per parlare. -->
      <button
        v-if="settings.voiceEnabled && isPtt"
        type="button"
        class="text-xs px-2 py-1 rounded flex items-center gap-1 select-none"
        :title="`Tieni premuto per parlare (${pttKeyLabel})`"
        :style="voice.isTransmitting.value
          ? 'background: var(--z-blood-500); color: var(--z-bg-900)'
          : 'background: var(--z-rust-700); color: var(--z-rust-300)'"
        style="touch-action: none"
        @pointerdown="onTalkPointerDown"
        @pointerup="onTalkPointerUp"
        @pointercancel="onTalkPointerUp"
        @pointerleave="onTalkPointerUp"
      >
        <UIcon
          name="i-lucide-radio"
          class="size-4"
        />
        <span class="hidden sm:inline">Parla</span>
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
          class="size-3"
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
        {{ isMasterGlobal ? 'Voci — tutta la party' : 'Voci nell area' }}
      </h4>
      <div
        v-if="party.me?.role === 'master'"
        class="flex items-center gap-1 mb-3"
      >
        <button
          v-for="scope in (['zone', 'global'] as const)"
          :key="scope"
          type="button"
          class="text-xs px-2 py-0.5 rounded"
          :style="settings.masterVoiceScope === scope
            ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
            : 'background: var(--z-bg-800); color: var(--z-text-md)'"
          :title="scope === 'zone' ? 'Parla solo nella zona corrente' : 'Parla con tutta la party'"
          @click="settings.setMasterVoiceScope(scope)"
        >
          {{ scope === 'zone' ? 'Zona' : 'Globale' }}
        </button>
      </div>

      <!-- Modalità mic: continua vs push-to-talk -->
      <div class="mb-3">
        <h5
          class="text-xs uppercase tracking-wide mb-1"
          style="color: var(--z-text-md)"
        >
          Modalità
        </h5>
        <div class="flex items-center gap-1">
          <button
            v-for="mode in (['continuous', 'ptt'] as const)"
            :key="mode"
            type="button"
            class="text-xs px-2 py-0.5 rounded"
            :style="settings.voiceMode === mode
              ? 'background: var(--z-green-700); color: var(--z-green-100)'
              : 'background: var(--z-bg-800); color: var(--z-text-md)'"
            :title="mode === 'continuous' ? 'Mic sempre aperto mentre voce attiva' : 'Premi e tieni per parlare'"
            @click="settings.setVoiceMode(mode)"
          >
            {{ mode === 'continuous' ? 'Continua' : 'Push-to-talk' }}
          </button>
        </div>
        <div
          v-if="isPtt"
          class="mt-2 flex items-center gap-2 text-xs"
        >
          <span style="color: var(--z-text-lo)">Scorciatoia:</span>
          <button
            type="button"
            class="px-2 py-0.5 rounded font-mono-z"
            :style="capturingKey
              ? 'background: var(--z-rust-500); color: var(--z-bg-900)'
              : 'background: var(--z-bg-800); color: var(--z-text-hi)'"
            :title="capturingKey ? 'Premi un tasto (ESC per annullare)' : 'Cambia scorciatoia'"
            @click="startCaptureKey"
          >
            {{ capturingKey ? '…premi un tasto' : pttKeyLabel }}
          </button>
        </div>
        <p
          v-if="isPtt"
          class="mt-1 text-xs"
          style="color: var(--z-text-lo)"
        >
          Premi <span class="font-mono-z">{{ pttKeyLabel }}</span> o tieni premuto il pulsante <span style="color: var(--z-rust-300)">Parla</span> nell'header.
        </p>
      </div>
      <ul
        v-if="visiblePeers.length"
        class="space-y-2"
      >
        <li
          v-for="p in visiblePeers"
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
        {{ isMasterGlobal ? 'Nessun altro player nella party.' : 'Nessun altro player nell area corrente.' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Pulse ring: quando parlo (VAD locale) appare un anello che si espande
   e svanisce intorno al bottone mic. Usa box-shadow per non influire
   sul layout/dimensione. */
.mic-btn {
  transition: box-shadow 0.15s ease-out;
}
.mic-pulse {
  animation: mic-ring 1s ease-out infinite;
}
@keyframes mic-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(124, 190, 121, 0.7);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(124, 190, 121, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(124, 190, 121, 0);
  }
}
</style>
