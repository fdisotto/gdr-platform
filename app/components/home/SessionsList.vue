<script setup lang="ts">
import { computed } from 'vue'
import { useSession } from '~/composables/useSession'

const session = useSession()
const sessions = computed(() => session.listSessions().sort((a, b) => b.joinedAt - a.joinedAt))

async function resume(seed: string) {
  try {
    const s = session.getSession(seed)
    if (!s) return
    await $fetch(`/api/parties/${seed}/resume`, {
      method: 'POST',
      body: { sessionToken: s.sessionToken }
    })
    await navigateTo(`/party/${seed}`)
  } catch {
    session.removeSession(seed)
  }
}

function forget(seed: string) {
  session.removeSession(seed)
  session.removeMasterToken(seed)
}
</script>

<template>
  <div
    v-if="sessions.length"
    class="space-y-3"
  >
    <h2
      class="text-sm uppercase tracking-wide"
      style="color: var(--z-text-md)"
    >
      Riprendi una partita
    </h2>
    <ul class="space-y-2">
      <li
        v-for="s in sessions"
        :key="s.seed"
        class="flex items-center justify-between gap-3 px-4 py-3 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <div class="flex-1 min-w-0">
          <div
            class="text-xs font-mono-z truncate"
            style="color: var(--z-text-md)"
          >
            {{ s.seed }}
          </div>
          <div
            class="text-sm"
            style="color: var(--z-text-hi)"
          >
            Ruolo: <span style="color: var(--z-green-300)">{{ s.role }}</span>
          </div>
        </div>
        <UButton
          size="sm"
          color="primary"
          variant="solid"
          @click="resume(s.seed)"
        >
          Riprendi
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          @click="forget(s.seed)"
        >
          Dimentica
        </UButton>
      </li>
    </ul>
  </div>
</template>
