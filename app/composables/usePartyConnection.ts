/**
 * @deprecated v2b: usa `usePartyConnections().open(seed)` direttamente.
 *
 * Wrapper di compat per i call site legacy: deduce il seed dalla route
 * corrente (`useRoute`) e apre la connection col factory. Espone
 * `connect(opts)` come idempotente e `disconnect()` come close del seed.
 *
 * I componenti che vivono solo dentro `/party/[seed]` continuano a usare
 * `usePartyConnection()` finché il refactor T19 non migra a chiamare
 * direttamente il factory passando il seed dal contesto.
 */
import { ref, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { usePartyConnections, type PartyConnection, type PartyConnectionStatus } from '~/composables/usePartyConnections'

interface ConnectOptions {
  seed: string
}

export interface LegacyPartyConnection {
  ws: Ref<WebSocket | null>
  status: Ref<PartyConnectionStatus>
  pendingQueue: Ref<Record<string, unknown>[]>
  reconnectAt: Ref<number | null>
  reconnectAttempts: Ref<number>
  notMember: Ref<boolean>
  send(event: Record<string, unknown>): void
  retryNow(): void
  connect(opts: ConnectOptions): void
  disconnect(): void
}

function emptyConnection(): LegacyPartyConnection {
  return {
    ws: ref(null),
    status: ref<PartyConnectionStatus>('idle'),
    pendingQueue: ref<Record<string, unknown>[]>([]),
    reconnectAt: ref<number | null>(null),
    reconnectAttempts: ref(0),
    notMember: ref(false),
    send() { /* no-op */ },
    retryNow() { /* no-op */ },
    connect() { /* no-op */ },
    disconnect() { /* no-op */ }
  }
}

function wrap(c: PartyConnection, seed: string, conns: ReturnType<typeof usePartyConnections>): LegacyPartyConnection {
  return {
    ws: c.ws,
    status: c.status,
    pendingQueue: c.pendingQueue,
    reconnectAt: c.reconnectAt,
    reconnectAttempts: c.reconnectAttempts,
    notMember: c.notMember,
    send: c.send,
    retryNow: c.retryNow,
    connect(opts: ConnectOptions) {
      conns.open(opts.seed)
    },
    disconnect() {
      conns.close(seed)
    }
  }
}

export function usePartyConnection(): LegacyPartyConnection {
  const route = useRoute()
  const seedFromRoute = String(route.params.seed ?? '')
  if (!seedFromRoute) return emptyConnection()
  const conns = usePartyConnections()
  return wrap(conns.open(seedFromRoute), seedFromRoute, conns)
}

export { _resetPartyConnectionsForTests as _resetPartyConnectionForTests } from '~/composables/usePartyConnections'
