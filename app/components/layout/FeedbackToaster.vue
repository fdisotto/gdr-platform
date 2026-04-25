<script setup lang="ts">
import { useFeedbackStore, type Toast } from '~/stores/feedback'
import { useAuth } from '~/composables/useAuth'
import { useRouter } from 'vue-router'

const feedback = useFeedbackStore()
const auth = useAuth()
const router = useRouter()

function onToastClick(t: Toast) {
  if (!t.onClick) return
  try {
    t.onClick()
  } finally {
    feedback.dismissToast(t.id)
  }
}

const TOAST_STYLES: Record<string, string> = {
  info: 'background: var(--z-bg-700); color: var(--z-text-hi); border: 1px solid var(--z-border)',
  warn: 'background: var(--z-rust-700); color: var(--z-rust-300); border: 1px solid var(--z-rust-500)',
  danger: 'background: var(--z-blood-700); color: var(--z-blood-300); border: 1px solid var(--z-blood-500)'
}

function toastStyle(level: string): string {
  return TOAST_STYLES[level] ?? TOAST_STYLES.info!
}

async function returnHome() {
  const code = feedback.blocking?.code
  feedback.clearBlocking()
  // session_expired: logout client-side + redirect al login; altri bloccanti
  // (kicked/banned/session_invalid) riportano alla home con sessione intatta.
  if (code === 'session_expired') {
    await auth.logout()
    await router.push('/login')
    return
  }
  await router.push('/')
}
</script>

<template>
  <!-- Toasts -->
  <div
    class="fixed right-4 bottom-4 flex flex-col gap-2 z-40"
    style="max-width: 360px"
  >
    <div
      v-for="t in feedback.toasts"
      :key="t.id"
      class="rounded-md px-3 py-2 text-sm shadow-lg"
      :class="t.onClick ? 'cursor-pointer hover:brightness-110' : ''"
      :style="toastStyle(t.level)"
      @click="onToastClick(t)"
    >
      <div class="flex items-start gap-2">
        <div class="flex-1 min-w-0">
          <div class="font-semibold truncate">
            {{ t.title }}
          </div>
          <div
            v-if="t.detail"
            class="text-xs mt-0.5"
            style="color: var(--z-text-md)"
          >
            {{ t.detail }}
          </div>
        </div>
        <button
          type="button"
          class="text-xs"
          title="Chiudi"
          style="color: var(--z-text-md)"
          @click.stop="feedback.dismissToast(t.id)"
        >
          ✕
        </button>
      </div>
    </div>
  </div>

  <!-- Blocking modal -->
  <div
    v-if="feedback.blocking"
    class="fixed inset-0 flex items-center justify-center p-4 z-50"
    style="background: rgba(0,0,0,0.7)"
  >
    <div
      class="rounded-md p-6 w-96 max-w-full space-y-4"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <h2
        class="text-lg font-semibold"
        style="color: var(--z-blood-300)"
      >
        {{ feedback.blocking.title }}
      </h2>
      <p
        class="text-sm"
        style="color: var(--z-text-hi); white-space: pre-wrap"
      >
        {{ feedback.blocking.body }}
      </p>
      <p
        v-if="feedback.blocking.detail"
        class="text-xs italic"
        style="color: var(--z-text-md)"
      >
        {{ feedback.blocking.detail }}
      </p>
      <div class="flex justify-end pt-2">
        <UButton
          color="primary"
          size="sm"
          @click="returnHome"
        >
          {{ feedback.blocking.cta }}
        </UButton>
      </div>
    </div>
  </div>
</template>
