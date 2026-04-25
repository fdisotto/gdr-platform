<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import MetricsChart from '~/components/admin/MetricsChart.vue'
import { useAdminApi } from '~/composables/useAdminApi'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'GDR Zombi — Admin Metriche' })

interface DailyMetricsRow {
  date: string
  usersTotal: number
  usersApproved: number
  usersPending: number
  usersBanned: number
  partiesTotal: number
  partiesActive: number
  partiesArchived: number
  messagesNew: number
  authLoginSuccess: number
  authLoginFailed: number
  computedAt: number
}

interface TimeseriesResponse {
  from: string
  to: string
  items: DailyMetricsRow[]
}

const { adminGet } = useAdminApi()

const days = ref(30)
const items = ref<DailyMetricsRow[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await adminGet<TimeseriesResponse>('/api/admin/metrics/timeseries', { days: days.value })
    items.value = res.items
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(days, load)

const usersSeries = computed(() => items.value.map(r => ({ date: r.date, value: r.usersApproved })))
const partiesSeries = computed(() => items.value.map(r => ({ date: r.date, value: r.partiesActive })))
const messagesSeries = computed(() => items.value.map(r => ({ date: r.date, value: r.messagesNew })))
const loginSuccessSeries = computed(() => items.value.map(r => ({ date: r.date, value: r.authLoginSuccess })))
const loginFailedSeries = computed(() => items.value.map(r => ({ date: r.date, value: r.authLoginFailed })))

type ExportKind = 'users' | 'parties' | 'audit' | 'messages'
const EXPORT_KINDS: { kind: ExportKind, label: string }[] = [
  { kind: 'users', label: 'Utenti' },
  { kind: 'parties', label: 'Party' },
  { kind: 'audit', label: 'Audit' },
  { kind: 'messages', label: 'Messaggi' }
]

function exportHref(kind: ExportKind): string {
  return `/api/admin/export?kind=${kind}`
}
</script>

<template>
  <section class="p-6 space-y-6">
    <header class="flex items-center justify-between gap-3">
      <h1
        class="text-lg font-semibold"
        style="color: var(--z-text-hi)"
      >
        Metriche
      </h1>
      <div class="flex items-center gap-2">
        <label
          class="text-xs"
          style="color: var(--z-text-md)"
        >Range</label>
        <select
          v-model.number="days"
          class="px-2 py-1.5 rounded font-mono-z text-xs"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
        >
          <option :value="7">
            7 giorni
          </option>
          <option :value="30">
            30 giorni
          </option>
          <option :value="90">
            90 giorni
          </option>
          <option :value="365">
            365 giorni
          </option>
        </select>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          :loading="loading"
          @click="load"
        >
          Aggiorna
        </UButton>
      </div>
    </header>

    <!-- Charts grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div
        class="p-4 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase tracking-wide mb-2"
          style="color: var(--z-text-md)"
        >
          Utenti approvati
        </p>
        <MetricsChart
          :data="usersSeries"
          type="line"
          color="var(--z-green-300)"
        />
      </div>
      <div
        class="p-4 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase tracking-wide mb-2"
          style="color: var(--z-text-md)"
        >
          Party attive
        </p>
        <MetricsChart
          :data="partiesSeries"
          type="line"
          color="var(--z-toxic-500)"
        />
      </div>
      <div
        class="p-4 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase tracking-wide mb-2"
          style="color: var(--z-text-md)"
        >
          Messaggi / giorno
        </p>
        <MetricsChart
          :data="messagesSeries"
          type="bar"
          color="var(--z-green-500)"
        />
      </div>
      <div
        class="p-4 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase tracking-wide mb-2"
          style="color: var(--z-text-md)"
        >
          Login (success vs failed)
        </p>
        <MetricsChart
          :data="loginSuccessSeries"
          type="line"
          color="var(--z-green-300)"
        />
        <MetricsChart
          :data="loginFailedSeries"
          type="line"
          color="var(--z-blood-300)"
        />
      </div>
    </div>

    <!-- Export CSV -->
    <div
      class="p-4 rounded space-y-2"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <h2
        class="text-xs uppercase tracking-wide"
        style="color: var(--z-text-md)"
      >
        Esporta CSV
      </h2>
      <div class="flex gap-2 flex-wrap">
        <a
          v-for="ek in EXPORT_KINDS"
          :key="ek.kind"
          :href="exportHref(ek.kind)"
          class="px-3 py-1.5 rounded text-xs"
          style="background: var(--z-bg-700); color: var(--z-green-300); border: 1px solid var(--z-border); text-decoration: none"
        >
          {{ ek.label }}
        </a>
      </div>
    </div>
  </section>
</template>
