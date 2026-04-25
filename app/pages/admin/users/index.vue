<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminApi } from '~/composables/useAdminApi'
import { useFeedbackStore } from '~/stores/feedback'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'GDR Zombi — Admin Utenti' })

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

type Tab = 'approved' | 'banned'

const tab = ref<Tab>('approved')
const search = ref('')
const approved = ref<UserListItem[]>([])
const banned = ref<UserListItem[]>([])
const loading = ref(false)

const { adminGet, adminPost } = useAdminApi()
const toast = useFeedbackStore()

async function loadAll() {
  loading.value = true
  try {
    const [a, b] = await Promise.all([
      adminGet<UserListItem[]>('/api/admin/registrations', { status: 'approved' }),
      adminGet<UserListItem[]>('/api/admin/registrations', { status: 'banned' })
    ])
    approved.value = a
    banned.value = b
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)

function filtered<T extends { username: string }>(rows: T[]): T[] {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows
  return rows.filter(r => r.username.toLowerCase().includes(q))
}

const approvedFiltered = computed(() => filtered(approved.value))
const bannedFiltered = computed(() => filtered(banned.value))

async function resetPassword(u: UserListItem) {
  if (!confirm(`Resettare la password di ${u.username}? Verrà generata una password temporanea.`)) return
  try {
    const res = await adminPost<{ tempPassword: string }>(`/api/admin/users/${u.id}/reset-password`)
    toast.pushToast({
      level: 'danger',
      title: `Password temporanea per ${u.username}: ${res.tempPassword}`,
      detail: 'Copiala e consegnala all\'utente. Non sarà più mostrata.',
      ttlMs: 60_000
    })
    await loadAll()
  } catch { /* report già fatto da adminPost */ }
}

async function banUser(u: UserListItem) {
  const reason = prompt(`Ragione del ban per ${u.username}? (vuoto = nessuna)`)
  if (reason === null) return
  try {
    await adminPost(`/api/admin/users/${u.id}/ban`, { reason: reason || undefined })
    toast.pushToast({ level: 'info', title: `${u.username} bannato` })
    await loadAll()
  } catch { /* report già fatto */ }
}

async function elevateToAdmin(u: UserListItem) {
  if (!confirm(`Promuovere ${u.username} a superadmin? Potrà accedere al pannello admin con le sue credenziali.`)) return
  try {
    await adminPost('/api/admin/admins', { targetUserId: u.id })
    toast.pushToast({ level: 'info', title: `${u.username} promosso a admin` })
  } catch { /* report già fatto */ }
}
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex items-center justify-between gap-3">
      <h1
        class="text-lg font-semibold"
        style="color: var(--z-text-hi)"
      >
        Utenti
      </h1>
      <input
        v-model="search"
        type="text"
        placeholder="Cerca username…"
        class="px-3 py-1.5 rounded font-mono-z text-sm w-64"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
      >
    </header>

    <div class="flex gap-1">
      <button
        v-for="t in (['approved', 'banned'] as const)"
        :key="t"
        type="button"
        class="px-3 py-1.5 rounded text-xs uppercase tracking-wide"
        :style="tab === t
          ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
          : 'background: var(--z-bg-800); color: var(--z-text-md); border: 1px solid var(--z-border)'"
        @click="tab = t"
      >
        {{ t === 'approved' ? `Approvati (${approved.length})` : `Bannati (${banned.length})` }}
      </button>
    </div>

    <p
      v-if="loading"
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Caricamento…
    </p>

    <!-- APPROVED -->
    <ul
      v-if="tab === 'approved' && approvedFiltered.length"
      class="space-y-2"
    >
      <li
        v-for="u in approvedFiltered"
        :key="u.id"
        class="flex items-center justify-between gap-3 px-3 py-2 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <div class="flex-1 min-w-0">
          <span
            class="text-sm font-semibold"
            style="color: var(--z-text-hi)"
          >{{ u.username }}</span>
          <span
            v-if="u.mustReset"
            class="ml-2 text-xs px-1.5 py-0.5 rounded"
            style="background: var(--z-rust-700); color: var(--z-rust-300)"
          >must reset</span>
        </div>
        <div class="flex gap-2">
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            @click="resetPassword(u)"
          >
            Reset password
          </UButton>
          <UButton
            size="xs"
            variant="soft"
            color="primary"
            @click="elevateToAdmin(u)"
          >
            Promuovi a admin
          </UButton>
          <UButton
            size="xs"
            color="error"
            variant="soft"
            @click="banUser(u)"
          >
            Ban
          </UButton>
        </div>
      </li>
    </ul>
    <p
      v-else-if="tab === 'approved' && !loading"
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Nessun utente approvato.
    </p>

    <!-- BANNED -->
    <ul
      v-if="tab === 'banned' && bannedFiltered.length"
      class="space-y-2"
    >
      <li
        v-for="u in bannedFiltered"
        :key="u.id"
        class="px-3 py-2 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <div
          class="text-sm font-semibold"
          style="color: var(--z-blood-300)"
        >
          {{ u.username }}
        </div>
        <div
          v-if="u.bannedReason"
          class="text-xs"
          style="color: var(--z-text-md)"
        >
          {{ u.bannedReason }}
        </div>
        <div
          class="text-xs italic mt-1"
          style="color: var(--z-text-lo)"
        >
          Sblocco non implementato.
        </div>
      </li>
    </ul>
    <p
      v-else-if="tab === 'banned' && !loading"
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Nessun ban attivo.
    </p>
  </section>
</template>
