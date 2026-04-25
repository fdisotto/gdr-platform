<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminApi } from '~/composables/useAdminApi'
import { useFeedbackStore } from '~/stores/feedback'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'GDR Zombi — Admin Superadmin' })

interface SuperadminItem {
  id: string
  username: string
  mustReset: boolean
  createdAt: number
  revokedAt: number | null
  revokedBy: string | null
  isRevoked: boolean
}

interface UserListItem {
  id: string
  username: string
  status: 'pending' | 'approved' | 'banned'
}

const { adminGet, adminPost } = useAdminApi()
const toast = useFeedbackStore()

const all = ref<SuperadminItem[]>([])
const candidates = ref<UserListItem[]>([])
const search = ref('')
const showRevoked = ref(false)
const loading = ref(false)
const selectedTargetId = ref('')

async function load() {
  loading.value = true
  try {
    const [admins, users] = await Promise.all([
      adminGet<SuperadminItem[]>('/api/admin/admins'),
      adminGet<UserListItem[]>('/api/admin/registrations', { status: 'approved' })
    ])
    all.value = admins
    candidates.value = users
    selectedTargetId.value = ''
  } finally {
    loading.value = false
  }
}

onMounted(load)

const active = computed(() => all.value.filter(a => !a.isRevoked))
const revoked = computed(() => all.value.filter(a => a.isRevoked))

const candidateUsernames = computed(() => {
  const activeUsernames = new Set(active.value.map(a => a.username))
  const q = search.value.trim().toLowerCase()
  return candidates.value
    .filter(u => !activeUsernames.has(u.username))
    .filter(u => !q || u.username.toLowerCase().includes(q))
})

async function revoke(a: SuperadminItem) {
  if (active.value.length <= 1) {
    toast.pushToast({ level: 'warn', title: 'Non puoi revocare l\'ultimo superadmin attivo' })
    return
  }
  if (!confirm(`Revocare ${a.username}? Le sue sessioni attive saranno invalidate.`)) return
  try {
    await adminPost(`/api/admin/admins/${a.id}/revoke`, {})
    toast.pushToast({ level: 'info', title: `${a.username} revocato` })
    await load()
  } catch { /* report già fatto */ }
}

async function elevate() {
  if (!selectedTargetId.value) return
  const target = candidates.value.find(c => c.id === selectedTargetId.value)
  if (!target) return
  if (!confirm(`Promuovere ${target.username} a superadmin?`)) return
  try {
    await adminPost('/api/admin/admins', { targetUserId: target.id })
    toast.pushToast({ level: 'info', title: `${target.username} promosso` })
    await load()
  } catch { /* report già fatto */ }
}

function fmtDate(ms: number | null): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <section class="p-6 space-y-6">
    <header class="flex items-center justify-between">
      <h1
        class="text-lg font-semibold"
        style="color: var(--z-text-hi)"
      >
        Superadmin
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

    <!-- Active list -->
    <div>
      <h2
        class="text-xs uppercase tracking-wide mb-2"
        style="color: var(--z-text-md)"
      >
        Attivi ({{ active.length }})
      </h2>
      <ul
        v-if="active.length"
        class="space-y-2"
      >
        <li
          v-for="a in active"
          :key="a.id"
          class="flex items-center justify-between gap-3 px-3 py-2 rounded"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        >
          <div class="flex-1 min-w-0">
            <span
              class="text-sm font-semibold"
              style="color: var(--z-text-hi)"
            >{{ a.username }}</span>
            <span
              v-if="a.mustReset"
              class="ml-2 text-xs px-1.5 py-0.5 rounded"
              style="background: var(--z-rust-700); color: var(--z-rust-300)"
            >must reset</span>
            <span
              class="ml-2 text-xs font-mono-z"
              style="color: var(--z-text-lo)"
            >creato {{ fmtDate(a.createdAt) }}</span>
          </div>
          <UButton
            size="xs"
            variant="soft"
            color="error"
            :disabled="active.length <= 1"
            @click="revoke(a)"
          >
            Revoca
          </UButton>
        </li>
      </ul>
      <p
        v-else
        class="text-xs italic"
        style="color: var(--z-text-lo)"
      >
        Nessun superadmin attivo.
      </p>
    </div>

    <!-- Promote section -->
    <div
      class="p-4 rounded space-y-3"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <h2
        class="text-xs uppercase tracking-wide"
        style="color: var(--z-text-md)"
      >
        Promuovi utente esistente
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          v-model="search"
          type="text"
          placeholder="Filtra per username…"
          class="px-3 py-1.5 rounded font-mono-z text-sm"
          style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
        >
        <select
          v-model="selectedTargetId"
          class="px-2 py-1.5 rounded font-mono-z text-xs md:col-span-1"
          style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
        >
          <option value="">
            — seleziona utente —
          </option>
          <option
            v-for="u in candidateUsernames"
            :key="u.id"
            :value="u.id"
          >
            {{ u.username }}
          </option>
        </select>
        <UButton
          size="sm"
          color="primary"
          :disabled="!selectedTargetId"
          @click="elevate"
        >
          Promuovi a superadmin
        </UButton>
      </div>
    </div>

    <!-- Revoked list (collapsible) -->
    <div>
      <button
        type="button"
        class="text-xs uppercase tracking-wide flex items-center gap-1"
        style="color: var(--z-text-md)"
        @click="showRevoked = !showRevoked"
      >
        <span>{{ showRevoked ? '▾' : '▸' }}</span>
        Revocati ({{ revoked.length }})
      </button>
      <ul
        v-if="showRevoked && revoked.length"
        class="space-y-2 mt-2"
      >
        <li
          v-for="a in revoked"
          :key="a.id"
          class="px-3 py-2 rounded text-xs font-mono-z"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-md)"
        >
          <span style="color: var(--z-blood-300)">{{ a.username }}</span>
          <span class="ml-2">revocato {{ fmtDate(a.revokedAt) }}</span>
          <span
            v-if="a.revokedBy"
            class="ml-2"
            style="color: var(--z-text-lo)"
          >by {{ a.revokedBy }}</span>
        </li>
      </ul>
      <p
        v-else-if="showRevoked"
        class="text-xs italic mt-2"
        style="color: var(--z-text-lo)"
      >
        Nessuno revocato.
      </p>
    </div>
  </section>
</template>
