import { useErrorFeedback } from '~/composables/useErrorFeedback'

// Helper centralizzato per chiamate /api/admin/*. Comportamento default:
// l'errore viene propagato al chiamante (così può fare logica custom su
// codici specifici tipo `last_admin` o `setting_invalid`) ma viene anche
// segnalato a useErrorFeedback per il toast IT. Con `{ silent: true }` il
// chiamante prende il controllo completo del feedback.
//
// Tutte le pagine `/admin/*` (dashboard, users, parties, registrations,
// admins, metrics, settings, audit) usano questo composable. Il layout
// admin chiama invece direttamente `$fetch('/api/system/status')` perché
// quell'endpoint è pubblico, fuori dal namespace admin.

export interface AdminApiOptions {
  silent?: boolean
}

export function useAdminApi() {
  const feedback = useErrorFeedback()

  async function adminGet<T>(
    path: string,
    query?: Record<string, unknown>,
    opts: AdminApiOptions = {}
  ): Promise<T> {
    try {
      return await $fetch<T>(path, { method: 'GET', query })
    } catch (err) {
      if (!opts.silent) feedback.reportFromError(err)
      throw err
    }
  }

  async function adminPost<T>(
    path: string,
    body?: unknown,
    opts: AdminApiOptions = {}
  ): Promise<T> {
    try {
      return await $fetch<T>(path, { method: 'POST', body })
    } catch (err) {
      if (!opts.silent) feedback.reportFromError(err)
      throw err
    }
  }

  async function adminDelete<T>(
    path: string,
    body?: unknown,
    opts: AdminApiOptions = {}
  ): Promise<T> {
    try {
      return await $fetch<T>(path, { method: 'DELETE', body })
    } catch (err) {
      if (!opts.silent) feedback.reportFromError(err)
      throw err
    }
  }

  return { adminGet, adminPost, adminDelete }
}
