<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useSettingsStore } from '~/stores/settings'

const settings = useSettingsStore()
const open = ref(false)
const wrapper = ref<HTMLElement | null>(null)

function toggleOpen() {
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
    <button
      type="button"
      class="text-xs px-2 py-1 rounded flex items-center gap-1"
      :title="settings.notificationsEnabled ? 'Notifiche on' : 'Notifiche off'"
      :style="settings.notificationsEnabled
        ? 'background: var(--z-green-700); color: var(--z-green-100)'
        : 'background: var(--z-bg-700); color: var(--z-text-md)'"
      @click="toggleOpen"
    >
      <UIcon
        :name="settings.notificationsEnabled ? 'i-lucide-bell' : 'i-lucide-bell-off'"
        class="size-4"
      />
    </button>
    <div
      v-if="open"
      class="absolute right-0 top-full mt-1 z-20 rounded-md p-3 w-56"
      style="background: var(--z-bg-700); border: 1px solid var(--z-border)"
      @click.stop
    >
      <label class="flex items-start gap-2 mb-2 cursor-pointer">
        <input
          type="checkbox"
          :checked="settings.notificationsEnabled"
          class="mt-0.5 accent-green-600"
          @change="settings.toggleNotifications()"
        >
        <span class="text-xs leading-tight">
          <span
            class="font-semibold"
            style="color: var(--z-text-hi)"
          >Notifiche attive</span>
          <br>
          <span style="color: var(--z-text-lo)">Beep a missive e messaggi diretti (whisper)</span>
        </span>
      </label>
      <label class="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          :checked="settings.notificationsChatAll"
          :disabled="!settings.notificationsEnabled"
          class="mt-0.5 accent-green-600"
          @change="settings.toggleNotificationsChatAll()"
        >
        <span class="text-xs leading-tight">
          <span
            class="font-semibold"
            style="color: var(--z-text-hi)"
          >Anche chat generale</span>
          <br>
          <span style="color: var(--z-text-lo)">Beep anche per ogni messaggio d'area</span>
        </span>
      </label>
    </div>
  </div>
</template>
