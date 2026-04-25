<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePartySeed } from '~/composables/usePartySeed'
import { useFeedbackStore } from '~/stores/feedback'
import { useErrorFeedback } from '~/composables/useErrorFeedback'

interface InviteRow {
  id: string
  partySeed: string
  token: string
  createdBy: string
  createdAt: number
  expiresAt: number
  usedAt: number | null
  usedBy: string | null
  revokedAt: number | null
}

const seed = usePartySeed()
const feedbackStore = useFeedbackStore()
const feedback = useErrorFeedback()

const items = ref<InviteRow[]>([])
const busy = ref(false)

async function load() {
  try {
    const res = await $fetch<{ items: InviteRow[] }>(`/api/parties/${seed}/invites`)
    items.value = res.items.sort((a, b) => b.createdAt - a.createdAt)
  } catch (err) {
    feedback.reportFromError(err)
  }
}

async function generate() {
  if (busy.value) return
  busy.value = true
  try {
    const res = await $fetch<{ id: string, token: string, url: string, expiresAt: number }>(
      `/api/parties/${seed}/invites`,
      { method: 'POST' }
    )
    await copyLink(res.url)
    feedbackStore.pushToast({ level: 'info', title: 'Invito generato e copiato' })
    await load()
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    busy.value = false
  }
}

async function revoke(it: InviteRow) {
  if (!confirm('Revocare questo invito?')) return
  try {
    await $fetch(`/api/parties/${seed}/invites/${it.id}/revoke`, { method: 'POST' })
    feedbackStore.pushToast({ level: 'info', title: 'Invito revocato' })
    await load()
  } catch (err) {
    feedback.reportFromError(err)
  }
}

async function copyLink(url: string) {
  const fullUrl = (typeof window !== 'undefined') ? new URL(url, window.location.origin).toString() : url
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(fullUrl).catch(() => { /* clipboard rifiutato */ })
  }
}

async function copyExisting(it: InviteRow) {
  await copyLink(`/party/${seed}?invite=${it.token}`)
  feedbackStore.pushToast({ level: 'info', title: 'Link copiato' })
}

function statusOf(it: InviteRow): { label: string, color: string } {
  if (it.revokedAt) return { label: 'revocato', color: 'var(--z-text-lo)' }
  if (it.usedAt) return { label: 'usato', color: 'var(--z-text-md)' }
  if (it.expiresAt < Date.now()) return { label: 'scaduto', color: 'var(--z-text-lo)' }
  return { label: 'attivo', color: 'var(--z-green-300)' }
}

const formatDate = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function truncateToken(t: string): string {
  if (t.length <= 16) return t
  return t.slice(0, 8) + '…' + t.slice(-4)
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
        Inviti
      </h4>
      <UButton
        size="xs"
        color="primary"
        :loading="busy"
        @click="generate"
      >
        Genera nuovo invito
      </UButton>
    </div>

    <p
      v-if="!items.length"
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Nessun invito generato.
    </p>

    <ul
      v-else
      class="space-y-2"
    >
      <li
        v-for="it in items"
        :key="it.id"
        class="flex items-center justify-between gap-3 px-3 py-2 rounded text-sm"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <code
              class="font-mono-z text-xs"
              style="color: var(--z-text-hi)"
            >{{ truncateToken(it.token) }}</code>
            <span
              class="text-[10px] uppercase tracking-wide px-1.5 rounded"
              :style="{ color: statusOf(it).color, border: '1px solid var(--z-border)' }"
            >
              {{ statusOf(it).label }}
            </span>
          </div>
          <div
            class="text-xs mt-0.5"
            style="color: var(--z-text-md)"
          >
            scade {{ formatDate(it.expiresAt) }}
          </div>
        </div>
        <div class="shrink-0 flex gap-2">
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="!!it.revokedAt || !!it.usedAt"
            @click="copyExisting(it)"
          >
            Copia link
          </UButton>
          <UButton
            size="xs"
            color="error"
            variant="soft"
            :disabled="!!it.revokedAt || !!it.usedAt"
            @click="revoke(it)"
          >
            Revoca
          </UButton>
        </div>
      </li>
    </ul>
  </div>
</template>
