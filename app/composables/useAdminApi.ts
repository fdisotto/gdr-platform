import type { FetchOptions } from 'ofetch'
import { useErrorFeedback } from '~/composables/useErrorFeedback'

// Helper centralizzato per chiamate /api/admin/*. Mantiene il comportamento
// "errore propagato al chiamante con report toast" già usato altrove. Il
// chiamante può catturare l'errore per logica custom; di default chiama
// reportFromError dietro le quinte se passa l'opzione { silent: false }.

export interface AdminApiOptions {
  // Se true, NON riporta automaticamente l'errore al toast (utile quando il
  // chiamante vuole gestire un caso specifico, es. last_admin → modal custom).
  silent?: boolean
}

function buildOptions(extra?: FetchOptions): FetchOptions | undefined {
  return extra
}

export function useAdminApi() {
  const feedback = useErrorFeedback()

  async function adminGet<T>(
    path: string,
    query?: Record<string, unknown>,
    opts: AdminApiOptions = {}
  ): Promise<T> {
    try {
      return await $fetch<T>(path, buildOptions({ method: 'GET', query }))
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
      return await $fetch<T>(path, buildOptions({ method: 'POST', body }))
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
      return await $fetch<T>(path, buildOptions({ method: 'DELETE', body }))
    } catch (err) {
      if (!opts.silent) feedback.reportFromError(err)
      throw err
    }
  }

  return { adminGet, adminPost, adminDelete }
}
