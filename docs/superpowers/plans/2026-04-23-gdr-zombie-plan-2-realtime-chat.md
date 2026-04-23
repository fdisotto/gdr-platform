# GDR Zombie — Plan 2: Realtime e chat minimale

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans per eseguire questo plan task-by-task. Checkbox `- [ ]` per tracciare.

**Goal:** Portare il progetto a "giocabile in chat": WebSocket server Nitro con registry connessioni, rate limit, fan-out per area; persistenza messaggi; stores Pinia (session, party, chat); composables (`useSession`, `useServerTime`, `usePartyConnection`); home page con nickname/create/join/resume; pagina party con header, singola area, chat testuale per i kind `say`/`emote`/`ooc`; un master + un player possono chattare in tempo reale.

**Architettura:** Il Plan 1 ha lasciato il server con endpoint HTTP funzionanti. Plan 2 aggiunge il layer realtime. Il client passa da placeholder a vera app con routing dinamico e stato Pinia. Niente mappa SVG ancora (Plan 3), niente DM/whisper/roll/shout (Plan 4), niente poteri master (Plan 5). Una sola area visibile: quella del giocatore (default `piazza` per tutti i nuovi player).

**Tech stack:** Nuxt 4 + Nitro WebSocket (`defineWebSocketHandler`) + Pinia + Nuxt UI 4. Tutti i messaggi JSON validati con Zod. Rate limit in-memory (`Map<string, number[]>`), connection registry in-memory (`Map<partySeed, Set<WSRecord>>`).

**Riferimenti:**
- Spec: `docs/superpowers/specs/2026-04-23-gdr-zombie-mvp-design.md`
- CLAUDE.md: direttive git + scope
- Plan 1 risultato: 108 test, 4 endpoint HTTP, shared logic completa, schema DB pronto

**Convenzioni:**
- 1 commit per task. Subject italiano, imperativo, minuscolo, ≤72 char. Zero trailer AI.
- Prima di commit: `pnpm lint && pnpm typecheck && pnpm vitest run <file>` verde.
- Integration test: usa **sempre** il pattern `build: false + nuxtConfig.nitro.output.dir` (come già fatto in `tests/integration/api/parties-create.test.ts`) per evitare MagicString error durante rebuild.
- Pre-condizione: `pnpm build` deve aver prodotto `.output/` valido prima di lanciare integration test con `build: false`.

---

## Task 1 — Servizio messages

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/services/messages.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/integration/services/messages.test.ts`

- [ ] **Step 1: Test**

Create `tests/integration/services/messages.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { joinParty } from '~~/server/services/players'
import {
  insertMessage, listAreaMessages, softDeleteMessage, editMessage
} from '~~/server/services/messages'

let db: Db
let seed: string
let masterId: string

beforeEach(async () => {
  db = createTestDb()
  const r = await createParty(db, { masterNickname: 'M' })
  seed = r.seed
  masterId = r.masterPlayer.id
})

describe('messages service', () => {
  it('insertMessage persiste e ritorna row completa', () => {
    const msg = insertMessage(db, {
      partySeed: seed,
      kind: 'say',
      authorPlayerId: masterId,
      authorDisplay: 'M',
      areaId: 'piazza',
      body: 'ciao'
    })
    expect(msg.id).toBeTruthy()
    expect(msg.createdAt).toBeGreaterThan(0)
    expect(msg.body).toBe('ciao')
  })

  it('listAreaMessages ritorna in ordine cronologico', () => {
    insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: 'uno' })
    insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: 'due' })
    const rows = listAreaMessages(db, seed, 'piazza', 10)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.body).toBe('uno')
    expect(rows[1]!.body).toBe('due')
  })

  it('listAreaMessages limita', () => {
    for (let i = 0; i < 5; i++) {
      insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: `m${i}` })
    }
    const rows = listAreaMessages(db, seed, 'piazza', 3)
    expect(rows).toHaveLength(3)
  })

  it('listAreaMessages esclude aree diverse', () => {
    insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: 'qui' })
    insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'fogne', body: 'altrove' })
    const rows = listAreaMessages(db, seed, 'piazza', 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.body).toBe('qui')
  })

  it('softDeleteMessage marca deletedAt e deletedBy', () => {
    const msg = insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: 'x' })
    softDeleteMessage(db, msg.id, masterId)
    const rows = listAreaMessages(db, seed, 'piazza', 10)
    expect(rows[0]!.deletedAt).not.toBeNull()
    expect(rows[0]!.deletedBy).toBe(masterId)
  })

  it('editMessage aggiorna body e editedAt', () => {
    const msg = insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: 'old' })
    editMessage(db, msg.id, 'new')
    const rows = listAreaMessages(db, seed, 'piazza', 10)
    expect(rows[0]!.body).toBe('new')
    expect(rows[0]!.editedAt).not.toBeNull()
  })

  it('insertMessage con kind=dm usa targetPlayerId e areaId null', () => {
    const other = joinParty(db, seed, 'Anna')
    const msg = insertMessage(db, {
      partySeed: seed, kind: 'dm', authorPlayerId: masterId, authorDisplay: 'M',
      areaId: null, targetPlayerId: other.id, body: 'ciao anna'
    })
    expect(msg.areaId).toBeNull()
    expect(msg.targetPlayerId).toBe(other.id)
  })
})
```

- [ ] **Step 2: Run — must FAIL**

`pnpm vitest run tests/integration/services/messages.test.ts`

- [ ] **Step 3: Implement** — create `server/services/messages.ts`:

```ts
import { and, asc, desc, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { messages } from '~~/server/db/schema'
import { generateUuid } from '~~/server/utils/crypto'

export interface MessageRow {
  id: string
  partySeed: string
  kind: string
  authorPlayerId: string | null
  authorDisplay: string
  areaId: string | null
  targetPlayerId: string | null
  body: string
  rollPayload: string | null
  createdAt: number
  deletedAt: number | null
  deletedBy: string | null
  editedAt: number | null
}

export interface InsertMessageInput {
  partySeed: string
  kind: string
  authorPlayerId?: string | null
  authorDisplay: string
  areaId?: string | null
  targetPlayerId?: string | null
  body: string
  rollPayload?: string | null
}

export function insertMessage(db: Db, input: InsertMessageInput): MessageRow {
  const id = generateUuid()
  const now = Date.now()
  const row = {
    id,
    partySeed: input.partySeed,
    kind: input.kind,
    authorPlayerId: input.authorPlayerId ?? null,
    authorDisplay: input.authorDisplay,
    areaId: input.areaId ?? null,
    targetPlayerId: input.targetPlayerId ?? null,
    body: input.body,
    rollPayload: input.rollPayload ?? null,
    createdAt: now,
    deletedAt: null,
    deletedBy: null,
    editedAt: null
  }
  db.insert(messages).values(row).run()
  return row
}

export function listAreaMessages(db: Db, seed: string, areaId: string, limit: number): MessageRow[] {
  const rows = db.select().from(messages)
    .where(and(eq(messages.partySeed, seed), eq(messages.areaId, areaId)))
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .all() as MessageRow[]
  return rows.reverse()
}

export function listMessagesSince(db: Db, seed: string, areaId: string, sinceMs: number): MessageRow[] {
  return db.select().from(messages)
    .where(and(eq(messages.partySeed, seed), eq(messages.areaId, areaId)))
    .orderBy(asc(messages.createdAt))
    .all()
    .filter((m: MessageRow) => m.createdAt > sinceMs) as MessageRow[]
}

export function softDeleteMessage(db: Db, messageId: string, byPlayerId: string): void {
  db.update(messages)
    .set({ deletedAt: Date.now(), deletedBy: byPlayerId })
    .where(eq(messages.id, messageId))
    .run()
}

export function editMessage(db: Db, messageId: string, newBody: string): void {
  db.update(messages)
    .set({ body: newBody, editedAt: Date.now() })
    .where(eq(messages.id, messageId))
    .run()
}

export function findMessage(db: Db, messageId: string): MessageRow | null {
  const rows = db.select().from(messages).where(eq(messages.id, messageId)).all()
  return (rows[0] as MessageRow | undefined) ?? null
}
```

- [ ] **Step 4: Run — 7 passed.**

- [ ] **Step 5: Typecheck — 0 errors.**

- [ ] **Step 6: Commit**

```bash
git add server/services/messages.ts tests/integration/services/messages.test.ts
git commit -m "feat: servizio messages con insert/list/soft-delete/edit"
```

---

## Task 2 — Estensione protocollo WS (chat + message events)

**Files:**
- Modify: `/Users/mashfrog/Work/gdr-zombie/shared/protocol/ws.ts`
- Modify: `/Users/mashfrog/Work/gdr-zombie/tests/unit/protocol/ws.test.ts`

Aggiunta schemi Zod per:
- `ChatSendEvent` (client→server): kind + body + areaId opzionale
- `MessageNewEvent` (server→client): snapshot messaggio completo
- `TimeTickEvent` (server→client): serverTime
- `StateInitEvent` (server→client): snapshot minimo (me, party, players, areasState, messagesByArea, serverTime). Per Plan 2 basta un sottoinsieme.

- [ ] **Step 1: Estendi test** — aggiungi in `tests/unit/protocol/ws.test.ts` (dopo i test esistenti):

```ts
import { ChatSendEvent, MessageNewEvent, TimeTickEvent, StateInitEvent } from '~~/shared/protocol/ws'

describe('ChatSendEvent', () => {
  it('accetta say con body', () => {
    expect(ChatSendEvent.safeParse({
      type: 'chat:send', kind: 'say', body: 'ciao', areaId: 'piazza'
    }).success).toBe(true)
  })
  it('rifiuta body vuoto', () => {
    expect(ChatSendEvent.safeParse({
      type: 'chat:send', kind: 'say', body: '', areaId: 'piazza'
    }).success).toBe(false)
  })
  it('rifiuta body oltre 2000 char', () => {
    expect(ChatSendEvent.safeParse({
      type: 'chat:send', kind: 'say', body: 'x'.repeat(2001), areaId: 'piazza'
    }).success).toBe(false)
  })
  it('rifiuta kind non tra say/emote/ooc/whisper/shout/roll/dm', () => {
    expect(ChatSendEvent.safeParse({
      type: 'chat:send', kind: 'system', body: 'x', areaId: 'piazza'
    }).success).toBe(false)
  })
})

describe('MessageNewEvent', () => {
  it('accetta shape corretta', () => {
    expect(MessageNewEvent.safeParse({
      type: 'message:new',
      message: {
        id: 'x', partySeed: 'p', kind: 'say',
        authorPlayerId: 'a', authorDisplay: 'A',
        areaId: 'piazza', targetPlayerId: null, body: 'ciao',
        rollPayload: null, createdAt: 1, deletedAt: null,
        deletedBy: null, editedAt: null
      }
    }).success).toBe(true)
  })
})

describe('TimeTickEvent', () => {
  it('accetta serverTime', () => {
    expect(TimeTickEvent.safeParse({ type: 'time:tick', serverTime: 12345 }).success).toBe(true)
  })
})

describe('StateInitEvent', () => {
  it('accetta snapshot base', () => {
    expect(StateInitEvent.safeParse({
      type: 'state:init',
      me: { id: 'a', nickname: 'A', role: 'user', currentAreaId: 'piazza' },
      party: { seed: 'uuid', cityName: 'City', createdAt: 1, lastActivityAt: 1 },
      players: [],
      areasState: [],
      messagesByArea: {},
      serverTime: 1
    }).success).toBe(true)
  })
})
```

- [ ] **Step 2: Run — must FAIL (imports mancano)**

- [ ] **Step 3: Estendi** `shared/protocol/ws.ts` — aggiungi in fondo al file:

```ts
const ChatKind = z.enum(['say', 'whisper', 'emote', 'ooc', 'shout', 'roll', 'dm'])

export const ChatSendEvent = z.object({
  type: z.literal('chat:send'),
  kind: ChatKind,
  body: z.string().min(1).max(2000),
  areaId: z.string().optional().nullable(),
  targetPlayerId: z.string().optional().nullable(),
  rollExpr: z.string().optional()
})
export type ChatSendEvent = z.infer<typeof ChatSendEvent>

export const MessageRowSchema = z.object({
  id: z.string(),
  partySeed: z.string(),
  kind: z.string(),
  authorPlayerId: z.string().nullable(),
  authorDisplay: z.string(),
  areaId: z.string().nullable(),
  targetPlayerId: z.string().nullable(),
  body: z.string(),
  rollPayload: z.string().nullable(),
  createdAt: z.number(),
  deletedAt: z.number().nullable(),
  deletedBy: z.string().nullable(),
  editedAt: z.number().nullable()
})
export type MessageRow = z.infer<typeof MessageRowSchema>

export const MessageNewEvent = z.object({
  type: z.literal('message:new'),
  message: MessageRowSchema
})
export type MessageNewEvent = z.infer<typeof MessageNewEvent>

export const TimeTickEvent = z.object({
  type: z.literal('time:tick'),
  serverTime: z.number()
})
export type TimeTickEvent = z.infer<typeof TimeTickEvent>

const PlayerSnapshot = z.object({
  id: z.string(),
  nickname: z.string(),
  role: z.enum(['user', 'master']),
  currentAreaId: z.string()
})

const PartySnapshot = z.object({
  seed: z.string(),
  cityName: z.string(),
  createdAt: z.number(),
  lastActivityAt: z.number()
})

const AreaStateSnapshot = z.object({
  partySeed: z.string(),
  areaId: z.string(),
  status: z.enum(['intact', 'infested', 'ruined', 'closed']),
  customName: z.string().nullable(),
  notes: z.string().nullable()
})

export const StateInitEvent = z.object({
  type: z.literal('state:init'),
  me: PlayerSnapshot,
  party: PartySnapshot,
  players: z.array(PlayerSnapshot),
  areasState: z.array(AreaStateSnapshot),
  messagesByArea: z.record(z.string(), z.array(MessageRowSchema)),
  serverTime: z.number()
})
export type StateInitEvent = z.infer<typeof StateInitEvent>

// Discriminated unions per routing client-side
export const ServerEvent = z.discriminatedUnion('type', [
  StateInitEvent, MessageNewEvent, TimeTickEvent, ServerErrorEvent
])
export type ServerEvent = z.infer<typeof ServerEvent>

export const ClientEvent = z.discriminatedUnion('type', [
  HelloEvent, ChatSendEvent
])
export type ClientEvent = z.infer<typeof ClientEvent>
```

- [ ] **Step 4: Run — deve passare (tutti i nuovi test)**

- [ ] **Step 5: Typecheck — 0 errors.**

- [ ] **Step 6: Commit**

```bash
git add shared/protocol/ws.ts tests/unit/protocol/ws.test.ts
git commit -m "feat: estendi schemi zod ws per chat e state init"
```

---

## Task 3 — Rate limiter in-memory

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/ws/rate-limit.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/server/rate-limit.test.ts`

- [ ] **Step 1: Test** — `tests/unit/server/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createRateLimiter } from '~~/server/ws/rate-limit'

describe('rate limiter', () => {
  let limiter: ReturnType<typeof createRateLimiter>
  beforeEach(() => {
    limiter = createRateLimiter({ windowMs: 1000, maxHits: 3 })
  })

  it('consente le prime N hits', () => {
    const now = 1000
    expect(limiter.tryHit('k', now)).toBe(true)
    expect(limiter.tryHit('k', now + 10)).toBe(true)
    expect(limiter.tryHit('k', now + 20)).toBe(true)
  })

  it('blocca dopo N', () => {
    const now = 1000
    limiter.tryHit('k', now)
    limiter.tryHit('k', now + 10)
    limiter.tryHit('k', now + 20)
    expect(limiter.tryHit('k', now + 30)).toBe(false)
  })

  it('libera dopo la finestra', () => {
    const now = 1000
    for (let i = 0; i < 3; i++) limiter.tryHit('k', now + i)
    expect(limiter.tryHit('k', now + 1200)).toBe(true)
  })

  it('chiavi diverse sono indipendenti', () => {
    const now = 1000
    for (let i = 0; i < 3; i++) limiter.tryHit('a', now)
    expect(limiter.tryHit('a', now)).toBe(false)
    expect(limiter.tryHit('b', now)).toBe(true)
  })

  it('clear azzera la chiave', () => {
    const now = 1000
    for (let i = 0; i < 3; i++) limiter.tryHit('k', now)
    limiter.clear('k')
    expect(limiter.tryHit('k', now)).toBe(true)
  })
})
```

- [ ] **Step 2: Run — must FAIL**

- [ ] **Step 3: Implement** — `server/ws/rate-limit.ts`:

```ts
export interface RateLimiter {
  tryHit(key: string, now?: number): boolean
  clear(key: string): void
}

export function createRateLimiter(opts: { windowMs: number, maxHits: number }): RateLimiter {
  const store = new Map<string, number[]>()

  function prune(timestamps: number[], now: number): number[] {
    const cutoff = now - opts.windowMs
    return timestamps.filter(t => t > cutoff)
  }

  return {
    tryHit(key, now = Date.now()) {
      const existing = store.get(key) ?? []
      const pruned = prune(existing, now)
      if (pruned.length >= opts.maxHits) {
        store.set(key, pruned)
        return false
      }
      pruned.push(now)
      store.set(key, pruned)
      return true
    },
    clear(key) {
      store.delete(key)
    }
  }
}
```

- [ ] **Step 4: Run — 5 passed.**

- [ ] **Step 5: Typecheck — 0 errors.**

- [ ] **Step 6: Commit**

```bash
git add server/ws/rate-limit.ts tests/unit/server/rate-limit.test.ts
git commit -m "feat: rate limiter in-memory rolling window"
```

---

## Task 4 — Registry connessioni WebSocket

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/ws/connections.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/server/connections.test.ts`

- [ ] **Step 1: Test** — `tests/unit/server/connections.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createConnectionRegistry, type WsLike } from '~~/server/ws/connections'

function mockWs(): WsLike & { sent: unknown[] } {
  const sent: unknown[] = []
  return {
    send(data: string) { sent.push(data) },
    close() {},
    sent
  } as WsLike & { sent: unknown[] }
}

let registry: ReturnType<typeof createConnectionRegistry>

beforeEach(() => {
  registry = createConnectionRegistry()
})

describe('connection registry', () => {
  it('register + lookup by party + player', () => {
    const ws = mockWs()
    registry.register(ws, { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    expect(registry.getPlayerConn('p1', 'alice')?.ws).toBe(ws)
  })

  it('register sostituisce connessione precedente stesso player', () => {
    const a = mockWs()
    const b = mockWs()
    registry.register(a, { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    registry.register(b, { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    expect(registry.getPlayerConn('p1', 'alice')?.ws).toBe(b)
  })

  it('listParty ritorna tutte le connessioni della party', () => {
    registry.register(mockWs(), { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    registry.register(mockWs(), { partySeed: 'p1', playerId: 'bob', areaId: 'fogne' })
    registry.register(mockWs(), { partySeed: 'p2', playerId: 'carla', areaId: 'piazza' })
    expect(registry.listParty('p1').map(c => c.playerId).sort()).toEqual(['alice', 'bob'])
  })

  it('updateArea cambia areaId', () => {
    const ws = mockWs()
    registry.register(ws, { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    registry.updateArea('p1', 'alice', 'fogne')
    expect(registry.getPlayerConn('p1', 'alice')?.areaId).toBe('fogne')
  })

  it('unregister rimuove la connessione', () => {
    const ws = mockWs()
    registry.register(ws, { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    registry.unregister(ws)
    expect(registry.getPlayerConn('p1', 'alice')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — must FAIL**

- [ ] **Step 3: Implement** — `server/ws/connections.ts`:

```ts
export interface WsLike {
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface ConnectionInfo {
  ws: WsLike
  partySeed: string
  playerId: string
  areaId: string
}

export interface ConnectionRegistry {
  register(ws: WsLike, info: Omit<ConnectionInfo, 'ws'>): void
  unregister(ws: WsLike): ConnectionInfo | undefined
  getPlayerConn(partySeed: string, playerId: string): ConnectionInfo | undefined
  listParty(partySeed: string): ConnectionInfo[]
  listArea(partySeed: string, areaId: string): ConnectionInfo[]
  updateArea(partySeed: string, playerId: string, areaId: string): void
  all(): ConnectionInfo[]
}

export function createConnectionRegistry(): ConnectionRegistry {
  const byWs = new Map<WsLike, ConnectionInfo>()
  const byPlayer = new Map<string, ConnectionInfo>()

  function key(partySeed: string, playerId: string): string {
    return `${partySeed}::${playerId}`
  }

  function register(ws: WsLike, info: Omit<ConnectionInfo, 'ws'>) {
    const existing = byPlayer.get(key(info.partySeed, info.playerId))
    if (existing && existing.ws !== ws) {
      byWs.delete(existing.ws)
      try {
        existing.ws.close(4000, 'session_superseded')
      } catch { /* no-op */ }
    }
    const full: ConnectionInfo = { ws, ...info }
    byWs.set(ws, full)
    byPlayer.set(key(info.partySeed, info.playerId), full)
  }

  function unregister(ws: WsLike): ConnectionInfo | undefined {
    const info = byWs.get(ws)
    if (!info) return undefined
    byWs.delete(ws)
    const existing = byPlayer.get(key(info.partySeed, info.playerId))
    if (existing && existing.ws === ws) {
      byPlayer.delete(key(info.partySeed, info.playerId))
    }
    return info
  }

  function getPlayerConn(partySeed: string, playerId: string): ConnectionInfo | undefined {
    return byPlayer.get(key(partySeed, playerId))
  }

  function listParty(partySeed: string): ConnectionInfo[] {
    const out: ConnectionInfo[] = []
    for (const info of byWs.values()) {
      if (info.partySeed === partySeed) out.push(info)
    }
    return out
  }

  function listArea(partySeed: string, areaId: string): ConnectionInfo[] {
    return listParty(partySeed).filter(c => c.areaId === areaId)
  }

  function updateArea(partySeed: string, playerId: string, areaId: string) {
    const conn = byPlayer.get(key(partySeed, playerId))
    if (conn) conn.areaId = areaId
  }

  function all(): ConnectionInfo[] {
    return Array.from(byWs.values())
  }

  return { register, unregister, getPlayerConn, listParty, listArea, updateArea, all }
}
```

- [ ] **Step 4: Run — 5 passed.**

- [ ] **Step 5: Typecheck — 0 errors.**

- [ ] **Step 6: Commit**

```bash
git add server/ws/connections.ts tests/unit/server/connections.test.ts
git commit -m "feat: registry connessioni websocket in-memory"
```

---

## Task 5 — Fan-out helpers

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/ws/fanout.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/server/fanout.test.ts`

Logica fan-out per Plan 2 (ridotta): `say`, `emote`, `ooc` → tutti i giocatori nell'area + master.

- [ ] **Step 1: Test** — `tests/unit/server/fanout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickFanoutRecipients } from '~~/server/ws/fanout'
import type { ConnectionInfo } from '~~/server/ws/connections'

function conn(playerId: string, areaId: string, role: 'user' | 'master'): ConnectionInfo & { role: 'user' | 'master' } {
  return {
    ws: { send: () => {}, close: () => {} },
    partySeed: 'p', playerId, areaId, role
  }
}

describe('pickFanoutRecipients', () => {
  it('say: player in area + master', () => {
    const connections = [
      conn('alice', 'piazza', 'user'),
      conn('bob', 'fogne', 'user'),
      conn('master', 'scuola', 'master')
    ]
    const result = pickFanoutRecipients(connections, {
      kind: 'say', areaId: 'piazza'
    })
    expect(result.map(c => c.playerId).sort()).toEqual(['alice', 'master'])
  })

  it('emote stesso comportamento di say', () => {
    const connections = [
      conn('alice', 'piazza', 'user'),
      conn('bob', 'piazza', 'user'),
      conn('carla', 'fogne', 'user')
    ]
    const result = pickFanoutRecipients(connections, { kind: 'emote', areaId: 'piazza' })
    expect(result.map(c => c.playerId).sort()).toEqual(['alice', 'bob'])
  })

  it('ooc stesso comportamento di say', () => {
    const connections = [
      conn('alice', 'piazza', 'user'),
      conn('master', 'scuola', 'master')
    ]
    const result = pickFanoutRecipients(connections, { kind: 'ooc', areaId: 'piazza' })
    expect(result.map(c => c.playerId).sort()).toEqual(['alice', 'master'])
  })

  it('master riceve anche da aree diverse', () => {
    const connections = [conn('master', 'scuola', 'master')]
    const result = pickFanoutRecipients(connections, { kind: 'say', areaId: 'piazza' })
    expect(result.map(c => c.playerId)).toEqual(['master'])
  })
})
```

- [ ] **Step 2: Run — must FAIL**

- [ ] **Step 3: Implement** — `server/ws/fanout.ts`:

```ts
import type { ConnectionInfo } from '~~/server/ws/connections'

export type RoleAware = ConnectionInfo & { role: 'user' | 'master' }

export interface FanoutSpec {
  kind: 'say' | 'emote' | 'ooc' | 'whisper' | 'shout' | 'roll' | 'dm' | 'npc' | 'announce' | 'system'
  areaId?: string | null
  targetPlayerId?: string | null
  authorPlayerId?: string | null
}

// Plan 2 copre solo say/emote/ooc. Gli altri kind verranno implementati nei
// plan successivi (shout in Plan 3 — adiacenze — whisper/dm/roll in Plan 4,
// npc/announce in Plan 5). Per ora qui è presente solo la logica di base.
export function pickFanoutRecipients(connections: readonly RoleAware[], spec: FanoutSpec): RoleAware[] {
  const out: RoleAware[] = []
  for (const c of connections) {
    if (shouldReceive(c, spec)) out.push(c)
  }
  return out
}

function shouldReceive(c: RoleAware, spec: FanoutSpec): boolean {
  // Il master legge sempre tutto (moderazione).
  if (c.role === 'master') return true

  switch (spec.kind) {
    case 'say':
    case 'emote':
    case 'ooc':
      return spec.areaId != null && c.areaId === spec.areaId
    case 'whisper':
    case 'dm':
      return spec.targetPlayerId != null
        && (c.playerId === spec.targetPlayerId || c.playerId === spec.authorPlayerId)
    case 'shout':
      // Plan 3 aggiungerà adiacenza; per ora comportamento come say.
      return spec.areaId != null && c.areaId === spec.areaId
    case 'roll':
      return spec.areaId != null && c.areaId === spec.areaId
    case 'npc':
      return spec.areaId != null && c.areaId === spec.areaId
    case 'announce':
      return true
    case 'system':
      return true
    default:
      return false
  }
}
```

- [ ] **Step 4: Run — 4 passed.**

- [ ] **Step 5: Typecheck — 0 errors.**

- [ ] **Step 6: Commit**

```bash
git add server/ws/fanout.ts tests/unit/server/fanout.test.ts
git commit -m "feat: helper fan-out per say/emote/ooc con regole master"
```

---

## Task 6 — WebSocket handler Nitro

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/routes/ws/party.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/server/ws/state.ts`

Nitro supporta WebSocket con `defineWebSocketHandler`. Il handler deve:
1. Accettare una connessione, aspettare `hello`.
2. Validare `seed` + `sessionToken` → trovare player.
3. Chiamare `registry.register(...)`.
4. Inviare `state:init` al client con snapshot minimo.
5. On `chat:send`: Plan 2 implementa via Task 7 (questo file rimane scheletro per `hello` + routing).
6. On close: `registry.unregister(ws)`.

- [ ] **Step 1: Shared state module** — `server/ws/state.ts`:

```ts
import { createConnectionRegistry, type ConnectionRegistry, type ConnectionInfo } from '~~/server/ws/connections'
import { createRateLimiter, type RateLimiter } from '~~/server/ws/rate-limit'

// State singleton per il processo server — non persistito.
export const registry: ConnectionRegistry = createConnectionRegistry()
export const chatRateLimiter: RateLimiter = createRateLimiter({ windowMs: 1000, maxHits: 5 })

export interface RoleAwareInfo extends ConnectionInfo {
  role: 'user' | 'master'
}

export function sendJson(ws: { send(s: string): void }, event: unknown): void {
  ws.send(JSON.stringify(event))
}
```

- [ ] **Step 2: Handler hello** — `server/routes/ws/party.ts`:

```ts
import { HelloEvent, type ClientEvent, type StateInitEvent, type TimeTickEvent } from '~~/shared/protocol/ws'
import { useDb } from '~~/server/utils/db'
import { findPlayerBySession, listOnlinePlayers, touchPlayer } from '~~/server/services/players'
import { partyMustExist } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import { listAreaMessages } from '~~/server/services/messages'
import { registry, sendJson } from '~~/server/ws/state'

const TIME_TICK_INTERVAL_MS = 60_000

let timeTickTimer: NodeJS.Timeout | null = null

function ensureTimeTickBroadcaster() {
  if (timeTickTimer) return
  timeTickTimer = setInterval(() => {
    const tick: TimeTickEvent = { type: 'time:tick', serverTime: Date.now() }
    const payload = JSON.stringify(tick)
    for (const conn of registry.all()) {
      try {
        conn.ws.send(payload)
      } catch { /* no-op */ }
    }
  }, TIME_TICK_INTERVAL_MS)
  if (typeof timeTickTimer.unref === 'function') timeTickTimer.unref()
}

export default defineWebSocketHandler({
  open(peer) {
    ensureTimeTickBroadcaster()
    // Nessun setup finché non riceviamo hello.
  },

  async message(peer, raw) {
    let parsed: ClientEvent | null = null
    try {
      const data = JSON.parse(String(raw))
      parsed = { ...data } as ClientEvent
    } catch {
      sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'not_json' })
      return
    }

    if (parsed && parsed.type === 'hello') {
      const res = HelloEvent.safeParse(parsed)
      if (!res.success) {
        sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'hello_malformed' })
        return
      }
      await handleHello(peer, res.data.seed, res.data.sessionToken)
      return
    }

    // Altri kind vengono gestiti dal Task 7 (chat:send). Per ora ignora.
  },

  close(peer) {
    registry.unregister(peer as unknown as { send(s: string): void, close(c?: number, r?: string): void })
  }
})

async function handleHello(peer: { send(s: string): void, close(code?: number, reason?: string): void }, seed: string, sessionToken: string) {
  try {
    const db = useDb()
    partyMustExist(db, seed)
    const player = findPlayerBySession(db, seed, sessionToken)
    if (!player || player.isKicked) {
      sendJson(peer, { type: 'error', code: 'session_invalid' })
      peer.close(4001, 'session_invalid')
      return
    }

    registry.register(peer, {
      partySeed: seed,
      playerId: player.id,
      areaId: player.currentAreaId
    })

    // Snapshot state:init
    const party = partyMustExist(db, seed)
    const players = listOnlinePlayers(db, seed).map(p => ({
      id: p.id, nickname: p.nickname, role: p.role, currentAreaId: p.currentAreaId
    }))
    const areasState = listAreasState(db, seed)
    const messagesByArea: Record<string, unknown[]> = {}
    messagesByArea[player.currentAreaId] = listAreaMessages(db, seed, player.currentAreaId, 100)

    const init: StateInitEvent = {
      type: 'state:init',
      me: { id: player.id, nickname: player.nickname, role: player.role, currentAreaId: player.currentAreaId },
      party: { seed: party.seed, cityName: party.cityName, createdAt: party.createdAt, lastActivityAt: party.lastActivityAt },
      players,
      areasState,
      messagesByArea: messagesByArea as never,
      serverTime: Date.now()
    }
    sendJson(peer, init)
    touchPlayer(db, player.id)
  } catch (e) {
    sendJson(peer, { type: 'error', code: 'not_found', detail: (e as Error).message })
    peer.close(4004, 'not_found')
  }
}
```

**Nota:** Nitro/h3 WebSocket usa `peer` (tipo `Peer`) che espone `send()` e `close()`. Il tipo esatto è `crossws`'s Peer; per il nostro codice basta trattare peer come oggetto con `send(data)`/`close(code, reason)`. Il registry accetta quell'interfaccia.

- [ ] **Step 3: Typecheck** — `pnpm typecheck` deve essere 0 errori. Se Nitro rifiuta `defineWebSocketHandler` perché non auto-importato, forzare con `// @ts-expect-error` o aggiungere `/// <reference types="nitropack/types" />` — diagnosticare e correggere.

- [ ] **Step 4: Build** — `pnpm build` deve compilare il bundle con il chunk WS.

- [ ] **Step 5: Commit**

```bash
git add server/ws/state.ts server/routes/ws/party.ts
git commit -m "feat: handler websocket con hello e time-tick broadcaster"
```

---

## Task 7 — Handler chat:send + integration test

**Files:**
- Modify: `/Users/mashfrog/Work/gdr-zombie/server/routes/ws/party.ts` (aggiungi chat:send)
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/integration/ws/chat.test.ts`

Plan 2 supporta solo `kind: 'say' | 'emote' | 'ooc'`. Gli altri kind valicati Zod ma rifiutati con error code `forbidden` (verranno abilitati nei plan successivi).

- [ ] **Step 1: Integration test** — `tests/integration/ws/chat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import WebSocket from 'ws'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))

await setup({
  rootDir,
  dev: false,
  server: true,
  build: false,
  nuxtConfig: {
    nitro: {
      output: {
        dir: resolve(rootDir, '.output')
      }
    }
  },
  env: { DATABASE_URL: ':memory:' }
})

async function openWs(base: string, seed: string, sessionToken: string): Promise<WebSocket> {
  const url = base.replace(/^http/, 'ws') + '/ws/party'
  const ws = new WebSocket(url)
  await new Promise<void>(r => ws.once('open', () => r()))
  ws.send(JSON.stringify({ type: 'hello', seed, sessionToken }))
  return ws
}

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMsg = (data: WebSocket.RawData) => {
      try {
        resolve(JSON.parse(String(data)) as Record<string, unknown>)
      } catch (e) {
        reject(e as Error)
      } finally {
        ws.off('message', onMsg)
      }
    }
    ws.on('message', onMsg)
  })
}

describe('chat:send (say/emote/ooc)', () => {
  it('master invia say e riceve message:new', async () => {
    const base = process.env._NUXT_TEST_URL ?? 'http://localhost:3000'
    const create = await $fetch(`${base}/api/parties`, {
      method: 'POST',
      body: { masterNickname: 'M' }
    }) as { seed: string, sessionToken: string }

    const ws = await openWs(base, create.seed, create.sessionToken)
    const init = await nextMessage(ws)
    expect(init.type).toBe('state:init')

    ws.send(JSON.stringify({
      type: 'chat:send', kind: 'say', body: 'ciao', areaId: 'piazza'
    }))
    const msg = await nextMessage(ws)
    expect(msg.type).toBe('message:new')
    const m = (msg.message as { body: string, kind: string })
    expect(m.body).toBe('ciao')
    expect(m.kind).toBe('say')

    ws.close()
  })

  it('due giocatori nella stessa area si vedono i messaggi', async () => {
    const base = process.env._NUXT_TEST_URL ?? 'http://localhost:3000'
    const create = await $fetch(`${base}/api/parties`, {
      method: 'POST',
      body: { masterNickname: 'M2' }
    }) as { seed: string, sessionToken: string }

    const join = await $fetch(`${base}/api/parties/${create.seed}/join`, {
      method: 'POST',
      body: { nickname: 'Anna' }
    }) as { sessionToken: string }

    const masterWs = await openWs(base, create.seed, create.sessionToken)
    await nextMessage(masterWs) // state:init

    const annaWs = await openWs(base, create.seed, join.sessionToken)
    await nextMessage(annaWs) // state:init

    annaWs.send(JSON.stringify({
      type: 'chat:send', kind: 'say', body: 'aiuto', areaId: 'piazza'
    }))

    const [annaEcho, masterReceive] = await Promise.all([
      nextMessage(annaWs),
      nextMessage(masterWs)
    ])
    expect(annaEcho.type).toBe('message:new')
    expect(masterReceive.type).toBe('message:new')
    expect((masterReceive.message as { body: string }).body).toBe('aiuto')

    masterWs.close()
    annaWs.close()
  })

  it('emote e ooc sono accettati; kind invalido rifiutato', async () => {
    const base = process.env._NUXT_TEST_URL ?? 'http://localhost:3000'
    const create = await $fetch(`${base}/api/parties`, {
      method: 'POST',
      body: { masterNickname: 'M3' }
    }) as { seed: string, sessionToken: string }

    const ws = await openWs(base, create.seed, create.sessionToken)
    await nextMessage(ws)

    ws.send(JSON.stringify({ type: 'chat:send', kind: 'emote', body: 'annuisce', areaId: 'piazza' }))
    const emote = await nextMessage(ws)
    expect((emote.message as { kind: string }).kind).toBe('emote')

    ws.send(JSON.stringify({ type: 'chat:send', kind: 'ooc', body: '((sento fame))', areaId: 'piazza' }))
    const ooc = await nextMessage(ws)
    expect((ooc.message as { kind: string }).kind).toBe('ooc')

    ws.send(JSON.stringify({ type: 'chat:send', kind: 'whisper', body: 'x', areaId: 'piazza' }))
    const err = await nextMessage(ws)
    expect(err.type).toBe('error')
    expect(err.code).toBe('forbidden')

    ws.close()
  })
})
```

**Nota test-util:** `@nuxt/test-utils/e2e` espone l'URL base del server spawnato via variabile globale; se il pattern `process.env._NUXT_TEST_URL` non funziona, usare `import { $fetch as rawFetch } from '@nuxt/test-utils/e2e'` e ricavare la base dal `$fetch('/api/...')` con response headers. Alternativa: usare `useTestContext()` da `@nuxt/test-utils`. Diagnosticare empiricamente.

- [ ] **Step 2: Install ws** — `pnpm add -D ws @types/ws` (test dependency only).

- [ ] **Step 3: Estendi handler** — in `server/routes/ws/party.ts`, dentro `message(peer, raw)`, dopo il branch `hello`, aggiungi:

```ts
if (parsed && parsed.type === 'chat:send') {
  await handleChatSend(peer, parsed)
  return
}
```

E aggiungi la funzione:

```ts
import { ChatSendEvent, type MessageNewEvent } from '~~/shared/protocol/ws'
import { insertMessage } from '~~/server/services/messages'
import { pickFanoutRecipients } from '~~/server/ws/fanout'
import { chatRateLimiter } from '~~/server/ws/state'
import { isAreaId } from '~~/shared/map/areas'

async function handleChatSend(peer: { send(s: string): void }, raw: unknown) {
  const res = ChatSendEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'chat_send_malformed' })
    return
  }
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }

  // Plan 2: solo say/emote/ooc permessi.
  if (!['say', 'emote', 'ooc'].includes(res.data.kind)) {
    sendJson(peer, { type: 'error', code: 'forbidden', detail: `kind_${res.data.kind}_not_yet_implemented` })
    return
  }

  const rateKey = `${conn.partySeed}:${conn.playerId}`
  if (!chatRateLimiter.tryHit(rateKey)) {
    sendJson(peer, { type: 'error', code: 'rate_limited' })
    return
  }

  const areaId = res.data.areaId ?? conn.areaId
  if (!isAreaId(areaId)) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
    return
  }
  // Il player deve essere in quell'area per parlarci.
  if (areaId !== conn.areaId) {
    sendJson(peer, { type: 'error', code: 'forbidden', detail: 'not_in_area' })
    return
  }

  const db = useDb()
  const playerRow = findPlayerBySession(db, conn.partySeed, (conn as { ws: unknown }) && '' || '')
  // Per risparmiare una query, author_display viene dal connection registry:
  // serve il nickname — usiamo il registro esteso role-aware oppure fetchiamo dal DB.
  const me = listOnlinePlayers(db, conn.partySeed).find(p => p.id === conn.playerId)
  if (!me) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }

  const stored = insertMessage(db, {
    partySeed: conn.partySeed,
    kind: res.data.kind,
    authorPlayerId: conn.playerId,
    authorDisplay: me.nickname,
    areaId,
    body: res.data.body
  })

  const broadcast: MessageNewEvent = { type: 'message:new', message: stored }
  const payload = JSON.stringify(broadcast)

  // Role-aware: abbiamo bisogno di filtrare per role del destinatario.
  // Il registry non memorizza role; la soluzione per Plan 2 è fetchare i
  // player della party e mergeli. Per efficienza: listOnlinePlayers una volta.
  const partyPlayers = listOnlinePlayers(db, conn.partySeed)
  const roleById = new Map(partyPlayers.map(p => [p.id, p.role]))
  const roleAware = registry.listParty(conn.partySeed).map(c => ({
    ...c,
    role: (roleById.get(c.playerId) ?? 'user') as 'user' | 'master'
  }))
  const recipients = pickFanoutRecipients(roleAware, {
    kind: res.data.kind,
    areaId,
    authorPlayerId: conn.playerId
  })
  for (const r of recipients) {
    try {
      r.ws.send(payload)
    } catch { /* skip dead conn */ }
  }
}
```

**Nota:** il riferimento `findPlayerBySession` nel pseudo-codice sopra è errato perché non abbiamo il sessionToken di peer. Uso `listOnlinePlayers` + filter per `playerId`. Riscrivi la funzione pulita senza il lookup spurio, come mostrato (la linea `const playerRow = findPlayerBySession(...)` è da rimuovere prima di committare).

Riepilogo della versione corretta:

```ts
async function handleChatSend(peer: { send(s: string): void }, raw: unknown) {
  const res = ChatSendEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'chat_send_malformed' })
    return
  }
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }
  if (!['say', 'emote', 'ooc'].includes(res.data.kind)) {
    sendJson(peer, { type: 'error', code: 'forbidden', detail: `kind_${res.data.kind}_not_yet_implemented` })
    return
  }
  const rateKey = `${conn.partySeed}:${conn.playerId}`
  if (!chatRateLimiter.tryHit(rateKey)) {
    sendJson(peer, { type: 'error', code: 'rate_limited' })
    return
  }
  const areaId = res.data.areaId ?? conn.areaId
  if (!isAreaId(areaId)) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
    return
  }
  if (areaId !== conn.areaId) {
    sendJson(peer, { type: 'error', code: 'forbidden', detail: 'not_in_area' })
    return
  }

  const db = useDb()
  const partyPlayers = listOnlinePlayers(db, conn.partySeed)
  const me = partyPlayers.find(p => p.id === conn.playerId)
  if (!me) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }

  const stored = insertMessage(db, {
    partySeed: conn.partySeed,
    kind: res.data.kind,
    authorPlayerId: conn.playerId,
    authorDisplay: me.nickname,
    areaId,
    body: res.data.body
  })

  const broadcast: MessageNewEvent = { type: 'message:new', message: stored }
  const payload = JSON.stringify(broadcast)

  const roleById = new Map(partyPlayers.map(p => [p.id, p.role]))
  const roleAware = registry.listParty(conn.partySeed).map(c => ({
    ...c,
    role: (roleById.get(c.playerId) ?? 'user') as 'user' | 'master'
  }))
  const recipients = pickFanoutRecipients(roleAware, {
    kind: res.data.kind, areaId, authorPlayerId: conn.playerId
  })
  for (const r of recipients) {
    try { r.ws.send(payload) } catch { /* skip */ }
  }
}
```

- [ ] **Step 4: Build** — `pnpm build` per aggiornare `.output/`.

- [ ] **Step 5: Run integration test** — `pnpm vitest run tests/integration/ws/chat.test.ts`

Expected: `3 passed`. Se `process.env._NUXT_TEST_URL` non è disponibile, diagnosticare il metodo corretto per ottenere la URL dal Nuxt test harness (Nuxt 4 test-utils in genere espone `useTestContext().url`). Risolvere e ritentare — non committare fino a verde.

- [ ] **Step 6: Typecheck — 0 errors.**

- [ ] **Step 7: Commit**

```bash
git add server/routes/ws/party.ts tests/integration/ws package.json pnpm-lock.yaml
git commit -m "feat: handler chat:send per say/emote/ooc con fanout area"
```

---

## Task 8 — Composable useSession (localStorage)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/app/composables/useSession.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/composables/use-session.test.ts`

Nota: questo composable è puro, non usa `useState` Nuxt (state lato client, solo lettura/scrittura localStorage sincrone + reactive ref). Testabile in ambiente jsdom.

- [ ] **Step 1: Cambiare vitest environment per questo test**

In `tests/unit/composables/use-session.test.ts` aggiungere come prima riga il comment directive:

```ts
// @vitest-environment happy-dom
```

E installare `happy-dom`:
```bash
pnpm add -D happy-dom
```

- [ ] **Step 2: Test** — `tests/unit/composables/use-session.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { useSession } from '~/composables/useSession'

describe('useSession', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('nickname parte null se nulla salvato', () => {
    const s = useSession()
    expect(s.nickname.value).toBe(null)
  })

  it('setNickname persiste e riflette', () => {
    const s = useSession()
    s.setNickname('Anna')
    expect(s.nickname.value).toBe('Anna')
    expect(localStorage.getItem('gdr.nickname')).toBe('Anna')
    // Nuova istanza legge lo stesso valore.
    const s2 = useSession()
    expect(s2.nickname.value).toBe('Anna')
  })

  it('clearNickname rimuove', () => {
    const s = useSession()
    s.setNickname('X')
    s.clearNickname()
    expect(s.nickname.value).toBe(null)
    expect(localStorage.getItem('gdr.nickname')).toBeNull()
  })

  it('addSession e listSessions', () => {
    const s = useSession()
    s.addSession({ seed: 'u1', sessionToken: 't1', role: 'user', joinedAt: 1 })
    s.addSession({ seed: 'u2', sessionToken: 't2', role: 'master', joinedAt: 2 })
    const list = s.listSessions()
    expect(list).toHaveLength(2)
    expect(list.find(x => x.seed === 'u1')?.role).toBe('user')
  })

  it('removeSession pulisce', () => {
    const s = useSession()
    s.addSession({ seed: 'u1', sessionToken: 't1', role: 'user', joinedAt: 1 })
    s.removeSession('u1')
    expect(s.listSessions()).toEqual([])
  })

  it('master token set/get/remove', () => {
    const s = useSession()
    s.setMasterToken('u1', 'token')
    expect(s.getMasterToken('u1')).toBe('token')
    s.removeMasterToken('u1')
    expect(s.getMasterToken('u1')).toBe(null)
  })
})
```

- [ ] **Step 3: Run — must FAIL**

- [ ] **Step 4: Implement** — `app/composables/useSession.ts`:

```ts
import { ref, watch, type Ref } from 'vue'

export interface PartySession {
  seed: string
  sessionToken: string
  role: 'user' | 'master'
  joinedAt: number
}

const NICKNAME_KEY = 'gdr.nickname'
const SESSIONS_KEY = 'gdr.sessions'
const MASTER_TOKENS_KEY = 'gdr.masterTokens'

function readNickname(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(NICKNAME_KEY)
}

function readSessions(): Record<string, PartySession> {
  if (typeof localStorage === 'undefined') return {}
  const raw = localStorage.getItem(SESSIONS_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, PartySession>
  } catch {
    return {}
  }
}

function writeSessions(data: Record<string, PartySession>) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(data))
}

function readMasterTokens(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  const raw = localStorage.getItem(MASTER_TOKENS_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

function writeMasterTokens(data: Record<string, string>) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(MASTER_TOKENS_KEY, JSON.stringify(data))
}

export function useSession() {
  const nickname: Ref<string | null> = ref(readNickname())

  watch(nickname, (v) => {
    if (typeof localStorage === 'undefined') return
    if (v === null || v === '') localStorage.removeItem(NICKNAME_KEY)
    else localStorage.setItem(NICKNAME_KEY, v)
  })

  function setNickname(v: string) { nickname.value = v.trim() }
  function clearNickname() { nickname.value = null }

  function listSessions(): PartySession[] {
    return Object.values(readSessions())
  }
  function addSession(s: PartySession) {
    const cur = readSessions()
    cur[s.seed] = s
    writeSessions(cur)
  }
  function removeSession(seed: string) {
    const cur = readSessions()
    delete cur[seed]
    writeSessions(cur)
  }
  function getSession(seed: string): PartySession | null {
    return readSessions()[seed] ?? null
  }

  function setMasterToken(seed: string, token: string) {
    const cur = readMasterTokens()
    cur[seed] = token
    writeMasterTokens(cur)
  }
  function getMasterToken(seed: string): string | null {
    return readMasterTokens()[seed] ?? null
  }
  function removeMasterToken(seed: string) {
    const cur = readMasterTokens()
    delete cur[seed]
    writeMasterTokens(cur)
  }

  return {
    nickname,
    setNickname, clearNickname,
    listSessions, addSession, removeSession, getSession,
    setMasterToken, getMasterToken, removeMasterToken
  }
}
```

- [ ] **Step 5: Run — 6 passed.**

- [ ] **Step 6: Typecheck — 0 errors.**

- [ ] **Step 7: Commit**

```bash
git add app/composables/useSession.ts tests/unit/composables/use-session.test.ts package.json pnpm-lock.yaml
git commit -m "feat: composable usesession con localstorage persistente"
```

---

## Task 9 — Composable useServerTime

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/app/composables/useServerTime.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/composables/use-server-time.test.ts`

- [ ] **Step 1: Test** — `tests/unit/composables/use-server-time.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { useServerTime } from '~/composables/useServerTime'

describe('useServerTime', () => {
  it('calcola offset da serverTime e Date.now()', () => {
    const realNow = 1_000_000
    vi.spyOn(Date, 'now').mockReturnValue(realNow)
    const t = useServerTime()
    t.sync(realNow + 5000)
    expect(t.offset.value).toBe(5000)
    vi.restoreAllMocks()
  })

  it('currentTime torna Date.now + offset', () => {
    const realNow = 2_000_000
    vi.spyOn(Date, 'now').mockReturnValue(realNow)
    const t = useServerTime()
    t.sync(realNow - 2000)
    expect(t.currentTime()).toBe(realNow - 2000)
    vi.restoreAllMocks()
  })

  it('synced è false fino alla prima sync', () => {
    const t = useServerTime()
    expect(t.synced.value).toBe(false)
    t.sync(Date.now())
    expect(t.synced.value).toBe(true)
  })
})
```

- [ ] **Step 2: Run — must FAIL**

- [ ] **Step 3: Implement** — `app/composables/useServerTime.ts`:

```ts
import { ref } from 'vue'

export function useServerTime() {
  const offset = ref(0)
  const synced = ref(false)

  function sync(serverTime: number) {
    offset.value = serverTime - Date.now()
    synced.value = true
  }

  function currentTime(): number {
    return Date.now() + offset.value
  }

  function format(): string {
    const d = new Date(currentTime())
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  function formatDate(): string {
    const d = new Date(currentTime())
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  return { offset, synced, sync, currentTime, format, formatDate }
}
```

- [ ] **Step 4: Run — 3 passed.**

- [ ] **Step 5: Typecheck — 0 errors.**

- [ ] **Step 6: Commit**

```bash
git add app/composables/useServerTime.ts tests/unit/composables/use-server-time.test.ts
git commit -m "feat: composable useservertime con offset sincronizzato"
```

---

## Task 10 — Stores Pinia

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/app/stores/party.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/app/stores/chat.ts`

Stores minimali. Party store: snapshot del `state:init`. Chat store: messaggi indicizzati per area, input draft, actions per aggiungere messaggi.

- [ ] **Step 1: Party store** — `app/stores/party.ts`:

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface MeSnapshot {
  id: string
  nickname: string
  role: 'user' | 'master'
  currentAreaId: string
}

export interface PartySnapshot {
  seed: string
  cityName: string
  createdAt: number
  lastActivityAt: number
}

export interface PlayerSnapshot {
  id: string
  nickname: string
  role: 'user' | 'master'
  currentAreaId: string
}

export interface AreaStateSnapshot {
  partySeed: string
  areaId: string
  status: 'intact' | 'infested' | 'ruined' | 'closed'
  customName: string | null
  notes: string | null
}

export const usePartyStore = defineStore('party', () => {
  const me = ref<MeSnapshot | null>(null)
  const party = ref<PartySnapshot | null>(null)
  const players = ref<PlayerSnapshot[]>([])
  const areasState = ref<AreaStateSnapshot[]>([])

  function hydrate(payload: {
    me: MeSnapshot, party: PartySnapshot,
    players: PlayerSnapshot[], areasState: AreaStateSnapshot[]
  }) {
    me.value = payload.me
    party.value = payload.party
    players.value = payload.players
    areasState.value = payload.areasState
  }

  function reset() {
    me.value = null
    party.value = null
    players.value = []
    areasState.value = []
  }

  return { me, party, players, areasState, hydrate, reset }
})
```

- [ ] **Step 2: Chat store** — `app/stores/chat.ts`:

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ChatMessage {
  id: string
  partySeed: string
  kind: string
  authorPlayerId: string | null
  authorDisplay: string
  areaId: string | null
  targetPlayerId: string | null
  body: string
  rollPayload: string | null
  createdAt: number
  deletedAt: number | null
  deletedBy: string | null
  editedAt: number | null
}

export const useChatStore = defineStore('chat', () => {
  const messagesByArea = ref<Record<string, ChatMessage[]>>({})
  const inputDraft = ref('')

  function hydrate(payload: Record<string, ChatMessage[]>) {
    messagesByArea.value = { ...payload }
  }

  function append(msg: ChatMessage) {
    const area = msg.areaId
    if (!area) return
    const list = messagesByArea.value[area] ?? []
    messagesByArea.value[area] = [...list, msg]
  }

  function update(msg: ChatMessage) {
    const area = msg.areaId
    if (!area) return
    const list = messagesByArea.value[area]
    if (!list) return
    const idx = list.findIndex(m => m.id === msg.id)
    if (idx === -1) {
      messagesByArea.value[area] = [...list, msg]
    } else {
      const copy = [...list]
      copy[idx] = msg
      messagesByArea.value[area] = copy
    }
  }

  function forArea(areaId: string): ChatMessage[] {
    return messagesByArea.value[areaId] ?? []
  }

  function reset() {
    messagesByArea.value = {}
    inputDraft.value = ''
  }

  return { messagesByArea, inputDraft, hydrate, append, update, forArea, reset }
})
```

- [ ] **Step 3: Typecheck** — `pnpm typecheck` → 0 errori.

- [ ] **Step 4: Commit**

```bash
git add app/stores/party.ts app/stores/chat.ts
git commit -m "feat: stores pinia party e chat"
```

*(Nessun test unit per gli stores Pinia in questo plan. Verranno esercitati dai test integration delle pagine nei task successivi.)*

---

## Task 11 — Composable usePartyConnection (WS client)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/app/composables/usePartyConnection.ts`

- [ ] **Step 1: Implement** — `app/composables/usePartyConnection.ts`:

```ts
import { ref, onBeforeUnmount } from 'vue'
import { usePartyStore } from '~/stores/party'
import { useChatStore, type ChatMessage } from '~/stores/chat'
import { useServerTime } from '~/composables/useServerTime'

interface ConnectOptions {
  seed: string
  sessionToken: string
}

export function usePartyConnection() {
  const partyStore = usePartyStore()
  const chatStore = useChatStore()
  const serverTime = useServerTime()

  const ws = ref<WebSocket | null>(null)
  const status = ref<'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'>('idle')
  let closed = false
  let reconnectAttempts = 0
  let pendingOpts: ConnectOptions | null = null

  function wsUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws/party`
  }

  function scheduleReconnect() {
    if (closed) return
    reconnectAttempts++
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempts, 5))
    status.value = 'reconnecting'
    setTimeout(() => {
      if (!closed && pendingOpts) connect(pendingOpts)
    }, delay)
  }

  function connect(opts: ConnectOptions) {
    pendingOpts = opts
    closed = false
    status.value = 'connecting'
    const sock = new WebSocket(wsUrl())
    ws.value = sock

    sock.addEventListener('open', () => {
      reconnectAttempts = 0
      status.value = 'open'
      sock.send(JSON.stringify({ type: 'hello', seed: opts.seed, sessionToken: opts.sessionToken }))
    })

    sock.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data) as Record<string, unknown>
        handleEvent(data)
      } catch { /* ignore malformed */ }
    })

    sock.addEventListener('close', () => {
      ws.value = null
      if (!closed) scheduleReconnect()
      else status.value = 'closed'
    })

    sock.addEventListener('error', () => {
      try { sock.close() } catch { /* no-op */ }
    })
  }

  function disconnect() {
    closed = true
    status.value = 'closed'
    ws.value?.close()
    ws.value = null
  }

  function send(event: Record<string, unknown>) {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(event))
    }
  }

  function handleEvent(data: Record<string, unknown>) {
    switch (data.type) {
      case 'state:init': {
        const init = data as { me: MeS, party: PS, players: PS2[], areasState: AS[], messagesByArea: Record<string, ChatMessage[]>, serverTime: number }
        partyStore.hydrate({
          me: init.me, party: init.party,
          players: init.players, areasState: init.areasState
        })
        chatStore.hydrate(init.messagesByArea ?? {})
        serverTime.sync(init.serverTime)
        break
      }
      case 'message:new': {
        const m = (data as { message: ChatMessage }).message
        chatStore.append(m)
        break
      }
      case 'message:update': {
        const m = (data as { message: ChatMessage }).message
        chatStore.update(m)
        break
      }
      case 'time:tick': {
        serverTime.sync((data as { serverTime: number }).serverTime)
        break
      }
      case 'error': {
        // Plan 2: log a console. Plan 6 aggiungerà toast.
        console.warn('[ws error]', data)
        break
      }
    }
  }

  onBeforeUnmount(() => {
    disconnect()
  })

  return { ws, status, connect, disconnect, send }
}

// Type aliases locali per evitare dipendenza esplicita — in Plan successivi
// spostare in shared/protocol/ws.ts.
type MeS = { id: string, nickname: string, role: 'user' | 'master', currentAreaId: string }
type PS = { seed: string, cityName: string, createdAt: number, lastActivityAt: number }
type PS2 = MeS
type AS = { partySeed: string, areaId: string, status: 'intact' | 'infested' | 'ruined' | 'closed', customName: string | null, notes: string | null }
```

- [ ] **Step 2: Typecheck — 0 errors.**

- [ ] **Step 3: Commit**

```bash
git add app/composables/usePartyConnection.ts
git commit -m "feat: composable usepartyconnection ws con reconnect"
```

*(Nessun test unit diretto su questo composable: la componente reale lo eserciterà in dev server. Test integration end-to-end in Plan 6.)*

---

## Task 12 — Home page: nickname + sessioni

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/app/components/home/NicknameForm.vue`
- Create: `/Users/mashfrog/Work/gdr-zombie/app/components/home/SessionsList.vue`
- Modify: `/Users/mashfrog/Work/gdr-zombie/app/pages/index.vue`

- [ ] **Step 1: NicknameForm**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useSession } from '~/composables/useSession'

const session = useSession()
const input = ref('')
const error = ref<string | null>(null)

function submit() {
  const v = input.value.trim()
  if (v.length < 2 || v.length > 24 || !/^[a-zA-Z0-9 _-]+$/.test(v)) {
    error.value = 'Il nickname deve avere 2-24 caratteri, solo lettere, numeri, spazio, _ o -'
    return
  }
  error.value = null
  session.setNickname(v)
}

function reset() {
  session.clearNickname()
  input.value = ''
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="session.nickname.value" class="flex items-center gap-3">
      <span class="text-sm" style="color: var(--z-text-md)">Benvenuto,</span>
      <span class="text-lg font-semibold" style="color: var(--z-green-300)">{{ session.nickname.value }}</span>
      <UButton size="xs" variant="ghost" @click="reset">
        Cambia
      </UButton>
    </div>
    <form v-else class="flex gap-2" @submit.prevent="submit">
      <UInput
        v-model="input"
        placeholder="Scegli un nickname"
        size="lg"
        class="flex-1"
      />
      <UButton type="submit" size="lg" color="primary">
        Avanti
      </UButton>
    </form>
    <p v-if="error" class="text-sm" style="color: var(--z-blood-300)">
      {{ error }}
    </p>
  </div>
</template>
```

- [ ] **Step 2: SessionsList**

```vue
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
  <div v-if="sessions.length" class="space-y-3">
    <h2 class="text-sm uppercase tracking-wide" style="color: var(--z-text-md)">
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
          <div class="text-xs font-mono-z truncate" style="color: var(--z-text-md)">
            {{ s.seed }}
          </div>
          <div class="text-sm" style="color: var(--z-text-hi)">
            Ruolo: <span style="color: var(--z-green-300)">{{ s.role }}</span>
          </div>
        </div>
        <UButton size="sm" color="primary" variant="solid" @click="resume(s.seed)">
          Riprendi
        </UButton>
        <UButton size="sm" color="neutral" variant="ghost" @click="forget(s.seed)">
          Dimentica
        </UButton>
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 3: Typecheck — 0 errors.**

- [ ] **Step 4: Commit**

```bash
git add app/components/home
git commit -m "feat: componenti home nicknameform e sessionslist"
```

---

## Task 13 — Home page: create/join + index.vue

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/app/components/home/CreatePartyForm.vue`
- Create: `/Users/mashfrog/Work/gdr-zombie/app/components/home/JoinPartyForm.vue`
- Modify: `/Users/mashfrog/Work/gdr-zombie/app/pages/index.vue`

- [ ] **Step 1: CreatePartyForm**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useSession } from '~/composables/useSession'

const session = useSession()
const loading = ref(false)
const error = ref<string | null>(null)
const createdSeed = ref<string | null>(null)
const createdMasterToken = ref<string | null>(null)

async function create() {
  if (!session.nickname.value) {
    error.value = 'Imposta prima un nickname'
    return
  }
  loading.value = true
  error.value = null
  try {
    const r = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: session.nickname.value }
    }) as { seed: string, masterToken: string, sessionToken: string }
    session.addSession({ seed: r.seed, sessionToken: r.sessionToken, role: 'master', joinedAt: Date.now() })
    session.setMasterToken(r.seed, r.masterToken)
    createdSeed.value = r.seed
    createdMasterToken.value = r.masterToken
  } catch (e) {
    error.value = (e as Error).message || 'Errore sconosciuto'
  } finally {
    loading.value = false
  }
}

async function enter() {
  if (createdSeed.value) await navigateTo(`/party/${createdSeed.value}`)
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="!createdSeed">
      <UButton
        :loading="loading"
        :disabled="!session.nickname.value"
        size="lg"
        color="primary"
        block
        @click="create"
      >
        Crea una nuova party (sarai il master)
      </UButton>
      <p v-if="error" class="text-sm mt-2" style="color: var(--z-blood-300)">
        {{ error }}
      </p>
    </div>
    <div v-else class="space-y-3">
      <p class="text-sm" style="color: var(--z-text-md)">
        Ecco i tuoi codici. <strong style="color: var(--z-blood-300)">Conserva il master token</strong> —
        se lo perdi non potrai più rientrare come master in questa party.
      </p>
      <div class="space-y-2">
        <div>
          <div class="text-xs uppercase" style="color: var(--z-text-md)">Seed (codice per invitare)</div>
          <code class="block font-mono-z text-sm p-2 rounded" style="background: var(--z-bg-800)">{{ createdSeed }}</code>
        </div>
        <div>
          <div class="text-xs uppercase" style="color: var(--z-text-md)">Master token</div>
          <code class="block font-mono-z text-sm p-2 rounded" style="background: var(--z-bg-800); color: var(--z-blood-300)">{{ createdMasterToken }}</code>
        </div>
      </div>
      <UButton size="lg" color="primary" block @click="enter">
        Entra in party
      </UButton>
    </div>
  </div>
</template>
```

- [ ] **Step 2: JoinPartyForm**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useSession } from '~/composables/useSession'

const session = useSession()
const seedInput = ref('')
const masterTokenInput = ref('')
const role = ref<'user' | 'master'>('user')
const loading = ref(false)
const error = ref<string | null>(null)

async function join() {
  if (!session.nickname.value) {
    error.value = 'Imposta prima un nickname'
    return
  }
  const seed = seedInput.value.trim()
  if (!seed) {
    error.value = 'Inserisci un seed'
    return
  }
  loading.value = true
  error.value = null
  try {
    if (role.value === 'user') {
      const r = await $fetch(`/api/parties/${seed}/join`, {
        method: 'POST',
        body: { nickname: session.nickname.value }
      }) as { sessionToken: string }
      session.addSession({ seed, sessionToken: r.sessionToken, role: 'user', joinedAt: Date.now() })
    } else {
      const r = await $fetch(`/api/parties/${seed}/reclaim-master`, {
        method: 'POST',
        body: { masterToken: masterTokenInput.value }
      }) as { sessionToken: string }
      session.addSession({ seed, sessionToken: r.sessionToken, role: 'master', joinedAt: Date.now() })
      session.setMasterToken(seed, masterTokenInput.value)
    }
    await navigateTo(`/party/${seed}`)
  } catch (e) {
    error.value = (e as Error).message || 'Errore sconosciuto'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="join">
    <div class="flex gap-2">
      <UButton
        size="sm"
        :color="role === 'user' ? 'primary' : 'neutral'"
        :variant="role === 'user' ? 'solid' : 'outline'"
        @click="role = 'user'"
      >
        Come giocatore
      </UButton>
      <UButton
        size="sm"
        :color="role === 'master' ? 'primary' : 'neutral'"
        :variant="role === 'master' ? 'solid' : 'outline'"
        @click="role = 'master'"
      >
        Come master
      </UButton>
    </div>
    <UInput v-model="seedInput" placeholder="Seed della party" size="lg" class="font-mono-z" />
    <UInput
      v-if="role === 'master'"
      v-model="masterTokenInput"
      placeholder="Master token"
      size="lg"
      class="font-mono-z"
    />
    <UButton
      :loading="loading"
      :disabled="!session.nickname.value"
      type="submit"
      size="lg"
      color="primary"
      block
    >
      Unisciti
    </UButton>
    <p v-if="error" class="text-sm" style="color: var(--z-blood-300)">{{ error }}</p>
  </form>
</template>
```

- [ ] **Step 3: index.vue**

```vue
<script setup lang="ts">
import NicknameForm from '~/components/home/NicknameForm.vue'
import SessionsList from '~/components/home/SessionsList.vue'
import CreatePartyForm from '~/components/home/CreatePartyForm.vue'
import JoinPartyForm from '~/components/home/JoinPartyForm.vue'

useSeoMeta({ title: 'GDR Zombi — Benvenuto' })
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-8">
    <div class="w-full max-w-xl space-y-8">
      <header class="text-center space-y-2">
        <h1 class="text-4xl font-bold tracking-tight" style="color: var(--z-green-300)">
          GDR Zombi
        </h1>
        <p class="text-sm" style="color: var(--z-text-md)">
          La città non è più quella che ricordi.
        </p>
      </header>

      <NicknameForm />

      <SessionsList />

      <section class="space-y-3 pt-4" style="border-top: 1px solid var(--z-border)">
        <CreatePartyForm />
      </section>

      <section class="space-y-3 pt-4" style="border-top: 1px solid var(--z-border)">
        <h2 class="text-sm uppercase tracking-wide" style="color: var(--z-text-md)">
          Oppure unisciti a una esistente
        </h2>
        <JoinPartyForm />
      </section>
    </div>
  </main>
</template>
```

- [ ] **Step 4: Typecheck + lint — 0 errors.**

- [ ] **Step 5: Smoke test**

```bash
pnpm dev
```
Apri `http://localhost:3000/`. Verifica:
- Nickname form funziona (salva in localStorage).
- Crea party → modale con seed+master token.
- Click "Entra in party" → redirect `/party/:seed` (404 OK: la rotta verrà implementata in Task 14).

- [ ] **Step 6: Commit**

```bash
git add app/components/home/CreatePartyForm.vue app/components/home/JoinPartyForm.vue app/pages/index.vue
git commit -m "feat: home con nickname, create, join, sessioni"
```

---

## Task 14 — Pagina party: shell + guard + connessione WS

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/app/pages/party/[seed].vue`
- Create: `/Users/mashfrog/Work/gdr-zombie/app/components/layout/PartyHeader.vue`

- [ ] **Step 1: PartyHeader**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { usePartyStore } from '~/stores/party'
import { useServerTime } from '~/composables/useServerTime'

const party = usePartyStore()
const time = useServerTime()

const seedShort = computed(() => party.party?.seed.slice(0, 8) ?? '…')
</script>

<template>
  <header
    class="flex items-center justify-between gap-4 px-6 py-3"
    style="background: var(--z-bg-800); border-bottom: 1px solid var(--z-border)"
  >
    <div class="flex items-baseline gap-3">
      <h1 class="text-lg font-semibold" style="color: var(--z-green-300)">
        {{ party.party?.cityName ?? 'Città ignota' }}
      </h1>
      <code class="text-xs font-mono-z" style="color: var(--z-text-lo)">{{ seedShort }}</code>
    </div>
    <div class="flex items-baseline gap-4">
      <div class="text-xs" style="color: var(--z-text-md)">
        <span v-if="time.synced.value" class="font-mono-z">{{ time.format() }}</span>
        <span v-else>… sync</span>
      </div>
      <div v-if="party.me" class="text-sm">
        <span style="color: var(--z-text-md)">{{ party.me.nickname }}</span>
        <span
          class="ml-2 px-2 py-0.5 text-xs rounded"
          :style="party.me.role === 'master'
            ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
            : 'background: var(--z-bg-700); color: var(--z-text-md)'"
        >
          {{ party.me.role }}
        </span>
      </div>
    </div>
  </header>
</template>
```

- [ ] **Step 2: Party page**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useSession } from '~/composables/useSession'
import { usePartyStore } from '~/stores/party'
import { useChatStore } from '~/stores/chat'
import { usePartyConnection } from '~/composables/usePartyConnection'
import PartyHeader from '~/components/layout/PartyHeader.vue'

const route = useRoute()
const seed = String(route.params.seed)
const session = useSession()
const partyStore = usePartyStore()
const chatStore = useChatStore()
const connection = usePartyConnection()

const guardError = ref<string | null>(null)

onMounted(async () => {
  const local = session.getSession(seed)
  if (!local) {
    guardError.value = 'Nessuna sessione locale per questa party. Torna alla home.'
    return
  }
  // Ping di resume per validare la session token prima della WS.
  try {
    await $fetch(`/api/parties/${seed}/resume`, {
      method: 'POST',
      body: { sessionToken: local.sessionToken }
    })
  } catch {
    guardError.value = 'Sessione non valida: torna alla home e unisciti di nuovo.'
    session.removeSession(seed)
    return
  }
  connection.connect({ seed, sessionToken: local.sessionToken })
})

useSeoMeta({ title: () => partyStore.party?.cityName ?? 'GDR Zombi' })

onBeforeRouteLeave(() => {
  connection.disconnect()
  partyStore.reset()
  chatStore.reset()
  return true
})
</script>

<template>
  <div class="flex flex-col min-h-screen">
    <template v-if="guardError">
      <main class="flex-1 flex items-center justify-center p-8 text-center space-y-4">
        <div>
          <p class="text-sm" style="color: var(--z-blood-300)">{{ guardError }}</p>
          <NuxtLink to="/" class="text-sm underline" style="color: var(--z-green-300)">
            Torna alla home
          </NuxtLink>
        </div>
      </main>
    </template>
    <template v-else>
      <PartyHeader />
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Area principale (placeholder Plan 2) -->
        <section class="flex-1 flex items-center justify-center" style="background: var(--z-bg-900)">
          <div class="text-center space-y-2">
            <p class="text-sm uppercase tracking-wide" style="color: var(--z-text-md)">Area corrente</p>
            <p class="text-2xl font-semibold" style="color: var(--z-green-300)">
              {{ partyStore.me?.currentAreaId ?? '…' }}
            </p>
            <p class="text-xs" style="color: var(--z-text-lo)">
              Connessione: {{ connection.status.value }}
            </p>
          </div>
        </section>
        <!-- Chat (Task 15) -->
        <PartyChat />
      </div>
    </template>
  </div>
</template>
```

**Nota:** `PartyChat` verrà creato nel Task 15. Per rendere la pagina funzionante in Plan 2, puoi:
1. Creare uno stub minimale `app/components/chat/PartyChat.vue` che contiene solo `<div>Chat coming soon</div>` in questo task, poi sostituire con il vero componente in Task 15.
2. Oppure committare la pagina con `<!-- <PartyChat /> -->` commentato e scommentare in Task 15.

Scegli l'opzione 1: crea subito lo stub per non lasciare codice commentato.

Stub `app/components/chat/PartyChat.vue`:

```vue
<template>
  <div class="p-4 text-xs" style="border-top: 1px solid var(--z-border); color: var(--z-text-md)">
    (chat — verrà abilitata nel prossimo task)
  </div>
</template>
```

- [ ] **Step 3: Typecheck + lint**

- [ ] **Step 4: Smoke test**

```bash
pnpm dev
```
Crea una party dalla home, entra. Verifica in Network tab: WS `/ws/party` si apre, riceve `state:init`, header mostra cityName, orario serverTime.

- [ ] **Step 5: Commit**

```bash
git add app/pages/party app/components/layout app/components/chat
git commit -m "feat: pagina party con header, guard e connessione ws"
```

---

## Task 15 — Componente PartyChat (invio + visualizzazione say/emote/ooc)

**Files:**
- Modify: `/Users/mashfrog/Work/gdr-zombie/app/components/chat/PartyChat.vue`

- [ ] **Step 1: PartyChat**

Replace `app/components/chat/PartyChat.vue` content:

```vue
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore } from '~/stores/chat'
import { usePartyStore } from '~/stores/party'
import { usePartyConnection } from '~/composables/usePartyConnection'

const chatStore = useChatStore()
const partyStore = usePartyStore()
const connection = usePartyConnection()

const input = ref('')
const inputMode = ref<'say' | 'emote' | 'ooc'>('say')
const scrollTarget = ref<HTMLElement | null>(null)

const currentAreaId = computed(() => partyStore.me?.currentAreaId ?? '')
const messages = computed(() => chatStore.forArea(currentAreaId.value))

function formatTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function classForKind(kind: string): string {
  switch (kind) {
    case 'emote': return 'italic'
    case 'ooc': return 'text-xs'
    default: return ''
  }
}

function styleForKind(kind: string): Record<string, string> {
  switch (kind) {
    case 'emote': return { color: 'var(--z-rust-300)' }
    case 'ooc':   return { color: 'var(--z-toxic-500)' }
    default:      return { color: 'var(--z-text-hi)' }
  }
}

function prefixForKind(kind: string, display: string): string {
  switch (kind) {
    case 'emote': return `* ${display} `
    case 'ooc':   return `((OOC)) ${display}: `
    default:      return `${display}: `
  }
}

function submit() {
  const body = input.value.trim()
  if (!body) return
  if (!currentAreaId.value) return
  connection.send({
    type: 'chat:send',
    kind: inputMode.value,
    body,
    areaId: currentAreaId.value
  })
  input.value = ''
}

watch(messages, async () => {
  await nextTick()
  scrollTarget.value?.scrollTo({ top: scrollTarget.value.scrollHeight, behavior: 'smooth' })
}, { deep: true })
</script>

<template>
  <section
    class="flex flex-col"
    style="background: var(--z-bg-800); border-top: 1px solid var(--z-border); height: 45vh"
  >
    <div class="px-4 py-2 text-xs uppercase tracking-wide" style="color: var(--z-text-md)">
      Chat · {{ currentAreaId || '…' }}
    </div>
    <div
      ref="scrollTarget"
      class="flex-1 overflow-y-auto px-4 py-2 space-y-1"
    >
      <div
        v-for="m in messages"
        :key="m.id"
        class="text-sm"
        :class="classForKind(m.kind)"
        :style="styleForKind(m.kind)"
      >
        <span class="text-xs font-mono-z mr-2" style="color: var(--z-text-lo)">
          {{ formatTime(m.createdAt) }}
        </span>
        <span v-if="m.deletedAt" style="color: var(--z-text-lo); font-style: italic">
          [messaggio rimosso]
        </span>
        <template v-else>
          <span>{{ prefixForKind(m.kind, m.authorDisplay) }}</span>
          <span>{{ m.body }}</span>
        </template>
      </div>
      <div v-if="!messages.length" class="text-xs italic" style="color: var(--z-text-lo)">
        Nessun messaggio in questa area.
      </div>
    </div>
    <form
      class="px-4 py-3 flex gap-2"
      style="border-top: 1px solid var(--z-border)"
      @submit.prevent="submit"
    >
      <div class="flex gap-1">
        <UButton
          type="button"
          size="xs"
          :variant="inputMode === 'say' ? 'solid' : 'ghost'"
          :color="inputMode === 'say' ? 'primary' : 'neutral'"
          @click="inputMode = 'say'"
        >
          Dice
        </UButton>
        <UButton
          type="button"
          size="xs"
          :variant="inputMode === 'emote' ? 'solid' : 'ghost'"
          :color="inputMode === 'emote' ? 'primary' : 'neutral'"
          @click="inputMode = 'emote'"
        >
          Azione
        </UButton>
        <UButton
          type="button"
          size="xs"
          :variant="inputMode === 'ooc' ? 'solid' : 'ghost'"
          :color="inputMode === 'ooc' ? 'primary' : 'neutral'"
          @click="inputMode = 'ooc'"
        >
          OOC
        </UButton>
      </div>
      <UInput
        v-model="input"
        placeholder="Scrivi un messaggio…"
        class="flex-1"
        autocomplete="off"
      />
      <UButton type="submit" size="sm" color="primary">
        Invia
      </UButton>
    </form>
  </section>
</template>
```

- [ ] **Step 2: Typecheck + lint.**

- [ ] **Step 3: Smoke test manuale**

```bash
pnpm dev
```

In due browser (o due incognito):
1. Tab A: crea party come master, entra.
2. Copia seed.
3. Tab B: imposta nickname Anna, join con seed come user.
4. Scrivi "ciao" da Tab B → Tab A deve vedere il messaggio in tempo reale.
5. Cambia modalità a "Azione" o "OOC", invia, verifica rendering.

- [ ] **Step 4: Commit**

```bash
git add app/components/chat/PartyChat.vue
git commit -m "feat: componente partychat con say/emote/ooc"
```

---

## Task 16 — Gate finale Plan 2

- [ ] **Step 1: Green gate**

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Tutti verdi. Integration test `chat.test.ts` incluso.

- [ ] **Step 2: Smoke manuale E2E**

- `pnpm dev`
- Due browser: master + player, chat dal vivo, verifica reconnect (chiudere tab e riaprire).

- [ ] **Step 3: Chiusura plan**

```bash
git commit --allow-empty -m "chore: chiude plan 2 realtime e chat minimale"
```

Al termine, il progetto supporta chat real-time in una singola area. Plan 3 aggiungerà la mappa SVG e il movimento fra aree.

---

## Checklist

- [ ] Task 1 — servizio messages
- [ ] Task 2 — estensione zod ws
- [ ] Task 3 — rate limiter
- [ ] Task 4 — connection registry
- [ ] Task 5 — fan-out helpers
- [ ] Task 6 — ws handler Nitro
- [ ] Task 7 — chat:send + integration test
- [ ] Task 8 — useSession
- [ ] Task 9 — useServerTime
- [ ] Task 10 — stores party/chat
- [ ] Task 11 — usePartyConnection
- [ ] Task 12 — NicknameForm + SessionsList
- [ ] Task 13 — CreatePartyForm + JoinPartyForm + index
- [ ] Task 14 — pagina party + guard + WS connect
- [ ] Task 15 — PartyChat
- [ ] Task 16 — gate finale
