import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MeResponse } from '~~/shared/protocol/http'

export const useAuthStore = defineStore('auth', () => {
  const identity = ref<MeResponse | null>(null)
  const loading = ref(false)
  // loaded: true dopo il primo fetchMe, anche se identity resta null.
  // Serve al middleware global per evitare redirect su stato ancora indefinito.
  const loaded = ref(false)

  const isAuthenticated = computed(() => identity.value !== null)
  const isUser = computed(() => identity.value?.kind === 'user')
  const isSuperadmin = computed(() => identity.value?.kind === 'superadmin')

  async function fetchMe() {
    loading.value = true
    try {
      const me = await $fetch<MeResponse>('/api/auth/me')
      identity.value = me
    } catch {
      identity.value = null
    } finally {
      loading.value = false
      loaded.value = true
    }
  }

  function setIdentity(me: MeResponse | null) {
    identity.value = me
    loaded.value = true
  }

  function reset() {
    identity.value = null
    loaded.value = false
  }

  return {
    identity, loading, loaded,
    isAuthenticated, isUser, isSuperadmin,
    fetchMe, setIdentity, reset
  }
})
