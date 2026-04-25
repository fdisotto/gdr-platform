<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAdminApi } from '~/composables/useAdminApi'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'GDR Zombi — Admin Audit' })

interface AdminActionRow {
  id: string
  superadminId: string
  action: string
  targetKind: string | null
  targetId: string | null
  payload: unknown
  createdAt: number
}

interface AuthEventRow {
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

interface CombinedRow {
  source: 'admin' | 'auth'
  id: string
  createdAt: number
  actor: string
  action: string
  target: string
  detail: string
}

const { adminGet } = useAdminApi()

type Source = 'all' | 'admin' | 'auth'
const source = ref<Source>('all')
const actorFilter = ref('')
const kindFilter = ref('')
const limit = ref(200)

const adminRows = ref<AdminActionRow[]>([])
const authRows = ref<AuthEventRow[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const tasks: Promise<unknown>[] = []
    if (source.value !== 'auth') {
      tasks.push(
        adminGet<AdminActionRow[]>('/api/admin/admin-actions', { limit: limit.value })
          .then((r) => { adminRows.value = r })
          .catch(() => { adminRows.value = [] })
      )
    } else {
      adminRows.value = []
    }
    if (source.value !== 'admin') {
      tasks.push(
        adminGet<AuthEventRow[]>('/api/admin/auth-events', { limit: limit.value })
          .then((r) => { authRows.value = r })
          .catch(() => { authRows.value = [] })
      )
    } else {
      authRows.value = []
    }
    await Promise.all(tasks)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(source, load)
watch(limit, load)

const combined = computed<CombinedRow[]>(() => {
  const rows: CombinedRow[] = []
  for (const a of adminRows.value) {
    rows.push({
      source: 'admin',
      id: a.id,
      createdAt: a.createdAt,
      actor: a.superadminId,
      action: a.action,
      target: [a.targetKind, a.targetId].filter(Boolean).join(':') || '—',
      detail: a.payload != null ? JSON.stringify(a.payload) : ''
    })
  }
  for (const e of authRows.value) {
    rows.push({
      source: 'auth',
      id: e.id,
      createdAt: e.createdAt,
      actor: e.actorId ?? e.actorKind,
      action: e.event,
      target: e.usernameAttempted ?? '—',
      detail: e.detail ?? ''
    })
  }
  rows.sort((a, b) => b.createdAt - a.createdAt)
  return rows
})

const filtered = computed<CombinedRow[]>(() => {
  let out = combined.value
  const a = actorFilter.value.trim().toLowerCase()
  if (a) out = out.filter(r => r.actor.toLowerCase().includes(a))
  const k = kindFilter.value.trim().toLowerCase()
  if (k) out = out.filter(r => r.action.toLowerCase().includes(k))
  return out
})

function fmtDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex items-center justify-between">
      <h1
        class="text-lg font-semibold"
        style="color: var(--z-text-hi)"
      >
        Audit
      </h1>
      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          :loading="loading"
          @click="load"
        >
          Aggiorna
        </UButton>
        <a
          href="/api/admin/export?kind=audit"
          class="px-3 py-1.5 rounded text-xs"
          style="background: var(--z-bg-700); color: var(--z-green-300); border: 1px solid var(--z-border); text-decoration: none"
        >
          Esporta CSV
        </a>
      </div>
    </header>

    <div class="flex gap-2 flex-wrap items-center">
      <div class="flex gap-1">
        <button
          v-for="s in (['all', 'admin', 'auth'] as const)"
          :key="s"
          type="button"
          class="px-3 py-1.5 rounded text-xs uppercase tracking-wide"
          :style="source === s
            ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
            : 'background: var(--z-bg-800); color: var(--z-text-md); border: 1px solid var(--z-border)'"
          @click="source = s"
        >
          {{ s === 'all' ? 'Tutto' : s === 'admin' ? 'Solo admin' : 'Solo auth' }}
        </button>
      </div>
      <input
        v-model="actorFilter"
        type="text"
        placeholder="Filtra actor…"
        class="px-3 py-1.5 rounded font-mono-z text-xs w-40"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
      >
      <input
        v-model="kindFilter"
        type="text"
        placeholder="Filtra azione…"
        class="px-3 py-1.5 rounded font-mono-z text-xs w-40"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
      >
      <select
        v-model.number="limit"
        class="px-2 py-1.5 rounded font-mono-z text-xs"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
      >
        <option :value="100">
          100 righe
        </option>
        <option :value="200">
          200 righe
        </option>
        <option :value="500">
          500 righe
        </option>
      </select>
    </div>

    <div
      class="overflow-x-auto rounded"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <table
        v-if="filtered.length"
        class="w-full text-xs"
      >
        <thead>
          <tr style="color: var(--z-text-md)">
            <th class="text-left py-2 px-2">
              Quando
            </th>
            <th class="text-left py-2 px-2">
              Source
            </th>
            <th class="text-left py-2 px-2">
              Actor
            </th>
            <th class="text-left py-2 px-2">
              Action
            </th>
            <th class="text-left py-2 px-2">
              Target
            </th>
            <th class="text-left py-2 px-2">
              Detail
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in filtered"
            :key="r.source + r.id"
            style="border-top: 1px solid var(--z-border)"
          >
            <td
              class="py-2 px-2 font-mono-z"
              style="color: var(--z-text-md)"
            >
              {{ fmtDate(r.createdAt) }}
            </td>
            <td class="py-2 px-2">
              <span
                class="text-xs px-1.5 py-0.5 rounded"
                :style="r.source === 'admin'
                  ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
                  : 'background: var(--z-green-900); color: var(--z-green-300)'"
              >{{ r.source }}</span>
            </td>
            <td
              class="py-2 px-2 font-mono-z"
              style="color: var(--z-text-md)"
            >
              {{ r.actor }}
            </td>
            <td
              class="py-2 px-2 font-semibold"
              :style="r.action.includes('failed') || r.action.includes('revoke') || r.action.includes('delete')
                ? 'color: var(--z-blood-300)'
                : 'color: var(--z-text-hi)'"
            >
              {{ r.action }}
            </td>
            <td
              class="py-2 px-2 font-mono-z"
              style="color: var(--z-text-md)"
            >
              {{ r.target }}
            </td>
            <td
              class="py-2 px-2 font-mono-z truncate max-w-md"
              style="color: var(--z-text-lo)"
            >
              {{ r.detail }}
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-else
        class="text-xs italic p-4 text-center"
        style="color: var(--z-text-lo)"
      >
        Nessun evento.
      </p>
    </div>
  </section>
</template>
