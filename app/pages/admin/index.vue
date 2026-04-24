<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'
import { useAuthStore } from '~/stores/auth'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import { useFeedbackStore } from '~/stores/feedback'

useSeoMeta({ title: 'GDR Zombi — Dashboard Admin' })

const router = useRouter()
const authStore = useAuthStore()
const auth = useAuth()
const feedback = useErrorFeedback()
const toastStore = useFeedbackStore()

type Tab = 'registrations' | 'users' | 'audit'
const tab = ref<Tab>('registrations')

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

interface AuthEvent {
  id: string
  actorKind: 'user' | 'superadmin' | 'anonymous'
  actorId: string | null
  usernameAttempted: string | null
  event: string
  ip: string | null
  userAgent: string | null
  detail: string | null
  createdAt: number
}

const pending = ref<UserListItem[]>([])
const approved = ref<UserListItem[]>([])
const banned = ref<UserListItem[]>([])
const events = ref<AuthEvent[]>([])
const loading = ref(false)

async function loadRegistrations() {
  try {
    pending.value = await $fetch<UserListItem[]>('/api/admin/registrations?status=pending')
  } catch (err) {
    feedback.reportFromError(err)
  }
}
async function loadUsers() {
  try {
    const [a, b] = await Promise.all([
      $fetch<UserListItem[]>('/api/admin/registrations?status=approved'),
      $fetch<UserListItem[]>('/api/admin/registrations?status=banned')
    ])
    approved.value = a
    banned.value = b
  } catch (err) {
    feedback.reportFromError(err)
  }
}
async function loadAudit() {
  try {
    events.value = await $fetch<AuthEvent[]>('/api/admin/auth-events?limit=100')
  } catch (err) {
    feedback.reportFromError(err)
  }
}

async function refreshCurrent() {
  loading.value = true
  try {
    if (tab.value === 'registrations') await loadRegistrations()
    else if (tab.value === 'users') await loadUsers()
    else if (tab.value === 'audit') await loadAudit()
  } finally {
    loading.value = false
  }
}

onMounted(refreshCurrent)

function switchTab(t: Tab) {
  tab.value = t
  void refreshCurrent()
}

async function approve(id: string) {
  try {
    await $fetch(`/api/admin/registrations/${id}/approve`, { method: 'POST' })
    toastStore.pushToast({ level: 'info', title: 'Utente approvato' })
    await loadRegistrations()
  } catch (err) {
    feedback.reportFromError(err)
  }
}
async function reject(id: string) {
  if (!confirm('Rifiutare la registrazione? L\'utente pending verrà eliminato.')) return
  try {
    await $fetch(`/api/admin/registrations/${id}/reject`, { method: 'POST', body: {} })
    toastStore.pushToast({ level: 'info', title: 'Registrazione rifiutata' })
    await loadRegistrations()
  } catch (err) {
    feedback.reportFromError(err)
  }
}
async function banUser(id: string, username: string) {
  const reason = prompt(`Ragione del ban per ${username}? (vuoto = nessuna)`)
  if (reason === null) return
  try {
    await $fetch(`/api/admin/users/${id}/ban`, { method: 'POST', body: { reason: reason || undefined } })
    toastStore.pushToast({ level: 'info', title: `${username} bannato` })
    await loadUsers()
  } catch (err) {
    feedback.reportFromError(err)
  }
}
async function resetPassword(id: string, username: string) {
  if (!confirm(`Resettare la password di ${username}? Verrà generata una password temporanea.`)) return
  try {
    const res = await $fetch<{ tempPassword: string }>(`/api/admin/users/${id}/reset-password`, { method: 'POST' })
    // Mostra un toast danger a TTL lungo con la password in chiaro.
    toastStore.pushToast({
      level: 'danger',
      title: `Password temporanea per ${username}: ${res.tempPassword}`,
      detail: 'Copiala e consegnala all\'utente. Non sarà più mostrata.',
      ttlMs: 60_000
    })
    await loadUsers()
  } catch (err) {
    feedback.reportFromError(err)
  }
}

async function onLogout() {
  await auth.adminLogout()
  await router.push('/admin/login')
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const tabLabel = computed(() => ({
  registrations: 'Registrazioni pending',
  users: 'Utenti',
  audit: 'Audit log'
} as const))
</script>

<template>
  <main class="min-h-screen flex">
    <aside
      class="w-48 flex flex-col p-3 gap-1"
      style="background: var(--z-bg-800); border-right: 1px solid var(--z-border)"
    >
      <h2
        class="text-xs uppercase tracking-wide px-2 py-2"
        style="color: var(--z-blood-300); border-bottom: 1px solid var(--z-border)"
      >
        Admin
      </h2>
      <button
        v-for="t in (['registrations', 'users', 'audit'] as const)"
        :key="t"
        type="button"
        class="text-left px-3 py-2 rounded text-sm"
        :style="tab === t
          ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
          : 'background: transparent; color: var(--z-text-md)'"
        @click="switchTab(t)"
      >
        {{ tabLabel[t] }}
      </button>
      <div class="flex-1" />
      <p
        class="text-xs px-2 py-1"
        style="color: var(--z-text-md)"
      >
        {{ authStore.identity?.username }}
      </p>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        @click="refreshCurrent"
      >
        Aggiorna
      </UButton>
      <UButton
        size="xs"
        variant="soft"
        color="error"
        @click="onLogout"
      >
        Logout
      </UButton>
    </aside>

    <section class="flex-1 p-6 overflow-y-auto">
      <h1
        class="text-lg font-semibold mb-4"
        style="color: var(--z-text-hi)"
      >
        {{ tabLabel[tab] }}
      </h1>

      <!-- REGISTRATIONS -->
      <div v-if="tab === 'registrations'">
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
            class="flex items-center justify-between px-3 py-2 rounded"
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
                inviata {{ formatTime(u.createdAt) }}
              </div>
            </div>
            <div class="flex gap-2">
              <UButton
                size="xs"
                color="primary"
                @click="approve(u.id)"
              >
                Approva
              </UButton>
              <UButton
                size="xs"
                color="error"
                variant="soft"
                @click="reject(u.id)"
              >
                Rifiuta
              </UButton>
            </div>
          </li>
        </ul>
      </div>

      <!-- USERS -->
      <div
        v-else-if="tab === 'users'"
        class="space-y-6"
      >
        <div>
          <h3
            class="text-xs uppercase tracking-wide mb-2"
            style="color: var(--z-text-md)"
          >
            Approvati ({{ approved.length }})
          </h3>
          <ul
            v-if="approved.length"
            class="space-y-2"
          >
            <li
              v-for="u in approved"
              :key="u.id"
              class="flex items-center justify-between px-3 py-2 rounded"
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
                  @click="resetPassword(u.id, u.username)"
                >
                  Reset password
                </UButton>
                <UButton
                  size="xs"
                  color="error"
                  variant="soft"
                  @click="banUser(u.id, u.username)"
                >
                  Ban
                </UButton>
              </div>
            </li>
          </ul>
          <p
            v-else
            class="text-xs italic"
            style="color: var(--z-text-lo)"
          >
            Nessun utente approvato.
          </p>
        </div>

        <div>
          <h3
            class="text-xs uppercase tracking-wide mb-2"
            style="color: var(--z-text-md)"
          >
            Bannati ({{ banned.length }})
          </h3>
          <ul
            v-if="banned.length"
            class="space-y-2"
          >
            <li
              v-for="u in banned"
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
            </li>
          </ul>
          <p
            v-else
            class="text-xs italic"
            style="color: var(--z-text-lo)"
          >
            Nessun ban attivo.
          </p>
        </div>
      </div>

      <!-- AUDIT -->
      <div v-else-if="tab === 'audit'">
        <table
          v-if="events.length"
          class="w-full text-xs"
        >
          <thead>
            <tr style="color: var(--z-text-md)">
              <th class="text-left py-1 px-2">
                Quando
              </th>
              <th class="text-left py-1 px-2">
                Evento
              </th>
              <th class="text-left py-1 px-2">
                Attore
              </th>
              <th class="text-left py-1 px-2">
                Username
              </th>
              <th class="text-left py-1 px-2">
                IP
              </th>
              <th class="text-left py-1 px-2">
                Detail
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in events"
              :key="e.id"
              style="border-top: 1px solid var(--z-border)"
            >
              <td
                class="py-1 px-2 font-mono-z"
                style="color: var(--z-text-md)"
              >
                {{ formatTime(e.createdAt) }}
              </td>
              <td
                class="py-1 px-2 font-semibold"
                :style="e.event.includes('failed') ? 'color: var(--z-rust-300)' : 'color: var(--z-text-hi)'"
              >
                {{ e.event }}
              </td>
              <td
                class="py-1 px-2 font-mono-z"
                style="color: var(--z-text-md)"
              >
                {{ e.actorKind }}
              </td>
              <td
                class="py-1 px-2 font-mono-z"
                style="color: var(--z-text-hi)"
              >
                {{ e.usernameAttempted ?? '—' }}
              </td>
              <td
                class="py-1 px-2 font-mono-z"
                style="color: var(--z-text-lo)"
              >
                {{ e.ip ?? '—' }}
              </td>
              <td
                class="py-1 px-2 font-mono-z"
                style="color: var(--z-text-lo)"
              >
                {{ e.detail ?? '—' }}
              </td>
            </tr>
          </tbody>
        </table>
        <p
          v-else
          class="text-xs italic"
          style="color: var(--z-text-lo)"
        >
          Nessun evento registrato.
        </p>
      </div>
    </section>
  </main>
</template>
