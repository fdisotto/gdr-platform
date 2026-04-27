<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMasterToolsStore } from '~/stores/master-tools'
import { usePartyConnections } from '~/composables/usePartyConnections'
import { usePartyStore } from '~/stores/party'
import { usePartySeed } from '~/composables/usePartySeed'
import { useActiveMapAreas } from '~/composables/useActiveMapAreas'
import PartySettingsTab from '~/components/master/PartySettingsTab.vue'
import MembersTab from '~/components/master/MembersTab.vue'
import MapManagementTab from '~/components/master/MapManagementTab.vue'

const seed = usePartySeed()
const tools = useMasterToolsStore(seed)
const connection = usePartyConnections().open(seed)
const party = usePartyStore(seed)
const activeMapAreas = useActiveMapAreas(seed)

type Tab = 'tools' | 'world' | 'settings' | 'members' | 'log'

// Tab raggruppate per area funzionale. Tutta la gestione membri
// (master, inviti, richieste, banditi) vive in una sola tab "Membri"
// con sezioni interne, invece di 4 tab separate.
interface TabGroup {
  id: string
  label: string
  tabs: Array<{ id: Tab, label: string, icon: string }>
}
const TAB_GROUPS: TabGroup[] = [
  {
    id: 'session',
    label: 'Sessione',
    tabs: [
      { id: 'tools', label: 'Strumenti', icon: '🛠' },
      { id: 'world', label: 'Mondo', icon: '🗺' }
    ]
  },
  {
    id: 'party',
    label: 'Party',
    tabs: [
      { id: 'settings', label: 'Impostazioni', icon: '⚙' },
      { id: 'members', label: 'Membri', icon: '👥' }
    ]
  },
  {
    id: 'audit',
    label: 'Audit',
    tabs: [
      { id: 'log', label: 'Log', icon: '📜' }
    ]
  }
]
const activeTab = ref<Tab>('tools')

onMounted(() => {
  tools.refresh()
})

function refresh() {
  tools.refresh()
}

const formatDate = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Strumenti rapidi
const announceText = ref('')
function sendAnnounce() {
  if (!announceText.value.trim()) return
  connection.send({ type: 'master:announce', body: announceText.value.trim() })
  announceText.value = ''
}

const npcArea = ref(party.me?.currentAreaId ?? activeMapAreas.value[0]?.id ?? '')
const npcName = ref('')
const npcBody = ref('')
function sendNpc() {
  if (!npcName.value.trim() || !npcBody.value.trim()) return
  connection.send({ type: 'master:npc', areaId: npcArea.value, npcName: npcName.value.trim(), body: npcBody.value.trim() })
  npcBody.value = ''
}

const rollExpr = ref('1d20')
function rollHidden() {
  if (!rollExpr.value.trim()) return
  connection.send({ type: 'master:hidden-roll', expr: rollExpr.value.trim() })
}

const weatherArea = ref<string>('*')
const weatherCode = ref<'clear' | 'overcast' | 'fog' | 'rain' | 'ashfall' | 'redSky' | 'storm' | 'night'>('rain')
const weatherIntensity = ref(0.7)
function applyWeather() {
  connection.send({
    type: 'master:weather-override',
    areaId: weatherArea.value === '*' ? null : weatherArea.value,
    code: weatherCode.value,
    intensity: weatherIntensity.value
  })
}
function clearWeather() {
  connection.send({
    type: 'master:weather-override',
    areaId: weatherArea.value === '*' ? null : weatherArea.value,
    clear: true
  })
}

const decodedActions = computed(() => {
  return tools.actions.map(a => ({
    ...a,
    payloadObj: a.payload ? JSON.parse(a.payload) as Record<string, unknown> : null
  }))
})
</script>

<template>
  <section
    class="w-full flex flex-col md:flex-row flex-1 min-h-0"
    style="background: var(--z-bg-900)"
  >
    <aside
      class="w-full md:w-52 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible"
      style="border-right: 1px solid var(--z-border); border-bottom: 1px solid var(--z-border); background: var(--z-bg-800)"
    >
      <h3
        class="hidden md:block text-xs uppercase tracking-wide px-4 py-3"
        style="color: var(--z-blood-300); border-bottom: 1px solid var(--z-border)"
      >
        Master
      </h3>
      <!-- Sidebar raggruppata: ogni gruppo ha un header e le sue tab.
           Su mobile le tab scorrono orizzontalmente, niente header gruppo. -->
      <div
        v-for="g in TAB_GROUPS"
        :key="g.id"
        class="contents md:block"
      >
        <h4
          class="hidden md:block text-[10px] uppercase tracking-wider px-4 pt-3 pb-1"
          style="color: var(--z-text-lo)"
        >
          {{ g.label }}
        </h4>
        <button
          v-for="t in g.tabs"
          :key="t.id"
          type="button"
          class="flex-1 md:flex-none text-left px-3 md:px-4 py-2 text-xs md:text-sm flex items-center gap-2 shrink-0 whitespace-nowrap"
          :style="activeTab === t.id
            ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
            : 'background: transparent; color: var(--z-text-md)'"
          @click="activeTab = t.id"
        >
          <span class="text-base leading-none">{{ t.icon }}</span>
          <span>{{ t.label }}</span>
        </button>
      </div>
      <div class="hidden md:block flex-1" />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        class="m-2"
        icon="i-lucide-refresh-cw"
        @click="refresh"
      >
        <span class="hidden md:inline">Aggiorna</span>
      </UButton>
    </aside>

    <div class="flex-1 overflow-y-auto p-4">
      <!-- TOOLS -->
      <div
        v-if="activeTab === 'tools'"
        class="space-y-4"
      >
        <section
          class="rounded-md p-3 space-y-2"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        >
          <h4
            class="text-xs uppercase tracking-wide"
            style="color: var(--z-text-md)"
          >
            Annuncio globale
          </h4>
          <textarea
            v-model="announceText"
            rows="2"
            class="w-full bg-transparent border rounded px-2 py-1 text-sm"
            style="border-color: var(--z-border); color: var(--z-text-hi)"
            placeholder="Testo che appare a tutti i player"
          />
          <UButton
            size="xs"
            color="primary"
            @click="sendAnnounce"
          >
            Annuncia
          </UButton>
        </section>

        <section
          class="rounded-md p-3 space-y-2"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        >
          <h4
            class="text-xs uppercase tracking-wide"
            style="color: var(--z-text-md)"
          >
            NPC speaker
          </h4>
          <div class="flex gap-2">
            <select
              v-model="npcArea"
              class="bg-transparent border rounded px-2 py-1 text-sm"
              style="border-color: var(--z-border); color: var(--z-text-hi)"
            >
              <option
                v-for="a in activeMapAreas"
                :key="a.id"
                :value="a.id"
              >
                {{ a.name }}
              </option>
            </select>
            <input
              v-model="npcName"
              type="text"
              placeholder="Nome NPC"
              class="flex-1 bg-transparent border rounded px-2 py-1 text-sm"
              style="border-color: var(--z-border); color: var(--z-text-hi)"
            >
          </div>
          <textarea
            v-model="npcBody"
            rows="2"
            class="w-full bg-transparent border rounded px-2 py-1 text-sm"
            style="border-color: var(--z-border); color: var(--z-text-hi)"
            placeholder="Cosa dice l'NPC"
          />
          <UButton
            size="xs"
            color="primary"
            @click="sendNpc"
          >
            Parla come NPC
          </UButton>
        </section>

        <section
          class="rounded-md p-3 space-y-2"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        >
          <h4
            class="text-xs uppercase tracking-wide"
            style="color: var(--z-text-md)"
          >
            Hidden roll
          </h4>
          <div class="flex gap-2">
            <input
              v-model="rollExpr"
              type="text"
              placeholder="es. 2d6+3"
              class="flex-1 bg-transparent border rounded px-2 py-1 text-sm font-mono-z"
              style="border-color: var(--z-border); color: var(--z-text-hi)"
            >
            <UButton
              size="xs"
              color="primary"
              @click="rollHidden"
            >
              Tira nascosto
            </UButton>
          </div>
          <p
            class="text-xs"
            style="color: var(--z-text-lo)"
          >
            Il risultato compare solo nella tua chat.
          </p>
        </section>

        <section
          class="rounded-md p-3 space-y-2"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        >
          <h4
            class="text-xs uppercase tracking-wide"
            style="color: var(--z-text-md)"
          >
            Override meteo
          </h4>
          <div class="flex gap-2 flex-wrap items-center">
            <select
              v-model="weatherArea"
              class="bg-transparent border rounded px-2 py-1 text-sm"
              style="border-color: var(--z-border); color: var(--z-text-hi)"
            >
              <option value="*">
                * globale
              </option>
              <option
                v-for="a in activeMapAreas"
                :key="a.id"
                :value="a.id"
              >
                {{ a.name }}
              </option>
            </select>
            <select
              v-model="weatherCode"
              class="bg-transparent border rounded px-2 py-1 text-sm"
              style="border-color: var(--z-border); color: var(--z-text-hi)"
            >
              <option value="clear">
                clear
              </option>
              <option value="overcast">
                overcast
              </option>
              <option value="fog">
                fog
              </option>
              <option value="rain">
                rain
              </option>
              <option value="ashfall">
                ashfall
              </option>
              <option value="redSky">
                redSky
              </option>
              <option value="storm">
                storm
              </option>
              <option value="night">
                night
              </option>
            </select>
            <input
              v-model.number="weatherIntensity"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="w-32 accent-green-600"
            >
            <span
              class="text-xs font-mono-z"
              style="color: var(--z-text-md)"
            >{{ Math.round(weatherIntensity * 100) }}%</span>
            <UButton
              size="xs"
              color="primary"
              @click="applyWeather"
            >
              Applica
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              @click="clearWeather"
            >
              Rimuovi
            </UButton>
          </div>
        </section>
      </div>

      <!-- LOG -->
      <div
        v-else-if="activeTab === 'log'"
        class="space-y-1"
      >
        <p
          v-if="!decodedActions.length"
          class="text-xs italic"
          style="color: var(--z-text-lo)"
        >
          Nessuna azione master registrata.
        </p>
        <table
          v-else
          class="w-full text-xs"
        >
          <thead>
            <tr style="color: var(--z-text-md)">
              <th class="text-left py-1 px-2">
                Quando
              </th>
              <th class="text-left py-1 px-2">
                Azione
              </th>
              <th class="text-left py-1 px-2">
                Target
              </th>
              <th class="text-left py-1 px-2">
                Payload
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="a in decodedActions"
              :key="a.id"
              style="border-top: 1px solid var(--z-border)"
            >
              <td
                class="py-1 px-2 font-mono-z"
                style="color: var(--z-text-md)"
              >
                {{ formatDate(a.createdAt) }}
              </td>
              <td
                class="py-1 px-2 font-semibold"
                style="color: var(--z-rust-300)"
              >
                {{ a.action }}
              </td>
              <td
                class="py-1 px-2 font-mono-z"
                style="color: var(--z-text-hi)"
              >
                {{ a.target ?? '—' }}
              </td>
              <td
                class="py-1 px-2 font-mono-z"
                style="color: var(--z-text-lo)"
              >
                {{ a.payloadObj ? JSON.stringify(a.payloadObj) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- SETTINGS -->
      <PartySettingsTab v-else-if="activeTab === 'settings'" />

      <!-- MEMBERS: master + inviti + richieste + banditi tutto insieme -->
      <MembersTab v-else-if="activeTab === 'members'" />

      <!-- WORLD -->
      <MapManagementTab v-else-if="activeTab === 'world'" />
    </div>
  </section>
</template>
