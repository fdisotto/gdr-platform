<script setup lang="ts">
import { ref } from 'vue'
import { useSession } from '~/composables/useSession'

const session = useSession()
const seedInput = ref('')
const masterTokenInput = ref('')
const role = ref<'user' | 'master'>('user')
const loading = ref(false)
const error = ref<string | null>(null)

async function join() {
  if (!session.nickname.value) {
    error.value = 'Imposta prima un nickname'
    return
  }
  const seed = seedInput.value.trim()
  if (!seed) {
    error.value = 'Inserisci un seed'
    return
  }
  loading.value = true
  error.value = null
  try {
    if (role.value === 'user') {
      const r = await $fetch(`/api/parties/${seed}/join`, {
        method: 'POST',
        body: { nickname: session.nickname.value }
      }) as { sessionToken: string }
      session.addSession({ seed, sessionToken: r.sessionToken, role: 'user', joinedAt: Date.now() })
    } else {
      const r = await $fetch(`/api/parties/${seed}/reclaim-master`, {
        method: 'POST',
        body: { masterToken: masterTokenInput.value }
      }) as { sessionToken: string }
      session.addSession({ seed, sessionToken: r.sessionToken, role: 'master', joinedAt: Date.now() })
      session.setMasterToken(seed, masterTokenInput.value)
    }
    await navigateTo(`/party/${seed}`)
  } catch (e) {
    error.value = (e as Error).message || 'Errore sconosciuto'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="join">
    <div class="flex gap-2">
      <UButton
        size="sm"
        :color="role === 'user' ? 'primary' : 'neutral'"
        :variant="role === 'user' ? 'solid' : 'outline'"
        @click="role = 'user'"
      >
        Come giocatore
      </UButton>
      <UButton
        size="sm"
        :color="role === 'master' ? 'primary' : 'neutral'"
        :variant="role === 'master' ? 'solid' : 'outline'"
        @click="role = 'master'"
      >
        Come master
      </UButton>
    </div>
    <UInput v-model="seedInput" placeholder="Seed della party" size="lg" class="font-mono-z" />
    <UInput
      v-if="role === 'master'"
      v-model="masterTokenInput"
      placeholder="Master token"
      size="lg"
      class="font-mono-z"
    />
    <UButton
      :loading="loading"
      :disabled="!session.nickname.value"
      type="submit"
      size="lg"
      color="primary"
      block
    >
      Unisciti
    </UButton>
    <p v-if="error" class="text-sm" style="color: var(--z-blood-300)">{{ error }}</p>
  </form>
</template>
