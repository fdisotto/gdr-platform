<script setup lang="ts">
import { ref } from 'vue'
import { useSession } from '~/composables/useSession'

const session = useSession()
const loading = ref(false)
const error = ref<string | null>(null)
const createdSeed = ref<string | null>(null)
const createdMasterToken = ref<string | null>(null)

async function create() {
  if (!session.nickname.value) {
    error.value = 'Imposta prima un nickname'
    return
  }
  loading.value = true
  error.value = null
  try {
    const r = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: session.nickname.value }
    }) as { seed: string, masterToken: string, sessionToken: string }
    session.addSession({ seed: r.seed, sessionToken: r.sessionToken, role: 'master', joinedAt: Date.now() })
    session.setMasterToken(r.seed, r.masterToken)
    createdSeed.value = r.seed
    createdMasterToken.value = r.masterToken
  } catch (e) {
    error.value = (e as Error).message || 'Errore sconosciuto'
  } finally {
    loading.value = false
  }
}

async function enter() {
  if (createdSeed.value) await navigateTo(`/party/${createdSeed.value}`)
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="!createdSeed">
      <UButton
        :loading="loading"
        :disabled="!session.nickname.value"
        size="lg"
        color="primary"
        block
        @click="create"
      >
        Crea una nuova party (sarai il master)
      </UButton>
      <p v-if="error" class="text-sm mt-2" style="color: var(--z-blood-300)">
        {{ error }}
      </p>
    </div>
    <div v-else class="space-y-3">
      <p class="text-sm" style="color: var(--z-text-md)">
        Ecco i tuoi codici. <strong style="color: var(--z-blood-300)">Conserva il master token</strong> —
        se lo perdi non potrai più rientrare come master in questa party.
      </p>
      <div class="space-y-2">
        <div>
          <div class="text-xs uppercase" style="color: var(--z-text-md)">Seed (codice per invitare)</div>
          <code class="block font-mono-z text-sm p-2 rounded" style="background: var(--z-bg-800)">{{ createdSeed }}</code>
        </div>
        <div>
          <div class="text-xs uppercase" style="color: var(--z-text-md)">Master token</div>
          <code class="block font-mono-z text-sm p-2 rounded" style="background: var(--z-bg-800); color: var(--z-blood-300)">{{ createdMasterToken }}</code>
        </div>
      </div>
      <UButton size="lg" color="primary" block @click="enter">
        Entra in party
      </UButton>
    </div>
  </div>
</template>
