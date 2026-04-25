<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePartySeed } from '~/composables/usePartySeed'
import { useFeedbackStore } from '~/stores/feedback'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import { relativeTime } from '~/composables/useRelativeTime'

interface JoinRequestRow {
  id: string
  partySeed: string
  userId: string
  displayName: string
  message: string | null
  createdAt: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
}

const seed = usePartySeed()
const feedbackStore = useFeedbackStore()
const feedback = useErrorFeedback()

const items = ref<JoinRequestRow[]>([])
const busy = ref(false)

async function load() {
  try {
    const res = await $fetch<{ items: JoinRequestRow[] }>(
      `/api/parties/${seed}/join-requests`,
      { query: { status: 'pending' } }
    )
    items.value = res.items.sort((a, b) => b.createdAt - a.createdAt)
  } catch (err) {
    feedback.reportFromError(err)
  }
}

async function approve(it: JoinRequestRow) {
  if (busy.value) return
  busy.value = true
  try {
    await $fetch(`/api/parties/${seed}/join-requests/${it.id}/approve`, { method: 'POST' })
    feedbackStore.pushToast({ level: 'info', title: `${it.displayName} approvato` })
    await load()
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    busy.value = false
  }
}

async function reject(it: JoinRequestRow) {
  const reason = window.prompt(`Motivo (opzionale) del rifiuto per ${it.displayName}:`) ?? ''
  if (busy.value) return
  busy.value = true
  try {
    await $fetch(`/api/parties/${seed}/join-requests/${it.id}/reject`, {
      method: 'POST',
      body: reason ? { reason } : {}
    })
    feedbackStore.pushToast({ level: 'info', title: 'Richiesta rifiutata' })
    await load()
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h4
        class="text-xs uppercase tracking-wide"
        style="color: var(--z-text-md)"
      >
        Richieste di accesso
      </h4>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-refresh-cw"
        @click="load"
      >
        Aggiorna
      </UButton>
    </div>

    <p
      v-if="!items.length"
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Nessuna richiesta in attesa.
    </p>

    <ul
      v-else
      class="space-y-2"
    >
      <li
        v-for="it in items"
        :key="it.id"
        class="px-3 py-2 rounded text-sm space-y-2"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div
              class="font-semibold"
              style="color: var(--z-green-300)"
            >
              {{ it.displayName }}
            </div>
            <div
              class="text-xs"
              style="color: var(--z-text-md)"
            >
              {{ relativeTime(it.createdAt) }}
            </div>
          </div>
          <div class="shrink-0 flex gap-2">
            <UButton
              size="xs"
              color="primary"
              :loading="busy"
              @click="approve(it)"
            >
              Approva
            </UButton>
            <UButton
              size="xs"
              color="error"
              variant="soft"
              :disabled="busy"
              @click="reject(it)"
            >
              Rifiuta
            </UButton>
          </div>
        </div>
        <p
          v-if="it.message"
          class="text-xs italic"
          style="color: var(--z-text-md)"
        >
          “{{ it.message }}”
        </p>
      </li>
    </ul>
  </div>
</template>
