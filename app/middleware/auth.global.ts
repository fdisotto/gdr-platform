import { useAuthStore } from '~/stores/auth'

// Middleware globale: protegge tutte le route tranne quelle pubbliche.
// Ordine decisioni:
// 1. Se rotta pubblica → passa
// 2. Se identity non ancora caricata → fetchMe
// 3. Rotte /admin/* richiedono superadmin; se mustReset → force change-password
// 4. Altre rotte richiedono user; se mustReset → force reset via /me
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()

  const publicRoutes = new Set(['/', '/login', '/register', '/admin/login'])
  if (publicRoutes.has(to.path)) return

  if (!auth.loaded) {
    await auth.fetchMe()
  }

  if (to.path.startsWith('/admin')) {
    if (!auth.isSuperadmin) return navigateTo('/admin/login')
    if (auth.identity?.mustReset && to.path !== '/admin/change-password') {
      return navigateTo('/admin/change-password')
    }
    return
  }

  if (!auth.isUser) return navigateTo('/login')
  if (auth.identity?.mustReset && to.path !== '/me') {
    return navigateTo('/me?force-reset=1')
  }
})
