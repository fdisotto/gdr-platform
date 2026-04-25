<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePartyStore } from '~/stores/party'
import { usePartySeed } from '~/composables/usePartySeed'
import { useFeedbackStore } from '~/stores/feedback'
import { useErrorFeedback } from '~/composables/useErrorFeedback'

const seed = usePartySeed()
const party = usePartyStore(seed)
const router = useRouter()
const feedbackStore = useFeedbackStore()
const feedback = useErrorFeedback()

const busy = ref(false)
const leaveBusy = ref(false)

const masters = computed(() => party.players.filter(p => p.role === 'master'))
const users = computed(() => party.players.filter(p => p.role === 'user'))
const masterCount = computed(() => masters.value.length)

// La lista players viene popolata dallo state:init col solo nickname/role,
// non userId. Per promote/demote serve userId. La risolveremo pescando dal
// browser /api/parties?mine + endpoint specifico — alternativa: il server
// dovrebbe esporre userId nella PlayerSnapshot per i master. Per v2b
// semplifichiamo: assumiamo che id (player id) coincida con la "row id"
// che il server espone all'endpoint promote, oppure usiamo una resolve
// helper. Nel mvp facciamo la chiamata col playerId in body e lasciamo che
// il backend traduca (l'endpoint corrente accetta targetUserId).
//
// Per evitare blocchi: il backend in v2b accetta targetUserId. Se non
// l'abbiamo nel client, recuperiamo i players via endpoint dettaglio.
interface MasterMember {
  playerId: string
  nickname: string
  userId: string
  role: 'user' | 'master'
}
const members = ref<MasterMember[]>([])

async function loadMembers() {
  try {
    const res = await $fetch<{ members: MasterMember[] }>(`/api/parties/${seed}/members`)
    members.value = res.members
  } catch {
    members.value = []
  }
}

loadMembers()

const masterMembers = computed(() => members.value.filter(m => m.role === 'master'))
const userMembers = computed(() => members.value.filter(m => m.role === 'user'))

async function promote(m: MasterMember) {
  if (busy.value) return
  busy.value = true
  try {
    await $fetch(`/api/parties/${seed}/promote`, {
      method: 'POST',
      body: { targetUserId: m.userId }
    })
    feedbackStore.pushToast({ level: 'info', title: `${m.nickname} promosso a master` })
    await loadMembers()
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    busy.value = false
  }
}

async function demote(m: MasterMember) {
  if (busy.value) return
  if (!confirm(`Retrocedere ${m.nickname} a giocatore?`)) return
  busy.value = true
  try {
    await $fetch(`/api/parties/${seed}/demote`, {
      method: 'POST',
      body: { targetUserId: m.userId }
    })
    feedbackStore.pushToast({ level: 'info', title: `${m.nickname} retrocesso` })
    await loadMembers()
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    busy.value = false
  }
}

async function leaveParty() {
  if (leaveBusy.value) return
  if (!confirm('Uscire dalla party? Potrai rientrare se è pubblica o se ricevi un nuovo invito.')) return
  leaveBusy.value = true
  try {
    await $fetch(`/api/parties/${seed}/leave`, { method: 'POST' })
    feedbackStore.pushToast({ level: 'info', title: 'Uscito dalla party' })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gdr:my-parties-changed'))
    }
    await router.push('/')
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    leaveBusy.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <section
      class="rounded-md p-3 space-y-2"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <h4
        class="text-xs uppercase tracking-wide"
        style="color: var(--z-text-md)"
      >
        Master ({{ masterMembers.length || masterCount }})
      </h4>
      <ul class="space-y-1 text-sm">
        <li
          v-for="m in masterMembers"
          :key="m.playerId"
          class="flex items-center justify-between gap-2"
        >
          <span style="color: var(--z-blood-300)">{{ m.nickname }}</span>
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="masterMembers.length <= 1 || busy"
            :title="masterMembers.length <= 1 ? 'Ultimo master, non retrocedibile' : ''"
            @click="demote(m)"
          >
            Retrocedi
          </UButton>
        </li>
        <li
          v-if="!masterMembers.length"
          class="text-xs italic"
          style="color: var(--z-text-lo)"
        >
          Caricamento…
        </li>
      </ul>
    </section>

    <section
      class="rounded-md p-3 space-y-2"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <h4
        class="text-xs uppercase tracking-wide"
        style="color: var(--z-text-md)"
      >
        Giocatori ({{ userMembers.length || users.length }})
      </h4>
      <ul class="space-y-1 text-sm">
        <li
          v-for="m in userMembers"
          :key="m.playerId"
          class="flex items-center justify-between gap-2"
        >
          <span style="color: var(--z-text-hi)">{{ m.nickname }}</span>
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            :disabled="busy"
            @click="promote(m)"
          >
            Promuovi a master
          </UButton>
        </li>
        <li
          v-if="!userMembers.length"
          class="text-xs italic"
          style="color: var(--z-text-lo)"
        >
          Nessun giocatore.
        </li>
      </ul>
    </section>

    <section
      class="rounded-md p-3 space-y-2"
      style="background: var(--z-bg-800); border: 1px solid var(--z-blood-500)"
    >
      <h4
        class="text-xs uppercase tracking-wide"
        style="color: var(--z-blood-300)"
      >
        Esci dalla party
      </h4>
      <p
        class="text-xs"
        style="color: var(--z-text-md)"
      >
        Lasci la party. Se sei l'ultimo master devi prima promuovere
        qualcun altro o archiviare.
      </p>
      <UButton
        color="error"
        variant="soft"
        size="sm"
        :loading="leaveBusy"
        @click="leaveParty"
      >
        Esci
      </UButton>
    </section>
  </div>
</template>
