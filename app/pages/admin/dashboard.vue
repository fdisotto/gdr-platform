<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import MetricsChart from '~/components/admin/MetricsChart.vue'
import { useAdminApi } from '~/composables/useAdminApi'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'GDR Zombi — Admin Dashboard' })

interface CountersResponse {
  users: { total: number, pending: number, approved: number, banned: number }
  parties: {
    total: number
    active: number
    archived: number
    byVisibility: { public: number, private: number }
    byPolicy: { auto: number, request: number }
  }
  messages: { total: number, last24h: number }
  zombies: { total: number, npcs: number }
  sessions: { active: number, expiredLast24h: number }
  wsConnections: { current: number }
  serverTime: number
}

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

const counters = ref<CountersResponse | null>(null)
const timeseries = ref<DailyMetricsRow[]>([])
const loading = ref(false)

const { adminGet } = useAdminApi()

async function loadAll() {
  loading.value = true
  try {
    const [c, t] = await Promise.all([
      adminGet<CountersResponse>('/api/admin/metrics/counters'),
      adminGet<TimeseriesResponse>('/api/admin/metrics/timeseries', { days: 30 })
    ])
    counters.value = c
    timeseries.value = t.items
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)

const messagesSeries = computed(() =>
  timeseries.value.map(r => ({ date: r.date, value: r.messagesNew }))
)
const loginSuccessSeries = computed(() =>
  timeseries.value.map(r => ({ date: r.date, value: r.authLoginSuccess }))
)
const loginFailedSeries = computed(() =>
  timeseries.value.map(r => ({ date: r.date, value: r.authLoginFailed }))
)
</script>

<template>
  <section class="p-6 space-y-6">
    <header class="flex items-center justify-between">
      <h1
        class="text-lg font-semibold"
        style="color: var(--z-text-hi)"
      >
        Dashboard
      </h1>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :loading="loading"
        @click="loadAll"
      >
        Aggiorna
      </UButton>
    </header>

    <!-- COUNTERS -->
    <div
      v-if="counters"
      class="grid grid-cols-2 md:grid-cols-4 gap-3"
    >
      <div
        class="p-4 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase tracking-wide mb-2"
          style="color: var(--z-text-md)"
        >
          Utenti
        </p>
        <p
          class="text-2xl font-bold"
          style="color: var(--z-text-hi)"
        >
          {{ counters.users.total }}
        </p>
        <p
          class="text-xs mt-1 font-mono-z"
          style="color: var(--z-text-md)"
        >
          {{ counters.users.approved }} appr · {{ counters.users.pending }} pend · {{ counters.users.banned }} ban
        </p>
      </div>
      <div
        class="p-4 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase tracking-wide mb-2"
          style="color: var(--z-text-md)"
        >
          Party
        </p>
        <p
          class="text-2xl font-bold"
          style="color: var(--z-text-hi)"
        >
          {{ counters.parties.total }}
        </p>
        <p
          class="text-xs mt-1 font-mono-z"
          style="color: var(--z-text-md)"
        >
          {{ counters.parties.active }} attive · {{ counters.parties.archived }} arch
        </p>
      </div>
      <div
        class="p-4 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase tracking-wide mb-2"
          style="color: var(--z-text-md)"
        >
          WS connessi
        </p>
        <p
          class="text-2xl font-bold"
          style="color: var(--z-green-300)"
        >
          {{ counters.wsConnections.current }}
        </p>
        <p
          class="text-xs mt-1 font-mono-z"
          style="color: var(--z-text-md)"
        >
          sessioni: {{ counters.sessions.active }}
        </p>
      </div>
      <div
        class="p-4 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase tracking-wide mb-2"
          style="color: var(--z-text-md)"
        >
          Messaggi 24h
        </p>
        <p
          class="text-2xl font-bold"
          style="color: var(--z-text-hi)"
        >
          {{ counters.messages.last24h }}
        </p>
        <p
          class="text-xs mt-1 font-mono-z"
          style="color: var(--z-text-md)"
        >
          totali: {{ counters.messages.total }}
        </p>
      </div>
    </div>
    <p
      v-else-if="loading"
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Caricamento…
    </p>

    <!-- CHARTS -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div
        class="p-4 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase tracking-wide mb-2"
          style="color: var(--z-text-md)"
        >
          Messaggi / giorno (30g)
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
          Login success / giorno
        </p>
        <MetricsChart
          :data="loginSuccessSeries"
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
          Login failed / giorno
        </p>
        <MetricsChart
          :data="loginFailedSeries"
          type="line"
          color="var(--z-blood-300)"
        />
      </div>
    </div>
  </section>
</template>
