import { useAuthStore } from '~/stores/auth'

// Middleware globale: se la piattaforma è in manutenzione, redirige tutti
// gli utenti non-superadmin verso /maintenance. Ordine alfabetico Nuxt:
// auth.global.ts < maintenance.global.ts → l'identity è già caricata quando
// questo middleware esegue.
//
// Path saltati: tutta la sezione admin, login generale, e la stessa pagina
// di manutenzione (per evitare loop di redirect).
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/admin')) return
  if (to.path === '/login') return
  if (to.path === '/maintenance') return

  let maintenanceMode = false
  try {
    const res = await $fetch<{ maintenanceMode: boolean }>('/api/system/status')
    maintenanceMode = res.maintenanceMode
  } catch {
    // Se status non risponde, lasciamo passare: meglio un eventuale 503
    // contestuale che bloccare il client su una falsa positiva.
    return
  }

  if (!maintenanceMode) return

  const auth = useAuthStore()
  if (auth.identity?.kind === 'superadmin') return

  return navigateTo('/maintenance', { replace: true })
})
