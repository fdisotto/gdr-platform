<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminApi } from '~/composables/useAdminApi'
import { useFeedbackStore } from '~/stores/feedback'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'GDR Zombi — Admin Party detail' })

interface Member {
  id: string
  userId: string
  nickname: string
  role: 'user' | 'master'
  joinedAt: number
  lastSeenAt: number
  isMuted: boolean
  leftAt: number | null
  username: string | null
}

interface PartyDetail {
  seed: string
  cityName: string
  visibility: 'public' | 'private'
  joinPolicy: 'auto' | 'request'
  archivedAt: number | null
  createdAt: number
  lastActivityAt: number
  members: Member[]
  counts: { messages: number, zombies: number, activeInvites: number }
}

const route = useRoute()
const router = useRouter()
const { adminGet, adminPost, adminDelete } = useAdminApi()
const toast = useFeedbackStore()

const seed = computed(() => route.params.seed as string)
const detail = ref<PartyDetail | null>(null)
const loading = ref(false)
const tab = ref<'members' | 'settings' | 'actions'>('members')

// Edit form
const editVisibility = ref<'public' | 'private'>('public')
const editJoinPolicy = ref<'auto' | 'request'>('auto')
const editCityName = ref('')

// Transfer master form
const fromUserId = ref('')
const toUserId = ref('')

async function loadDetail() {
  loading.value = true
  try {
    const res = await adminGet<PartyDetail>(`/api/admin/parties/${seed.value}`)
    detail.value = res
    editVisibility.value = res.visibility
    editJoinPolicy.value = res.joinPolicy
    editCityName.value = res.cityName
    fromUserId.value = ''
    toUserId.value = ''
  } finally {
    loading.value = false
  }
}

onMounted(loadDetail)

const masters = computed(() => detail.value?.members.filter(m => m.role === 'master') ?? [])
const nonMasters = computed(() => detail.value?.members.filter(m => m.role === 'user') ?? [])

async function saveSettings() {
  if (!detail.value) return
  try {
    await adminPost(`/api/admin/parties/${seed.value}/edit`, {
      visibility: editVisibility.value,
      joinPolicy: editJoinPolicy.value,
      cityName: editCityName.value
    })
    toast.pushToast({ level: 'info', title: 'Impostazioni salvate' })
    await loadDetail()
  } catch { /* report già fatto */ }
}

async function transferMaster() {
  if (!fromUserId.value || !toUserId.value) return
  if (!confirm('Confermi il trasferimento master?')) return
  try {
    await adminPost(`/api/admin/parties/${seed.value}/transfer-master`, {
      fromUserId: fromUserId.value,
      toUserId: toUserId.value
    })
    toast.pushToast({ level: 'info', title: 'Master trasferito' })
    await loadDetail()
  } catch { /* report già fatto */ }
}

async function archiveParty() {
  if (!confirm('Archiviare il party? I membri online verranno disconnessi.')) return
  try {
    await adminPost(`/api/admin/parties/${seed.value}/archive`)
    toast.pushToast({ level: 'info', title: 'Party archiviato' })
    await loadDetail()
  } catch { /* report già fatto */ }
}

async function restoreParty() {
  if (!confirm('Ripristinare il party?')) return
  try {
    await adminPost(`/api/admin/parties/${seed.value}/restore`)
    toast.pushToast({ level: 'info', title: 'Party ripristinata' })
    await loadDetail()
  } catch { /* report già fatto */ }
}

async function deleteParty() {
  const v = prompt('Per eliminare definitivamente il party scrivi DELETE in maiuscolo:')
  if (v !== 'DELETE') {
    if (v !== null) toast.pushToast({ level: 'warn', title: 'Conferma non valida' })
    return
  }
  try {
    await adminDelete(`/api/admin/parties/${seed.value}`, { confirm: 'DELETE' })
    toast.pushToast({ level: 'danger', title: 'Party eliminata' })
    await router.push('/admin/parties')
  } catch { /* report già fatto */ }
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex items-center justify-between gap-3">
      <div>
        <NuxtLink
          to="/admin/parties"
          class="text-xs"
          style="color: var(--z-text-md); text-decoration: underline"
        >
          ← Tutte i party
        </NuxtLink>
        <h1
          class="text-lg font-semibold mt-1"
          style="color: var(--z-text-hi)"
        >
          {{ detail?.cityName ?? '…' }}
        </h1>
        <p
          class="text-xs font-mono-z"
          style="color: var(--z-text-md)"
        >
          {{ seed }}
        </p>
      </div>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :loading="loading"
        @click="loadDetail"
      >
        Aggiorna
      </UButton>
    </header>

    <div
      v-if="detail"
      class="grid grid-cols-2 md:grid-cols-4 gap-3"
    >
      <div
        class="p-3 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase"
          style="color: var(--z-text-md)"
        >
          Stato
        </p>
        <p
          class="text-sm font-semibold mt-1"
          :style="detail.archivedAt ? 'color: var(--z-rust-300)' : 'color: var(--z-green-300)'"
        >
          {{ detail.archivedAt ? 'archiviata' : 'attiva' }}
        </p>
      </div>
      <div
        class="p-3 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase"
          style="color: var(--z-text-md)"
        >
          Membri
        </p>
        <p
          class="text-sm font-semibold mt-1"
          style="color: var(--z-text-hi)"
        >
          {{ detail.members.length }}
        </p>
      </div>
      <div
        class="p-3 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase"
          style="color: var(--z-text-md)"
        >
          Messaggi
        </p>
        <p
          class="text-sm font-semibold mt-1"
          style="color: var(--z-text-hi)"
        >
          {{ detail.counts.messages }}
        </p>
      </div>
      <div
        class="p-3 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <p
          class="text-xs uppercase"
          style="color: var(--z-text-md)"
        >
          Inviti attivi
        </p>
        <p
          class="text-sm font-semibold mt-1"
          style="color: var(--z-text-hi)"
        >
          {{ detail.counts.activeInvites }}
        </p>
      </div>
    </div>

    <div class="flex gap-1">
      <button
        v-for="t in (['members', 'settings', 'actions'] as const)"
        :key="t"
        type="button"
        class="px-3 py-1.5 rounded text-xs uppercase tracking-wide"
        :style="tab === t
          ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
          : 'background: var(--z-bg-800); color: var(--z-text-md); border: 1px solid var(--z-border)'"
        @click="tab = t"
      >
        {{ t === 'members' ? 'Membri' : t === 'settings' ? 'Impostazioni' : 'Azioni' }}
      </button>
    </div>

    <!-- MEMBERS -->
    <div
      v-if="tab === 'members' && detail"
      class="space-y-4"
    >
      <ul class="space-y-1">
        <li
          v-for="m in detail.members"
          :key="m.id"
          class="flex items-center justify-between gap-3 px-3 py-2 rounded text-sm"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        >
          <div class="flex-1 min-w-0">
            <span
              class="font-semibold"
              style="color: var(--z-text-hi)"
            >{{ m.nickname }}</span>
            <span
              v-if="m.role === 'master'"
              class="ml-2 text-xs px-1.5 py-0.5 rounded"
              style="background: var(--z-blood-700); color: var(--z-blood-300)"
            >master</span>
            <span
              v-if="m.username"
              class="ml-2 text-xs font-mono-z"
              style="color: var(--z-text-lo)"
            >({{ m.username }})</span>
          </div>
          <span
            class="text-xs font-mono-z"
            style="color: var(--z-text-lo)"
          >
            joined {{ fmtDate(m.joinedAt) }}
          </span>
        </li>
      </ul>

      <div
        class="p-4 rounded space-y-3"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <h3
          class="text-xs uppercase"
          style="color: var(--z-text-md)"
        >
          Trasferisci master
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <label
              class="block text-xs mb-1"
              style="color: var(--z-text-md)"
            >Da master attuale</label>
            <select
              v-model="fromUserId"
              class="w-full px-2 py-1.5 rounded font-mono-z text-xs"
              style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
            >
              <option value="">
                — seleziona —
              </option>
              <option
                v-for="m in masters"
                :key="m.id"
                :value="m.userId"
              >
                {{ m.nickname }} ({{ m.username ?? m.userId }})
              </option>
            </select>
          </div>
          <div>
            <label
              class="block text-xs mb-1"
              style="color: var(--z-text-md)"
            >A membro</label>
            <select
              v-model="toUserId"
              class="w-full px-2 py-1.5 rounded font-mono-z text-xs"
              style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
            >
              <option value="">
                — seleziona —
              </option>
              <option
                v-for="m in nonMasters"
                :key="m.id"
                :value="m.userId"
              >
                {{ m.nickname }} ({{ m.username ?? m.userId }})
              </option>
            </select>
          </div>
        </div>
        <UButton
          size="sm"
          variant="soft"
          color="primary"
          :disabled="!fromUserId || !toUserId"
          @click="transferMaster"
        >
          Trasferisci
        </UButton>
      </div>
    </div>

    <!-- SETTINGS -->
    <div
      v-if="tab === 'settings' && detail"
      class="p-4 rounded space-y-3"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <div>
        <label
          class="block text-xs mb-1"
          style="color: var(--z-text-md)"
        >Nome città</label>
        <input
          v-model="editCityName"
          type="text"
          maxlength="64"
          class="w-full px-2 py-1.5 rounded font-mono-z text-sm"
          style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
        >
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <label
            class="block text-xs mb-1"
            style="color: var(--z-text-md)"
          >Visibilità</label>
          <select
            v-model="editVisibility"
            class="w-full px-2 py-1.5 rounded font-mono-z text-xs"
            style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
            <option value="public">
              public
            </option>
            <option value="private">
              private
            </option>
          </select>
        </div>
        <div>
          <label
            class="block text-xs mb-1"
            style="color: var(--z-text-md)"
          >Join policy</label>
          <select
            v-model="editJoinPolicy"
            class="w-full px-2 py-1.5 rounded font-mono-z text-xs"
            style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
            <option value="auto">
              auto
            </option>
            <option value="request">
              request
            </option>
          </select>
        </div>
      </div>
      <UButton
        size="sm"
        color="primary"
        @click="saveSettings"
      >
        Salva
      </UButton>
    </div>

    <!-- ACTIONS -->
    <div
      v-if="tab === 'actions' && detail"
      class="p-4 rounded space-y-3"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <p
        class="text-xs"
        style="color: var(--z-text-md)"
      >
        Azioni distruttive sulil party. L'archive disconnette i membri online.
        Delete è irreversibile.
      </p>
      <div class="flex gap-2 flex-wrap">
        <UButton
          v-if="!detail.archivedAt"
          size="sm"
          variant="soft"
          color="warning"
          @click="archiveParty"
        >
          Archivia
        </UButton>
        <UButton
          v-else
          size="sm"
          variant="soft"
          color="primary"
          @click="restoreParty"
        >
          Ripristina
        </UButton>
        <UButton
          size="sm"
          color="error"
          @click="deleteParty"
        >
          Elimina (definitivo)
        </UButton>
      </div>
    </div>
  </section>
</template>
