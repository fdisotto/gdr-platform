<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { usePartyStore } from '~/stores/party'
import { useAuth } from '~/composables/useAuth'
import { usePartyConnections } from '~/composables/usePartyConnections'
import { usePartySeed } from '~/composables/usePartySeed'
import { useFeedbackStore } from '~/stores/feedback'
import { useErrorFeedback } from '~/composables/useErrorFeedback'

const seed = usePartySeed()
const party = usePartyStore(seed)
const auth = useAuth()
const conns = usePartyConnections()
const router = useRouter()
const feedbackStore = useFeedbackStore()
const feedback = useErrorFeedback()

const leaving = ref(false)

const open = ref(false)
const wrapper = ref<HTMLElement | null>(null)

function toggleOpen() {
  open.value = !open.value
}
function close() {
  open.value = false
}

async function logout() {
  conns.closeAll()
  close()
  await auth.logout()
  await router.push('/login')
}

async function profile() {
  close()
  await router.push('/me')
}

async function leaveParty() {
  if (leaving.value) return
  if (!confirm('Esci dalla party? Potrai rientrare se è pubblica.')) return
  leaving.value = true
  try {
    await $fetch(`/api/parties/${seed}/leave`, { method: 'POST' })
    feedbackStore.pushToast({ level: 'info', title: 'Uscito dalla party' })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gdr:my-parties-changed'))
    }
    close()
    await router.push('/')
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    leaving.value = false
  }
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
    v-if="party.me"
    ref="wrapper"
    class="relative"
  >
    <button
      type="button"
      class="text-xs md:text-sm flex items-center gap-1 md:gap-2 min-w-0 rounded px-2 py-1"
      style="background: var(--z-bg-700); color: var(--z-text-md)"
      :title="`${party.me.nickname} · ${party.me.role}`"
      @click="toggleOpen"
    >
      <span class="truncate max-w-[5rem] md:max-w-none">{{ party.me.nickname }}</span>
      <span
        class="hidden md:inline px-2 py-0.5 text-xs rounded"
        :style="party.me.role === 'master'
          ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
          : 'background: var(--z-bg-800); color: var(--z-text-md)'"
      >
        {{ party.me.role }}
      </span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-3"
        style="color: var(--z-text-lo)"
      />
    </button>
    <div
      v-if="open"
      class="absolute right-0 top-full mt-1 z-20 rounded-md py-1 min-w-[180px]"
      style="background: var(--z-bg-700); border: 1px solid var(--z-border)"
      @click.stop
    >
      <div
        class="px-3 py-2"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <div
          class="text-sm font-semibold truncate"
          style="color: var(--z-text-hi)"
        >
          {{ party.me.nickname }}
        </div>
        <div
          class="text-xs"
          :style="party.me.role === 'master'
            ? 'color: var(--z-blood-300)'
            : 'color: var(--z-text-md)'"
        >
          {{ party.me.role }}
        </div>
      </div>
      <button
        type="button"
        class="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm"
        style="color: var(--z-text-hi)"
        @click="profile"
      >
        <UIcon
          name="i-lucide-user"
          class="size-4"
        />
        Profilo
      </button>
      <button
        v-if="seed"
        type="button"
        class="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm"
        style="color: var(--z-rust-300)"
        :disabled="leaving"
        @click="leaveParty"
      >
        <UIcon
          name="i-lucide-log-out"
          class="size-4"
        />
        Esci da questa party
      </button>
      <button
        type="button"
        class="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm"
        style="color: var(--z-blood-300)"
        @click="logout"
      >
        <UIcon
          name="i-lucide-log-out"
          class="size-4"
        />
        Logout
      </button>
    </div>
  </div>
</template>
