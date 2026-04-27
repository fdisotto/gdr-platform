<script setup lang="ts">
import { useMasterToolsStore } from '~/stores/master-tools'
import { usePartyConnections } from '~/composables/usePartyConnections'
import { usePartySeed } from '~/composables/usePartySeed'
import MasterListTab from '~/components/master/MasterListTab.vue'
import InvitesTab from '~/components/master/InvitesTab.vue'
import JoinRequestsTab from '~/components/master/JoinRequestsTab.vue'

// Pannello unico "Membri": invece di 4 tab separate (Master / Inviti /
// Richieste / Banditi), tutte le azioni sui partecipanti della party
// vivono qui, divise in sezioni con header riconoscibile.
const seed = usePartySeed()
const tools = useMasterToolsStore(seed)
const connection = usePartyConnections().open(seed)

function unbanNickname(nicknameLower: string) {
  if (!confirm(`Sbloccare ${nicknameLower}?`)) return
  connection.send({ type: 'master:unban', nicknameLower })
  setTimeout(() => tools.refresh(), 200)
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <div class="space-y-6">
    <!-- ── Master della party ─────────────────────────────────────────── -->
    <section>
      <header
        class="flex items-center gap-2 mb-2 pb-1.5"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <span class="text-base">👑</span>
        <h3
          class="text-sm font-semibold uppercase tracking-wide"
          style="color: var(--z-blood-300)"
        >
          Master
        </h3>
        <span
          class="text-xs"
          style="color: var(--z-text-lo)"
        >promuovi / cedi ruolo</span>
      </header>
      <MasterListTab />
    </section>

    <!-- ── Inviti pendenti ────────────────────────────────────────────── -->
    <section>
      <header
        class="flex items-center gap-2 mb-2 pb-1.5"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <span class="text-base">✉</span>
        <h3
          class="text-sm font-semibold uppercase tracking-wide"
          style="color: var(--z-rust-300)"
        >
          Inviti
        </h3>
        <span
          class="text-xs"
          style="color: var(--z-text-lo)"
        >link per far entrare nuovi player</span>
      </header>
      <InvitesTab />
    </section>

    <!-- ── Richieste di ingresso ──────────────────────────────────────── -->
    <section>
      <header
        class="flex items-center gap-2 mb-2 pb-1.5"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <span class="text-base">📥</span>
        <h3
          class="text-sm font-semibold uppercase tracking-wide"
          style="color: var(--z-whisper-300)"
        >
          Richieste
        </h3>
        <span
          class="text-xs"
          style="color: var(--z-text-lo)"
        >approva / rifiuta chi ha bussato</span>
      </header>
      <JoinRequestsTab />
    </section>

    <!-- ── Banditi ────────────────────────────────────────────────────── -->
    <section>
      <header
        class="flex items-center gap-2 mb-2 pb-1.5"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <span class="text-base">🚫</span>
        <h3
          class="text-sm font-semibold uppercase tracking-wide"
          style="color: var(--z-blood-300)"
        >
          Banditi
        </h3>
        <span
          class="text-xs"
          style="color: var(--z-text-lo)"
        >nickname che non possono rientrare</span>
      </header>
      <p
        v-if="!tools.bans.length"
        class="text-xs italic"
        style="color: var(--z-text-lo)"
      >
        Nessun ban attivo.
      </p>
      <ul
        v-else
        class="space-y-2"
      >
        <li
          v-for="b in tools.bans"
          :key="b.nicknameLower"
          class="flex items-center justify-between gap-3 px-3 py-2 rounded"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        >
          <div class="flex-1 min-w-0">
            <div
              class="text-sm font-semibold truncate"
              style="color: var(--z-blood-300)"
            >
              {{ b.nicknameLower }}
            </div>
            <div
              class="text-xs"
              style="color: var(--z-text-md)"
            >
              <span class="font-mono-z">{{ formatDate(b.bannedAt) }}</span>
              <span v-if="b.reason"> · {{ b.reason }}</span>
            </div>
          </div>
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            @click="unbanNickname(b.nicknameLower)"
          >
            Sblocca
          </UButton>
        </li>
      </ul>
    </section>
  </div>
</template>
