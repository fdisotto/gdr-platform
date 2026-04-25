<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAdminApi } from '~/composables/useAdminApi'
import { useFeedbackStore } from '~/stores/feedback'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'GDR Zombi — Admin Impostazioni' })

interface SettingValue {
  value: unknown
  updatedAt: number
  updatedBy: string | null
}
type SettingsMap = Record<string, SettingValue>

interface SettingDef {
  key: string
  label: string
  description: string
  kind: 'int' | 'bool' | 'text'
  defaultValue: number | boolean | string
  min?: number
  max?: number
}

interface Section {
  title: string
  defs: SettingDef[]
}

const SECTIONS: Section[] = [
  {
    title: 'Limiti',
    defs: [
      { key: 'limits.maxPartiesPerUser', label: 'Max party per utente', description: 'Numero massimo di party a cui un utente può partecipare contemporaneamente.', kind: 'int', defaultValue: 5, min: 1, max: 50 },
      { key: 'limits.maxMembersPerParty', label: 'Max membri per party', description: 'Tetto rigido sui membri attivi di una party.', kind: 'int', defaultValue: 30, min: 1, max: 500 },
      { key: 'limits.maxTotalParties', label: 'Max party totali', description: 'Limite globale di party esistenti sulla piattaforma.', kind: 'int', defaultValue: 100, min: 1, max: 10000 },
      { key: 'limits.partyInactivityArchiveDays', label: 'Giorni inattività auto-archive', description: 'Soglia di inattività oltre la quale una party viene archiviata.', kind: 'int', defaultValue: 30, min: 1, max: 365 },
      { key: 'limits.inviteTtlDays', label: 'TTL invito (giorni)', description: 'Validità di un link invito generato dal master.', kind: 'int', defaultValue: 7, min: 1, max: 60 },
      { key: 'limits.loginRateMaxFailures', label: 'Login fallimenti max', description: 'Massimo tentativi falliti consecutivi prima del lockout.', kind: 'int', defaultValue: 5, min: 1, max: 100 },
      { key: 'limits.loginRateWindowMinutes', label: 'Login finestra (minuti)', description: 'Finestra temporale del rate limiter login.', kind: 'int', defaultValue: 15, min: 1, max: 1440 },
      { key: 'limits.registerRateMaxPerHour', label: 'Registrazioni max/ora', description: 'Massimo numero di nuove registrazioni per indirizzo IP all\'ora.', kind: 'int', defaultValue: 3, min: 1, max: 100 }
    ]
  },
  {
    title: 'Features',
    defs: [
      { key: 'features.registrationEnabled', label: 'Registrazioni aperte', description: 'Se disattivato, l\'endpoint /api/auth/register restituisce 403.', kind: 'bool', defaultValue: true },
      { key: 'features.partyCreationEnabled', label: 'Creazione party abilitata', description: 'Se disattivato, gli utenti non possono creare nuove party.', kind: 'bool', defaultValue: true },
      { key: 'features.voiceChatEnabled', label: 'Chat vocale abilitata', description: 'Toggle globale per la voice chat.', kind: 'bool', defaultValue: true }
    ]
  },
  {
    title: 'Sistema',
    defs: [
      { key: 'system.maintenanceMode', label: 'Modalità manutenzione', description: 'Se attiva, blocca tutti gli utenti non-superadmin.', kind: 'bool', defaultValue: false },
      { key: 'system.maintenanceMessage', label: 'Messaggio manutenzione', description: 'Testo mostrato a chi è bloccato dal middleware.', kind: 'text', defaultValue: 'Manutenzione in corso. Torniamo presto.' }
    ]
  }
]

const ALL_DEFS: SettingDef[] = SECTIONS.flatMap(s => s.defs)

const { adminGet, adminPost } = useAdminApi()
const toast = useFeedbackStore()

const settings = ref<SettingsMap>({})
const loading = ref(false)
const saving = reactive<Record<string, boolean>>({})
const drafts = reactive<Record<string, number | boolean | string>>({})

async function load() {
  loading.value = true
  try {
    settings.value = await adminGet<SettingsMap>('/api/admin/settings')
    for (const def of ALL_DEFS) {
      const cur = settings.value[def.key]
      if (cur != null && cur.value != null) {
        drafts[def.key] = cur.value as number | boolean | string
      } else {
        drafts[def.key] = def.defaultValue
      }
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)

function isDirty(def: SettingDef): boolean {
  const cur = settings.value[def.key]?.value
  return cur !== drafts[def.key]
}

async function save(def: SettingDef) {
  const value = drafts[def.key]
  if (def.kind === 'int') {
    const n = Number(value)
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      toast.pushToast({ level: 'warn', title: 'Valore non intero' })
      return
    }
    if (def.min != null && n < def.min) {
      toast.pushToast({ level: 'warn', title: `Minimo ${def.min}` })
      return
    }
    if (def.max != null && n > def.max) {
      toast.pushToast({ level: 'warn', title: `Massimo ${def.max}` })
      return
    }
    drafts[def.key] = n
  }
  saving[def.key] = true
  try {
    await adminPost(`/api/admin/settings/${encodeURIComponent(def.key)}`, { value: drafts[def.key] })
    toast.pushToast({ level: 'info', title: `${def.label} aggiornata` })
    await load()
  } catch { /* report già fatto */ } finally {
    saving[def.key] = false
  }
}

function resetToDefault(def: SettingDef) {
  drafts[def.key] = def.defaultValue
}

function fmtUpdated(key: string): string {
  const cur = settings.value[key]
  if (!cur || !cur.updatedAt) return 'mai aggiornata'
  const d = new Date(cur.updatedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const sectionsView = computed(() => SECTIONS)
</script>

<template>
  <section class="p-6 space-y-6">
    <header class="flex items-center justify-between">
      <h1
        class="text-lg font-semibold"
        style="color: var(--z-text-hi)"
      >
        Impostazioni
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

    <div
      v-for="sec in sectionsView"
      :key="sec.title"
      class="space-y-3"
    >
      <h2
        class="text-xs uppercase tracking-wide"
        style="color: var(--z-text-md)"
      >
        {{ sec.title }}
      </h2>
      <ul class="space-y-3">
        <li
          v-for="def in sec.defs"
          :key="def.key"
          class="p-4 rounded space-y-2"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        >
          <div class="flex items-baseline justify-between gap-3">
            <div class="flex-1 min-w-0">
              <p
                class="text-sm font-semibold"
                style="color: var(--z-text-hi)"
              >
                {{ def.label }}
              </p>
              <p
                class="text-xs font-mono-z"
                style="color: var(--z-text-lo)"
              >
                {{ def.key }}
              </p>
            </div>
            <p
              class="text-xs font-mono-z"
              style="color: var(--z-text-lo)"
            >
              aggiornata {{ fmtUpdated(def.key) }}
            </p>
          </div>
          <p
            class="text-xs"
            style="color: var(--z-text-md)"
          >
            {{ def.description }}
          </p>

          <div class="flex items-center gap-2 flex-wrap">
            <input
              v-if="def.kind === 'int'"
              v-model.number="drafts[def.key]"
              type="number"
              :min="def.min"
              :max="def.max"
              class="px-3 py-1.5 rounded font-mono-z text-sm w-32"
              style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
            >
            <label
              v-else-if="def.kind === 'bool'"
              class="flex items-center gap-2 text-sm"
              style="color: var(--z-text-hi)"
            >
              <input
                v-model="drafts[def.key]"
                type="checkbox"
              >
              <span>{{ drafts[def.key] ? 'attivo' : 'disattivo' }}</span>
            </label>
            <textarea
              v-else
              v-model="drafts[def.key]"
              rows="2"
              maxlength="500"
              class="flex-1 px-3 py-1.5 rounded font-mono-z text-sm"
              style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
            />
            <UButton
              size="xs"
              color="primary"
              :disabled="!isDirty(def) || saving[def.key]"
              :loading="saving[def.key]"
              @click="save(def)"
            >
              Salva
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              @click="resetToDefault(def)"
            >
              Default
            </UButton>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
