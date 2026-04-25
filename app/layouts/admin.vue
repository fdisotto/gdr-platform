<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'
import { useAuthStore } from '~/stores/auth'

interface NavItem {
  label: string
  to: string
  match: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const authStore = useAuthStore()

const NAV: NavItem[] = [
  { label: 'Dashboard', to: '/admin/dashboard', match: '/admin/dashboard' },
  { label: 'Utenti', to: '/admin/users', match: '/admin/users' },
  { label: 'Party', to: '/admin/parties', match: '/admin/parties' },
  { label: 'Registrazioni', to: '/admin/registrations', match: '/admin/registrations' },
  { label: 'Admin', to: '/admin/admins', match: '/admin/admins' },
  { label: 'Metriche', to: '/admin/metrics', match: '/admin/metrics' },
  { label: 'Impostazioni', to: '/admin/settings', match: '/admin/settings' },
  { label: 'Audit', to: '/admin/audit', match: '/admin/audit' }
]

const maintenanceMode = ref(false)

async function loadStatus() {
  try {
    const res = await $fetch<{ maintenanceMode: boolean }>('/api/system/status')
    maintenanceMode.value = res.maintenanceMode
  } catch {
    maintenanceMode.value = false
  }
}

onMounted(loadStatus)

function isActive(item: NavItem): boolean {
  return route.path === item.match || route.path.startsWith(item.match + '/')
}

const username = computed(() => authStore.identity?.username ?? '')

async function onLogout() {
  await auth.adminLogout()
  await router.push('/admin/login')
}
</script>

<template>
  <div
    class="flex h-screen overflow-hidden"
    style="background: var(--z-bg-900)"
  >
    <aside
      class="w-48 shrink-0 flex flex-col"
      style="background: var(--z-bg-800); border-right: 1px solid var(--z-border)"
    >
      <div
        class="px-3 py-3"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <h2
          class="text-xs uppercase tracking-wide font-semibold"
          style="color: var(--z-blood-300)"
        >
          Admin
        </h2>
        <p
          v-if="username"
          class="text-xs font-mono-z mt-1 truncate"
          style="color: var(--z-text-md)"
        >
          {{ username }}
        </p>
      </div>

      <nav class="flex-1 overflow-y-auto p-2 space-y-0.5">
        <NuxtLink
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          class="block px-3 py-2 rounded text-sm"
          :style="isActive(item)
            ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
            : 'background: transparent; color: var(--z-text-md)'"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div
        class="p-2 space-y-2"
        style="border-top: 1px solid var(--z-border)"
      >
        <div
          v-if="maintenanceMode"
          class="text-xs px-2 py-1.5 rounded text-center"
          style="background: var(--z-rust-700); color: var(--z-rust-300)"
        >
          Manutenzione attiva
        </div>
        <UButton
          size="xs"
          variant="soft"
          color="error"
          block
          @click="onLogout"
        >
          Logout
        </UButton>
      </div>
    </aside>

    <main class="flex-1 min-w-0 overflow-y-auto">
      <slot />
    </main>
  </div>
</template>
