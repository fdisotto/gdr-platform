import { useAuthStore } from '~/stores/auth'

// Wrapper attorno agli endpoint /api/auth/* e /api/admin/*:
// non nasconde gli errori — li lascia propagare al chiamante che li
// mappa in toast via useErrorFeedback. Aggiorna lo store dopo ogni
// azione che cambia l'identità lato server.
export function useAuth() {
  const store = useAuthStore()

  async function register(username: string, password: string): Promise<void> {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: { username, password }
    })
  }

  async function login(username: string, password: string): Promise<{ mustReset: boolean }> {
    const res = await $fetch<{ mustReset: boolean }>('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    })
    await store.fetchMe()
    return res
  }

  async function adminLogin(username: string, password: string): Promise<{ mustReset: boolean }> {
    const res = await $fetch<{ mustReset: boolean }>('/api/admin/login', {
      method: 'POST',
      body: { username, password }
    })
    await store.fetchMe()
    return res
  }

  async function logout(): Promise<void> {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    } catch { /* idempotente */ }
    store.reset()
  }

  async function adminLogout(): Promise<void> {
    try {
      await $fetch('/api/admin/logout', { method: 'POST' })
    } catch { /* idempotente */ }
    store.reset()
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await $fetch('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword }
    })
    await store.fetchMe()
  }

  async function adminChangePassword(currentPassword: string, newPassword: string): Promise<void> {
    await $fetch('/api/admin/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword }
    })
    await store.fetchMe()
  }

  return {
    register, login, adminLogin, logout, adminLogout,
    changePassword, adminChangePassword,
    store
  }
}
