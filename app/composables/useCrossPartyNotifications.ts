/**
 * v2b: notifiche cross-party.
 *
 * In multi-party l'utente può essere connesso a più WS contemporaneamente.
 * Per ogni messaggio ricevuto su una connection che NON corrisponde alla
 * party "in primo piano" (rotta corrente `/party/<seed>`), incrementiamo
 * un contatore di unread per la tab e — se è un messaggio diretto al
 * giocatore (dm o whisper a me) — emettiamo un toast con click handler che
 * naviga alla party + suono di notifica.
 *
 * Singleton modulo-level: tutte le connection scrivono qui via
 * `bumpUnread`/`bumpDirect`, la tab bar legge via `unreadFor`/`directFor`,
 * la party page chiama `clear(seed)` quando entra in foreground.
 */
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFeedbackStore } from '~/stores/feedback'
import { useSettingsStore } from '~/stores/settings'
import { playNotificationSound } from '~/composables/useNotificationSound'

// Stato modulo-level: due Map reattivi via Ref-of-record, semplice e
// abbastanza leggero per ≤5 party simultanee.
const unread = ref<Record<string, number>>({})
const directs = ref<Record<string, number>>({})
const cityNames = ref<Record<string, string>>({})
let routeWatcherAttached = false

function clearImpl(seed: string) {
  if (unread.value[seed] || directs.value[seed]) {
    const u: Record<string, number> = {}
    const d: Record<string, number> = {}
    for (const [k, v] of Object.entries(unread.value)) {
      if (k !== seed) u[k] = v
    }
    for (const [k, v] of Object.entries(directs.value)) {
      if (k !== seed) d[k] = v
    }
    unread.value = u
    directs.value = d
  }
}

function _foregroundSeed(): string | null {
  if (typeof window === 'undefined') return null
  // useRoute è disponibile solo dentro setup; ma questo composable è
  // sempre invocato in contesto componente. Per gli eventi WS (chiamate
  // da fuori setup), useRoute() lancerebbe — usiamo invece location.
  const m = window.location.pathname.match(/^\/party\/([^/]+)/)
  return m ? m[1]! : null
}

export interface CrossPartyNotifications {
  bumpUnread(seed: string, cityName?: string): void
  bumpDirect(seed: string, cityName?: string, fromName?: string): void
  clear(seed: string): void
  unreadFor(seed: string): number
  directFor(seed: string): number
  setCityName(seed: string, cityName: string): void
}

export function useCrossPartyNotifications(): CrossPartyNotifications {
  const feedback = useFeedbackStore()
  const settings = useSettingsStore()
  // useRouter/useRoute possono essere undefined se chiamati fuori da
  // contesto router (test isolati). In quel caso skippiamo il watcher e
  // navigiamo via window.location come fallback.
  let router: ReturnType<typeof useRouter> | undefined
  let route: ReturnType<typeof useRoute> | undefined
  try {
    router = useRouter()
    route = useRoute()
  } catch { /* fuori da setup con router: ignoriamo */ }

  if (route && !routeWatcherAttached) {
    routeWatcherAttached = true
    watch(
      () => route!.params.seed,
      (s) => {
        if (typeof s === 'string' && s) clearImpl(s)
      },
      { immediate: true }
    )
  }

  function setCityName(seed: string, cityName: string) {
    if (cityName) cityNames.value = { ...cityNames.value, [seed]: cityName }
  }

  function bumpUnread(seed: string, cityName?: string) {
    if (cityName) setCityName(seed, cityName)
    if (!settings.notificationsChatAll) return
    const fg = _foregroundSeed()
    if (fg === seed) return
    unread.value = { ...unread.value, [seed]: (unread.value[seed] ?? 0) + 1 }
    playNotificationSound('msg')
  }

  function bumpDirect(seed: string, cityName?: string, fromName?: string) {
    if (cityName) setCityName(seed, cityName)
    const fg = _foregroundSeed()
    // I dm/whisper diretti li notifichiamo sempre (a meno che siano
    // sulla party in primo piano, che li gestisce in chat).
    if (fg === seed) return
    directs.value = { ...directs.value, [seed]: (directs.value[seed] ?? 0) + 1 }
    if (settings.notificationsEnabled) playNotificationSound('dm')
    const cn = cityNames.value[seed] ?? cityName ?? 'Party'
    feedback.pushToast({
      level: 'info',
      title: fromName ? `Missiva da ${fromName}` : 'Nuova missiva',
      detail: cn,
      ttlMs: 6000,
      onClick: () => {
        if (router) {
          router.push(`/party/${seed}`).catch(() => { /* noop */ })
        } else if (typeof window !== 'undefined') {
          window.location.href = `/party/${seed}`
        }
      }
    })
  }

  function clear(seed: string) {
    clearImpl(seed)
  }

  function unreadFor(seed: string): number {
    return unread.value[seed] ?? 0
  }
  function directFor(seed: string): number {
    return directs.value[seed] ?? 0
  }

  return { bumpUnread, bumpDirect, clear, unreadFor, directFor, setCityName }
}

// Helper per i test: azzera tutto lo stato modulo-level.
export function _resetCrossPartyNotificationsForTests() {
  unread.value = {}
  directs.value = {}
  cityNames.value = {}
  routeWatcherAttached = false
}
