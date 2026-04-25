# GDR Zombie — Plan 8: Multi-party + parties browser (v2b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare la spec v2b — multi-party simultaneo via N WS in parallelo, top tab bar, parties browser pubblico con filtri/ricerca/paginazione, ≥1 master per party, leave + archive + promote/demote, inviti monouso e richieste di adesione, auto-archive cron, notifiche cross-party. Fonda il refactor degli stores Pinia e del composable connection da singleton a keyed-by-seed.

**Architettura:** Migration 0003 estende `parties` (visibility/joinPolicy/archivedAt), aggiunge `players.leftAt`, crea `party_invites` e `party_join_requests`. Services nuovi `party-invites`, `party-join-requests`. API REST CRUD. Plugin Nitro auto-archive ogni 6h. Refactor client: `usePartyConnections()` factory + stores Pinia keyed-by-seed. UI: `PartyTabBar`, `/parties`, master tabs (party settings/master list/invites/requests), cross-party notifications composable.

**Tech Stack:** Nuxt 4 · Nitro · Drizzle ORM · better-sqlite3 · Zod · Pinia · Vitest.

**Riferimenti:**
- Spec: `docs/superpowers/specs/2026-04-25-gdr-zombie-v2b-multi-party-design.md`
- CLAUDE.md per regole collaborazione

**Convenzioni git:** un commit per task, subject italiano imperativo lowercase ≤72 char, no trailer AI, staging mirato. Pre-commit: `pnpm lint && pnpm typecheck && pnpm test` verdi.

**Approccio:** in 5 fasi sequenziali. La fase 1 (refactor stores keyed) è la più rischiosa e tocca quasi tutto il client esistente; va completata e stabilizzata prima di toccare le nuove feature.

---

## FASE 1 — Refactor client: stores e connection keyed-by-seed

L'attuale design è single-party: un singleton `usePartyConnection`, store Pinia singleton (`useChatStore`, `usePartyStore`, ecc). Per N party simultanee serve scoping per seed.

### Task 1 — `usePartyConnections` factory keyed-by-seed

**Files:**
- Create: `app/composables/usePartyConnections.ts`
- Modify: `app/composables/usePartyConnection.ts` → wrapper deprecato che chiama il factory col seed corrente dalla route (per compat temporanea)

- [ ] **Step 1: API**

```ts
// app/composables/usePartyConnections.ts
export interface PartyConnection {
  ws: Ref<WebSocket | null>
  status: Ref<'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'>
  pendingQueue: Ref<Record<string, unknown>[]>
  reconnectAt: Ref<number | null>
  reconnectAttempts: Ref<number>
  notMember: Ref<boolean>
  send(event: Record<string, unknown>): void
  retryNow(): void
}

export interface PartyConnections {
  open(seed: string): PartyConnection      // idempotente
  close(seed: string): void
  closeAll(): void
  list(): { seed: string, conn: PartyConnection }[]
  get(seed: string): PartyConnection | null
}

export function usePartyConnections(): PartyConnections
```

Internamente: `Map<string, PartyConnection>` modulo-level. Ogni connection riusa la logica del singleton attuale (reconnect backoff, pendingQueue, notMember su close 4003), ma scopata al seed. Hello WS resta `{type:'hello',seed}`. Cookie `gdr_session` autentica come prima.

- [ ] **Step 2: handleEvent per-seed**

Il dispatch dei message:new, player:moved, weather:updated, ecc oggi punta agli store singleton; serve una versione che riceve il seed e dispatcha verso store keyed (vedi Task 2). Astrai `handleEvent(seed, data)` con dipendenza dagli store factories.

- [ ] **Step 3: legacy wrapper**

`usePartyConnection.ts` esistente diventa:

```ts
export function usePartyConnection() {
  const route = useRoute()
  const seed = String(route.params.seed ?? '')
  const conns = usePartyConnections()
  return seed ? conns.open(seed) : { /* no-op connection */ }
}
```

Solo per non rompere subito i consumer che lo importano. Migrazione effettiva nei task 4-5.

- [ ] **Step 4: test unit**

`tests/unit/composables/use-party-connections.test.ts` con happy-dom + mock WebSocket. Verifica: open(seed1)+open(seed2) crea 2 connection distinte; close(seed1) lascia seed2 attiva; closeAll resetta tutto; list() ritorna entrambe.

- [ ] **Step 5: commit**

```
refactor: connection client keyed-by-seed
```

### Task 2 — Stores Pinia keyed-by-seed

**Files:**
- Modify: `app/stores/chat.ts`, `app/stores/party.ts`, `app/stores/view.ts`, `app/stores/zombies.ts`, `app/stores/player-positions.ts`, `app/stores/weather-overrides.ts`, `app/stores/master-tools.ts`
- Test: estendere test esistenti con scoping per seed

Pinia setup-store con id dinamico: `defineStore(\`chat-${seed}\`, ...)`. Wrapper helper:

```ts
// app/stores/factory.ts (nuovo)
export function makeKeyed<S>(prefix: string, factory: () => S) {
  const cache = new Map<string, S>()
  return (seed: string): S => {
    let s = cache.get(seed)
    if (!s) {
      const id = `${prefix}-${seed}`
      const useStore = defineStore(id, factory)
      s = useStore() as S
      cache.set(seed, s)
    }
    return s
  }
}
```

- [ ] **Step 1**: introduce `factory.ts` + test
- [ ] **Step 2**: refactor `chat.ts` → `useChatStore(seed)`
- [ ] **Step 3**: refactor `party.ts` → `usePartyStore(seed)`
- [ ] **Step 4**: refactor `view.ts` → `useViewStore(seed)` (mainView, viewedAreaId, chatCollapsed, unreadWhileCollapsed sono per-party)
- [ ] **Step 5**: refactor `zombies.ts`, `player-positions.ts`, `weather-overrides.ts`, `master-tools.ts` → tutti keyed
- [ ] **Step 6**: aggiorna tutti i call site (`grep -rn "useChatStore\(\)" app/` e simili) per passare il seed dal contesto route. La `/party/<seed>` page diventa orchestratore.
- [ ] **Step 7**: test esistenti devono passare un seed di test (`'test-seed'`)
- [ ] **Step 8**: commit

```
refactor: stores pinia keyed-by-seed per multi-party
```

### Task 3 — Adattamento `usePartyConnections` ai nuovi store keyed

Aggiorna handleEvent del task 1 a dispatchare verso store keyed col seed: `useChatStore(seed).append(msg)`, `usePartyStore(seed).hydrate(...)`, ecc.

- [ ] Test integration WS che rimane verde dopo refactor (parti dai test esistenti)
- [ ] Commit:

```
refactor: handleEvent ws dispatcha verso store keyed-by-seed
```

---

## FASE 2 — Schema DB + services

### Task 4 — Schema estensioni + migration 0003

**Files:**
- Modify: `server/db/schema.ts`
- Create: `server/db/migrations/0003_*.sql` (drizzle-kit + manual)
- Modify: `server/db/migrations.generated.ts` (auto via db:bundle)

- [ ] **Step 1**: estendi `parties` con `visibility`, `joinPolicy`, `archivedAt`
- [ ] **Step 2**: aggiungi `players.leftAt`
- [ ] **Step 3**: nuove tabelle `partyInvites`, `partyJoinRequests` come da spec
- [ ] **Step 4**: `pnpm db:generate` + integra DELETE FROM se serve (qui no — niente clean break, default sui nuovi campi)
- [ ] **Step 5**: `pnpm db:migrate` su DB locale, verifica `.schema parties`
- [ ] **Step 6**: typecheck + test verdi
- [ ] **Step 7**: commit

```
chore: schema + migration 0003 visibility, join-policy, invites, requests
```

### Task 5 — Service `party-invites`

**Files:**
- Create: `server/services/party-invites.ts`
- Test: `tests/integration/services/party-invites.test.ts`

API:
```ts
createInvite(db, { partySeed, createdBy }): InviteRow         // genera token random 32b b64url, expiresAt = now + 7d
listInvites(db, partySeed): InviteRow[]                       // tutti, anche scaduti/usati
findActiveByToken(db, token): InviteRow | null                // not used not revoked not expired
consumeInvite(db, id, byUserId): void                         // setta usedAt, usedBy
revokeInvite(db, id): void                                    // setta revokedAt
```

- [ ] Test TDD copre: create produce token unique, findActiveByToken filtra correttamente, consume idempotente (re-consume → null), revoke + consume tentato → null
- [ ] Commit

```
feat: service party-invites con token monouso 7d
```

### Task 6 — Service `party-join-requests`

**Files:**
- Create: `server/services/party-join-requests.ts`
- Test: `tests/integration/services/party-join-requests.test.ts`

API:
```ts
createRequest(db, { partySeed, userId, displayName, message? }): JoinRequestRow
                                                              // 409 se ne esiste già pending dello stesso (party,user)
listRequests(db, partySeed, status = 'pending'): JoinRequestRow[]
findRequest(db, id): JoinRequestRow | null
approveRequest(db, id, resolvedBy): void
rejectRequest(db, id, resolvedBy, reason?): void
cancelRequest(db, id, byUserId): void                          // solo se userId == richiedente
```

- [ ] Test
- [ ] Commit

```
feat: service party-join-requests con stato pending/approved/rejected/cancelled
```

### Task 7 — Estendi service `parties`

**Files:**
- Modify: `server/services/parties.ts`
- Test: estendi `tests/integration/services/parties.test.ts` o equiv.

Modifiche `createParty`:
- Accetta `visibility?` e `joinPolicy?`. Default `private` + `request`.

Nuove funzioni:
```ts
archiveParty(db, seed): void                                   // setta archivedAt = now
restoreParty(db, seed): void                                   // azzera archivedAt (per v2c)
listPartiesForBrowser(db, opts): { items, nextCursor }         // implementazione paginata cursore-based su lastActivityAt desc
countActivePartiesForUser(db, userId): number                  // membership leftAt IS NULL && !isKicked
isMaster(db, seed, userId): boolean
listMasters(db, seed): PlayerRow[]                             // attivi
```

- [ ] Test integration per ognuna
- [ ] Commit

```
feat: party service esteso visibility/policy/archive/list-browser
```

### Task 8 — Estendi service `players` con leftAt + promote/demote

**Files:**
- Modify: `server/services/players.ts`
- Test: estendi

Modifiche:
- `joinParty` controlla anche limiti membership (max 5 attive per user, max 30 per party)
- `findPlayerByUserInParty` filtra `leftAt IS NULL`
- Nuove:
```ts
leaveParty(db, seed, userId): void                             // setta leftAt = now sull'attiva. Throw se ultimo master.
promoteToMaster(db, seed, targetUserId, byUserId): void        // role -> 'master'
demoteFromMaster(db, seed, targetUserId, byUserId): void       // role -> 'user'. Throw se ultimo master.
```

Logica multi-master:
- `listMasters` esclude leftAt e isKicked
- promote/demote scrivono audit `master_actions`

- [ ] Test
- [ ] Commit

```
feat: players soft-delete leftAt + promote/demote multi-master
```

### Task 9 — Codici errore + limiti + schemi http

**Files:**
- Modify: `shared/errors.ts` — aggiungi: `private_party`, `request_required`, `last_master`, `member_limit`, `party_limit`, `archived`, `invite_invalid`
- Create: `shared/limits.ts` con costanti
- Modify: `shared/protocol/http.ts` — schemi Zod nuovi:
  - `BrowserQueryParams` (sort, filter, q, cursor, limit)
  - `CreateInviteResponse` `{ id, token, url, expiresAt }`
  - `JoinRequestCreateBody` `{ displayName, message? }`
  - `RejectRequestBody` `{ reason? }`
  - `PromoteBody` `{ targetUserId }`
  - `CreatePartyBody` esteso `{ displayName, visibility?, joinPolicy?, cityName? }`
  - `JoinPartyBody` esteso `{ displayName, inviteToken? }`

- [ ] Test schemi
- [ ] Commit

```
feat: codici errore, limiti, schemi http v2b
```

---

## FASE 3 — API endpoint

### Task 10 — GET /api/parties (browser paginato)

**Files:**
- Create: `server/api/parties/index.get.ts`
- Test: `tests/integration/api/parties-browser.test.ts`

- [ ] Logica: `requireUser`, parse query, costruisci WHERE in base ai filtri, JOIN per `master_displays` (concatenazione lato app), paginazione cursor su `lastActivityAt`
- [ ] Test: party private non appaiono se NON `mine`; auto-join filtro funziona; ricerca su cityName funziona; paginazione coerente; `isMember` flag corretto; `hasPendingRequest` corretto
- [ ] Commit

```
feat: endpoint browser /api/parties paginato e filtrato
```

### Task 11 — POST /api/parties create esteso

**Files:**
- Modify: `server/api/parties/index.post.ts`
- Test: estendi

- [ ] Accetta visibility + joinPolicy nel body. Default come schema. Limiti rispettati (party_limit per utente, party_limit sistema).
- [ ] Commit

```
feat: create party accetta visibility e join-policy
```

### Task 12 — POST /api/parties/[seed]/join esteso

**Files:**
- Modify: `server/api/parties/[seed]/join.post.ts`
- Test: estendi

- [ ] Logica come spec: archived → 410 archived; private senza inviteToken → 403 private_party; private con token: consume invite; public+request → 403 request_required (client deve usare /join-requests); public+auto → join immediato. Limiti.
- [ ] Test ogni branch
- [ ] Commit

```
feat: join supporta invite-token e join-policy
```

### Task 13 — POST /api/parties/[seed]/leave

**Files:**
- Create: `server/api/parties/[seed]/leave.post.ts`
- Test: `tests/integration/api/party-leave.test.ts`

- [ ] requireUser; chiama `leaveParty`; gestisce `last_master` con 409
- [ ] Test: leave normale, leave ultimo master → 409, leave non-membro → 404
- [ ] Commit

```
feat: endpoint leave party con guard ultimo master
```

### Task 14 — POST /api/parties/[seed]/archive

**Files:**
- Create: `server/api/parties/[seed]/archive.post.ts`
- Test: `tests/integration/api/party-archive.test.ts`

- [ ] requireUser + isMaster. Setta archivedAt. Disconnetti tutti i ws aperti per quel seed (close 4004 `archived`). Audit log.
- [ ] Test: master archivia ok; non-master 403; party già archived → 409
- [ ] Commit

```
feat: endpoint archive party con kick ws e audit
```

### Task 15 — Promote / demote master

**Files:**
- Create: `server/api/parties/[seed]/promote.post.ts`
- Create: `server/api/parties/[seed]/demote.post.ts`
- Test: `tests/integration/api/master-promote.test.ts`

- [ ] requireUser + isMaster (chiamante). Body `{ targetUserId }`. Self-demote permesso solo se non ultimo master.
- [ ] Audit master_actions
- [ ] Test: promote, demote, self-demote ok con altri master, last-master guard 409
- [ ] Commit

```
feat: endpoint promote/demote master con guardia
```

### Task 16 — Join requests endpoints

**Files:**
- Create: `server/api/parties/[seed]/join-requests/index.get.ts`
- Create: `server/api/parties/[seed]/join-requests/index.post.ts`
- Create: `server/api/parties/[seed]/join-requests/[id]/approve.post.ts`
- Create: `server/api/parties/[seed]/join-requests/[id]/reject.post.ts`
- Create: `server/api/parties/[seed]/join-requests/[id]/cancel.delete.ts`
- Test: `tests/integration/api/join-requests.test.ts`

- [ ] GET list (master). POST create (user, dedup). approve (master) → invoca `joinParty` interno + setta status. reject (master). cancel (user, solo proprie pending).
- [ ] Test flow end-to-end: user request → master approva → user diventa membro
- [ ] Commit

```
feat: endpoint join-requests crud con approva/rifiuta/cancel
```

### Task 17 — Invites endpoints

**Files:**
- Create: `server/api/parties/[seed]/invites/index.get.ts`
- Create: `server/api/parties/[seed]/invites/index.post.ts`
- Create: `server/api/parties/[seed]/invites/[id]/revoke.post.ts`
- Test: `tests/integration/api/invites.test.ts`

- [ ] GET list (master). POST create (master) → ritorna token + url. revoke (master).
- [ ] Test: create + use via /join → joined; revoke + use → 403 invite_invalid; expired → 403; reuse → 403
- [ ] Commit

```
feat: endpoint invites crud + revoke
```

### Task 18 — Plugin Nitro auto-archive

**Files:**
- Create: `server/plugins/party-auto-archive.ts`
- Test: `tests/integration/plugins/party-auto-archive.test.ts`

- [ ] Al boot e ogni 6h via setInterval: query party con `archivedAt IS NULL && lastActivityAt < now - 30d`, archivia. Per ognuna: kick ws (registry).
- [ ] Test con freezing del tempo / mock di Date.now
- [ ] Commit

```
feat: plugin nitro auto-archive party inattive 30g
```

---

## FASE 4 — UI client

### Task 19 — Nuxt: usePartyConnections + handleEvent applicati

Migra `app/pages/party/[seed].vue` a usare `usePartyConnections().get(seed)` e store keyed-by-seed (anche se `usePartyConnection` legacy rimane fino al cleanup finale).

- [ ] Verifica WS singola in /party/<seed> ancora funzioni dopo il refactor
- [ ] Commit

```
refactor: party page usa usePartyConnections().get(seed)
```

### Task 20 — Top tab bar `PartyTabBar.vue`

**Files:**
- Create: `app/components/layout/PartyTabBar.vue`
- Modify: `app/layouts/default.vue` (se non esiste, crea) o `app/app.vue` per montarlo sopra tutto

- [ ] Lista delle party in cui sono membro attivo. Endpoint nuovo o riuso `/api/parties?filter=mine`. Componente carica al mount + listener su events `joined-party` / `left-party` per refresh
- [ ] Tab attiva: route corrente match `/party/<seed>`. Click: `router.push('/party/<seed>')`
- [ ] Badge unread per seed: legge dal `useViewStore(seed).unreadWhileCollapsed` o un counter dedicato (preferibile: counter dedicato per "tab non in foreground")
- [ ] Bottone "+" → `/parties`
- [ ] Hidden su `/login`, `/register`, `/admin/*` (gestito tramite v-if su useRoute().path)
- [ ] Commit

```
feat: top tab bar workspace switcher
```

### Task 21 — Composable `useCrossPartyNotifications`

**Files:**
- Create: `app/composables/useCrossPartyNotifications.ts`
- Test: `tests/unit/composables/use-cross-party-notifications.test.ts`

- [ ] Si abbona ai `message:new` di tutte le connection aperte. Per ogni messaggio non-self:
  - Se party non in foreground → incrementa unread count per seed
  - Se kind ∈ {dm, whisper} con target=me → toast con click → naviga al seed + suono notifica (rispetta settings)
- [ ] Commit

```
feat: composable cross-party notifications
```

### Task 22 — Pagina `/parties` browser

**Files:**
- Create: `app/pages/parties.vue`

- [ ] Search bar + filtri checkbox + sort dropdown. Infinite scroll (intersection observer)
- [ ] Riga: cityName · n. membri/30 · ultima attività relativa · master display · badge auto/request · pulsante azione
- [ ] Bottone "Crea nuova party" → modal con form (displayName, visibility, joinPolicy, cityName?)
- [ ] Pulsante "Entra"/"Richiedi"/"Già membro" contestuale
- [ ] Commit

```
feat: pagina /parties browser con filtri e ricerca
```

### Task 23 — Master UI per multi-master, settings, inviti, richieste

**Files:**
- Modify: `app/components/master/MasterPanel.vue` — aggiungi tabs nuovi
- Create: `app/components/master/PartySettingsTab.vue` (visibility/joinPolicy/archive)
- Create: `app/components/master/MasterListTab.vue` (lista master, promote/demote, leave)
- Create: `app/components/master/InvitesTab.vue` (genera/lista/revoca, link copy-to-clipboard)
- Create: `app/components/master/JoinRequestsTab.vue` (coda + approve/reject)

- [ ] Test manuale flow ognuno
- [ ] Commit

```
feat: master ui party-settings, master-list, invites, join-requests
```

### Task 24 — Form home + party page: visibility/joinPolicy + leave

**Files:**
- Modify: `app/pages/index.vue` — aggiungi select visibility/joinPolicy nel form create
- Modify: `app/components/layout/NickMenu.vue` — voce "Esci da questa party" con conferma

- [ ] Commit

```
feat: home form crea con visibility/policy + nick menu leave
```

### Task 25 — Error feedback IT per nuovi codici

**Files:**
- Modify: `app/composables/useErrorFeedback.ts`

Toast: private_party, request_required, last_master, member_limit, party_limit, archived (blocking), invite_invalid.

- [ ] Commit

```
feat: feedback italiano per errori v2b
```

### Task 26 — Cleanup legacy `usePartyConnection`

**Files:**
- Delete: `app/composables/usePartyConnection.ts` (wrapper deprecato)
- Modify: tutti i call site residui per usare `usePartyConnections()`

- [ ] grep finale `usePartyConnection\(\)` → 0 occorrenze
- [ ] Commit

```
refactor: rimuove usePartyConnection legacy singleton
```

---

## FASE 5 — Smoke + docs + gate

### Task 27 — Smoke manuale end-to-end

Checklist (no commit):

- [ ] `pnpm db:migrate` → 0003 applicata
- [ ] User A registra+approva (admin)+login
- [ ] User A crea party "Alpha" public auto-join → entra
- [ ] User A crea party "Bravo" private request → entra
- [ ] User B registra+approva+login → vede "Alpha" nel browser, NON vede "Bravo"
- [ ] User B click "Entra" su Alpha → drop-in
- [ ] User A crea party "Charlie" public request → User B prova join → richiesta inviata
- [ ] User A in Charlie → tab Richieste mostra B → approva → B membro
- [ ] User A in Bravo → tab Inviti → genera link → copia → User B apre link → join ok
- [ ] User B ora ha 3 party → top tab bar mostra 3 tab + badge
- [ ] User A scrive in Alpha → User B in primo piano su Bravo vede badge unread su Alpha
- [ ] User A scrive `/dm B testo` in Charlie → User B (in Bravo) vede toast + suono
- [ ] User A in Alpha → tab Master → promuove B → B è master in Alpha
- [ ] User A in Alpha → demote di sé → resta master B → A è user
- [ ] User A in Alpha → leave → ok
- [ ] User B in Alpha → tab Settings → archivia → Alpha scompare dal browser
- [ ] Test limite party: User B prova create 6° party → 429 party_limit

### Task 28 — README aggiornato

**Files:**
- Modify: `README.md`

Aggiungi sezione "Multi-party (v2b)": browser, visibility/policy, inviti, richieste, multi-master, archive.

- [ ] Commit

```
docs: sezione multi-party v2b in readme
```

### Task 29 — Gate finale plan 8

- [ ] `pnpm lint && pnpm typecheck && pnpm test` verdi
- [ ] Test count baseline 324 + nuovi (~50) = ~370+
- [ ] Smoke task 27 ok
- [ ] Commit:

```
git commit --allow-empty -m "chore: chiude plan 8 multi-party v2b"
```

Optional tag: `v0.3.0-multi-party`

---

## Checklist riassuntiva

- [ ] Task 1 — usePartyConnections factory
- [ ] Task 2 — stores Pinia keyed-by-seed
- [ ] Task 3 — handleEvent ws keyed
- [ ] Task 4 — schema + migration 0003
- [ ] Task 5 — service party-invites
- [ ] Task 6 — service party-join-requests
- [ ] Task 7 — service parties esteso
- [ ] Task 8 — service players esteso
- [ ] Task 9 — errors + limits + schemi
- [ ] Task 10 — GET /api/parties browser
- [ ] Task 11 — POST /api/parties create esteso
- [ ] Task 12 — POST .../join esteso
- [ ] Task 13 — POST .../leave
- [ ] Task 14 — POST .../archive
- [ ] Task 15 — promote/demote
- [ ] Task 16 — join-requests crud
- [ ] Task 17 — invites crud
- [ ] Task 18 — plugin auto-archive
- [ ] Task 19 — party page usa usePartyConnections
- [ ] Task 20 — PartyTabBar
- [ ] Task 21 — useCrossPartyNotifications
- [ ] Task 22 — /parties browser page
- [ ] Task 23 — master UI nuovi tab
- [ ] Task 24 — home form + leave nick menu
- [ ] Task 25 — error feedback IT
- [ ] Task 26 — cleanup legacy connection
- [ ] Task 27 — smoke manuale
- [ ] Task 28 — README
- [ ] Task 29 — gate
