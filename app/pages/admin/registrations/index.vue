<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAdminApi } from '~/composables/useAdminApi'
import { useFeedbackStore } from '~/stores/feedback'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'GDR Zombi — Admin Registrazioni' })

interface UserListItem {
  id: string
  username: string
  status: 'pending' | 'approved' | 'banned'
  mustReset: boolean
  createdAt: number
  approvedAt: number | null
  approvedBy: string | null
  bannedReason: string | null
}

const { adminGet, adminPost } = useAdminApi()
const toast = useFeedbackStore()

const pending = ref<UserListItem[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    pending.value = await adminGet<UserListItem[]>('/api/admin/registrations', { status: 'pending' })
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function approve(u: UserListItem) {
  try {
    await adminPost(`/api/admin/registrations/${u.id}/approve`)
    toast.pushToast({ level: 'info', title: `${u.username} approvato` })
    await load()
  } catch { /* report già fatto */ }
}

async function reject(u: UserListItem) {
  if (!confirm(`Rifiutare la registrazione di ${u.username}? L'utente pending verrà eliminato.`)) return
  try {
    await adminPost(`/api/admin/registrations/${u.id}/reject`, {})
    toast.pushToast({ level: 'info', title: 'Registrazione rifiutata' })
    await load()
  } catch { /* report già fatto */ }
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex items-center justify-between">
      <h1
        class="text-lg font-semibold"
        style="color: var(--z-text-hi)"
      >
        Registrazioni pending
      </h1>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :loading="loading"
        @click="load"
      >
        Aggiorna
      </UButton>
    </header>

    <p
      v-if="loading"
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Caricamento…
    </p>
    <p
      v-else-if="!pending.length"
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Nessuna registrazione in attesa.
    </p>
    <ul
      v-else
      class="space-y-2"
    >
      <li
        v-for="u in pending"
        :key="u.id"
        class="flex items-center justify-between gap-3 px-3 py-2 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <div class="flex-1 min-w-0">
          <div
            class="text-sm font-semibold"
            style="color: var(--z-text-hi)"
          >
            {{ u.username }}
          </div>
          <div
            class="text-xs font-mono-z"
            style="color: var(--z-text-md)"
          >
            inviata {{ fmtDate(u.createdAt) }}
          </div>
        </div>
        <div class="flex gap-2">
          <UButton
            size="xs"
            color="primary"
            @click="approve(u)"
          >
            Approva
          </UButton>
          <UButton
            size="xs"
            color="error"
            variant="soft"
            @click="reject(u)"
          >
            Rifiuta
          </UButton>
        </div>
      </li>
    </ul>
  </section>
</template>
