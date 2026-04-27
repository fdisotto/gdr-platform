<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminApi } from '~/composables/useAdminApi'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'GDR Zombi — Admin Party' })

interface AdminPartyRow {
  seed: string
  cityName: string
  visibility: 'public' | 'private'
  joinPolicy: 'auto' | 'request'
  archivedAt: number | null
  memberCount: number
  masterDisplays: string[]
  createdAt: number
  lastActivityAt: number
}

interface ListResponse {
  items: AdminPartyRow[]
  nextCursor: string | null
}

const router = useRouter()
const { adminGet } = useAdminApi()

const status = ref<'all' | 'active' | 'archived'>('all')
const search = ref('')
const items = ref<AdminPartyRow[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)

async function loadFirst() {
  loading.value = true
  try {
    const res = await adminGet<ListResponse>('/api/admin/parties', {
      status: status.value,
      q: search.value.trim() || undefined,
      limit: 20
    })
    items.value = res.items
    nextCursor.value = res.nextCursor
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!nextCursor.value) return
  loading.value = true
  try {
    const res = await adminGet<ListResponse>('/api/admin/parties', {
      status: status.value,
      q: search.value.trim() || undefined,
      cursor: nextCursor.value,
      limit: 20
    })
    items.value = [...items.value, ...res.items]
    nextCursor.value = res.nextCursor
  } finally {
    loading.value = false
  }
}

onMounted(loadFirst)
watch(status, loadFirst)

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadFirst, 250)
})

function openParty(seed: string) {
  void router.push(`/admin/parties/${seed}`)
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex items-center justify-between gap-3">
      <h1
        class="text-lg font-semibold"
        style="color: var(--z-text-hi)"
      >
        Party
      </h1>
      <div class="flex gap-2 items-center">
        <select
          v-model="status"
          class="px-2 py-1.5 rounded font-mono-z text-xs"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
        >
          <option value="all">
            Tutte
          </option>
          <option value="active">
            Attive
          </option>
          <option value="archived">
            Archiviate
          </option>
        </select>
        <input
          v-model="search"
          type="text"
          placeholder="Cerca città/seed…"
          class="px-3 py-1.5 rounded font-mono-z text-sm w-64"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
        >
      </div>
    </header>

    <table
      v-if="items.length"
      class="w-full text-xs"
      style="border-collapse: collapse"
    >
      <thead>
        <tr style="color: var(--z-text-md)">
          <th class="text-left py-2 px-2">
            Città
          </th>
          <th class="text-left py-2 px-2">
            Seed
          </th>
          <th class="text-left py-2 px-2">
            Master
          </th>
          <th class="text-left py-2 px-2">
            Membri
          </th>
          <th class="text-left py-2 px-2">
            Visibilità
          </th>
          <th class="text-left py-2 px-2">
            Policy
          </th>
          <th class="text-left py-2 px-2">
            Stato
          </th>
          <th class="text-left py-2 px-2">
            Ultima attività
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="p in items"
          :key="p.seed"
          class="cursor-pointer"
          style="border-top: 1px solid var(--z-border)"
          @click="openParty(p.seed)"
        >
          <td
            class="py-2 px-2 font-semibold"
            style="color: var(--z-text-hi)"
          >
            {{ p.cityName }}
          </td>
          <td
            class="py-2 px-2 font-mono-z"
            style="color: var(--z-text-md)"
          >
            {{ p.seed }}
          </td>
          <td
            class="py-2 px-2 font-mono-z"
            style="color: var(--z-text-md)"
          >
            {{ p.masterDisplays.join(', ') || '—' }}
          </td>
          <td
            class="py-2 px-2 font-mono-z"
            style="color: var(--z-text-md)"
          >
            {{ p.memberCount }}
          </td>
          <td class="py-2 px-2">
            <span
              class="text-xs px-1.5 py-0.5 rounded"
              :style="p.visibility === 'public'
                ? 'background: var(--z-green-900); color: var(--z-green-300)'
                : 'background: var(--z-whisper-500); color: var(--z-bg-900)'"
            >{{ p.visibility }}</span>
          </td>
          <td
            class="py-2 px-2 font-mono-z"
            style="color: var(--z-text-md)"
          >
            {{ p.joinPolicy }}
          </td>
          <td class="py-2 px-2">
            <span
              v-if="p.archivedAt"
              class="text-xs px-1.5 py-0.5 rounded"
              style="background: var(--z-rust-700); color: var(--z-rust-300)"
            >archiviata</span>
            <span
              v-else
              class="text-xs px-1.5 py-0.5 rounded"
              style="background: var(--z-green-900); color: var(--z-green-300)"
            >attiva</span>
          </td>
          <td
            class="py-2 px-2 font-mono-z"
            style="color: var(--z-text-lo)"
          >
            {{ fmtDate(p.lastActivityAt) }}
          </td>
        </tr>
      </tbody>
    </table>
    <p
      v-else-if="!loading"
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Nessun party.
    </p>
    <p
      v-else
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Caricamento…
    </p>

    <div
      v-if="nextCursor"
      class="pt-2"
    >
      <UButton
        size="xs"
        variant="soft"
        color="neutral"
        :loading="loading"
        @click="loadMore"
      >
        Carica altre
      </UButton>
    </div>
  </section>
</template>
