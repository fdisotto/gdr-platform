# GDR Zombie v2b — Multi-party simultaneo + parties browser

**Goal:** L'utente autenticato (v2a) può essere membro di più party
contemporaneamente, navigarle via top tab bar, ricevere notifiche cross-party
per DM/whisper diretti. Esiste un browser pubblico `/parties` con filtri e
ricerca per scoprire party aperte. Ogni party può avere ≥1 master pari grado;
il master può aprire la party come pubblica/privata e auto-join /
request-required. Inviti via token monouso. Archiviazione automatica dopo
inattività e manuale dal master.

## Scope

Incluso:
- Schema DB: estensione `parties` (visibility, joinPolicy, archivedAt) +
  soft-delete su `players` (leftAt) + nuove tabelle `party_join_requests` e
  `party_invites`
- API: browser party, leave, archive, promote/demote, join-requests
  (create/approve/reject), invites (create/list/revoke)
- WS: refactor da singleton a factory keyed per partySeed; stores Pinia
  scoping per partySeed
- UI: top tab bar workspace switcher, /parties page, master UI multi-master
  + coda richieste + gestione inviti
- Auto-archive job (plugin Nitro) e archiviazione manuale
- Notifiche cross-party (badge unread + toast DM + suono)

Fuori scope (rimandato):
- Recovery party archiviata da superadmin (v2c)
- Mappe alternative (v2d)
- Mobile-first redesign (v2e)
- Trasferimento "ownership creator" — irrilevante perché tutti i master sono
  pari (decisione Q7-rev)

## Decisioni chiave (dal brainstorming)

| Q | Decisione |
|---|---|
| Q1 | Master sceglie `visibility` = `public` \| `private`. Public visibile nel browser, private solo via link/invite |
| Q2 | Client apre **una WS per party** in parallelo. N party = N WS |
| Q3 | Navigazione: **top tab bar** sopra l'header, switch in-app, badge unread per tab |
| Q4 | Master sceglie `joinPolicy` = `auto` \| `request`. Public+auto = drop-in. Public+request = coda. Private = solo invite-token |
| Q5 | Default limiti: max 5 party/utente, 30 member/party, 100 party sistema, 30d inattività → archiviazione, invite token 7d monouso |
| Q6 | Browser sort=lastActivity desc default, filtri (auto-join only / con slot / mie), ricerca cityName + masterDisplay, paginazione 20 |
| Q7 (rev) | ≥1 master per party, tutti pari. Promote/demote da qualsiasi master. Leave master richiede ≥1 master rimanente o archiviazione. Self-demote permesso se ce ne sono altri |
| Q8 | Badge unread su tab; nessun toast per chat area; toast + suono SOLO per DM/whisper cross-party. Riusa settings notifiche v2a |
| Q9 | Auto-archive cron al boot; manual archive da master; recovery archiviati solo superadmin (v2c). Leave soft-delete riga players (leftAt), libera display name |

## Architettura

```
browser
  ├── tab bar workspace switcher (top)
  ├── /parties browser (lista pubblica)
  ├── /party/<seed> singolo
  └── multipla WS aperta:
       /ws/party (cookie auth) × N party

Nitro
  ├── /api/parties (GET browser, paginato)
  ├── /api/parties POST create (esiste; aggiungi visibility, joinPolicy)
  ├── /api/parties/<seed>/leave POST
  ├── /api/parties/<seed>/archive POST
  ├── /api/parties/<seed>/promote POST
  ├── /api/parties/<seed>/demote POST
  ├── /api/parties/<seed>/join-requests
  │       GET (master), POST (user create)
  │       /<id>/approve POST, /<id>/reject POST
  ├── /api/parties/<seed>/invites
  │       GET (master), POST (master create)
  │       /<id>/revoke POST
  ├── /api/parties/<seed>/join POST (esiste; aggiungi opt inviteToken)
  └── plugin: auto-archive cron al boot

services
  ├── parties.ts (esteso: visibility, joinPolicy, archive, restore, leave)
  ├── players.ts (esteso: leftAt soft-delete, promote/demote)
  ├── party-invites.ts (nuovo)
  └── party-join-requests.ts (nuovo)
```

## Modello dati

### Estensione tabella `parties`

```ts
parties = sqliteTable('parties', {
  // … campi esistenti …
  visibility: text('visibility', { enum: ['public', 'private'] })
    .notNull().default('private'),
  joinPolicy: text('join_policy', { enum: ['auto', 'request'] })
    .notNull().default('request'),
  archivedAt: integer('archived_at')
})
```

Default conservativi: nuove party private + request — il master sceglie
esplicitamente di renderle visibili e drop-in. La home form di create
espone questi due selettori.

### Estensione tabella `players` (soft-delete)

```ts
players = sqliteTable('players', {
  // … campi esistenti …
  leftAt: integer('left_at')  // null = membro attivo, ts = ha lasciato
})
```

Il vincolo `unique (party_seed, nickname)` resta ma la query di lookup
"display name disponibile" deve filtrare `leftAt IS NULL`. SQLite non
permette unique partial come in postgres, quindi la unicità a livello DB
copre entrambi gli stati; la query applicativa esclude i lasciati.

L'unique `(party_seed, user_id)` resta come ora ma con leftAt si permette
re-insert dopo leave: o si fa `UPDATE` con `leftAt = null` e nuovo nick,
oppure prima si **hard-delete la riga lasciata** quando l'utente ri-joina,
mantenendo soft-delete solo come stato transitorio (preferibile per
semplicità: `leftAt` esiste solo finché l'utente non rientra). Per
preservare audit log dei messaggi (che hanno authorPlayerId fk) servono
righe player non eliminate; quindi:

**Strategia finale:** `leftAt` non viene mai cancellato. L'utente che
rientra crea una **nuova riga players** con un nuovo `id`. La vecchia riga
resta come "ex-membro storico" — i messaggi puntano al vecchio playerId
ma il `nickname` del display name viene preservato (storia del passato).
Per consentire stesso nickname al rientro, la query `joinParty` esclude
`leftAt IS NOT NULL` dal check duplicate.

Per il rendering degli `messages` con `authorDisplay`, già usiamo lo
snapshot `authorDisplay` direttamente sulla riga `messages`: non c'è
problema di "chi era questo player" guardando dati storici.

### Nuove tabelle

```ts
partyInvites = sqliteTable('party_invites', {
  id: text('id').primaryKey(),                                 // uuid
  partySeed: text('party_seed').notNull()
    .references(() => parties.seed, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),                     // url-safe random 32b
  createdBy: text('created_by').notNull()                      // userId master
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),                  // 7d default
  usedAt: integer('used_at'),                                  // null = mai usato
  usedBy: text('used_by').references(() => users.id),          // chi l'ha consumato
  revokedAt: integer('revoked_at')                             // null = attivo
}, t => [
  index('party_invites_party_idx').on(t.partySeed),
  index('party_invites_token_idx').on(t.token)
])

partyJoinRequests = sqliteTable('party_join_requests', {
  id: text('id').primaryKey(),
  partySeed: text('party_seed').notNull()
    .references(() => parties.seed, { onDelete: 'cascade' }),
  userId: text('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),                 // nick richiesto
  message: text('message'),                                    // opzionale "perché vorrei entrare"
  createdAt: integer('created_at').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'cancelled'] })
    .notNull(),
  resolvedAt: integer('resolved_at'),
  resolvedBy: text('resolved_by').references(() => users.id),
  rejectReason: text('reject_reason')
}, t => [
  uniqueIndex('party_join_requests_party_user_pending').on(t.partySeed, t.userId, t.status),
  index('party_join_requests_status_idx').on(t.partySeed, t.status)
])
```

(Il vincolo unique `(partySeed, userId, status)` previene multiple richieste
pending per lo stesso utente nella stessa party. Una richiesta pending può
essere `cancelled` dall'utente per riaprire una nuova.)

## API HTTP

Tutte richiedono `requireUser(event)` salvo dove indicato. Master-only check
applicativo: `findPlayerByUserInParty(seed, userId).role === 'master'`.

### Browser

**GET `/api/parties`**
- Query: `?sort=` (lastActivity|members|recent default lastActivity), `?filter[]=` (auto|withSlots|mine), `?q=` (testo, max 64 char), `?cursor=` (opaque), `?limit=` (default 20, max 50)
- Ritorna `{ items: [...], nextCursor: string | null }`
- Filtri di base lato server:
  - Sempre: `archivedAt IS NULL`
  - Se NON `mine`: `visibility = 'public'`
  - Se `mine`: solo party in cui l'utente ha `players` con `leftAt IS NULL` (anche private)
  - Se `auto`: `joinPolicy = 'auto'`
  - Se `withSlots`: count membri attivi < 30
  - `q`: `WHERE city_name LIKE ? OR EXISTS (master display)`
- Ogni item: `{ seed, cityName, visibility, joinPolicy, memberCount, masterDisplays, lastActivityAt, isMember, hasPendingRequest }`

### Membership lifecycle

**POST `/api/parties`** (create — esteso)
- Body: `{ displayName, visibility?, joinPolicy?, cityName? }` (visibility/joinPolicy default rispetto allo schema). Crea party + master player.

**POST `/api/parties/<seed>/join`** (esistente — esteso)
- Body: `{ displayName, inviteToken? }`
- Logica:
  - Party deve esistere e non archiviata
  - Se private + niente token → 403 `forbidden` detail=`private_party`
  - Se private + token: verifica token attivo non scaduto non usato non revocato; consuma (`usedAt`, `usedBy`)
  - Se public + auto: join immediato
  - Se public + request: 403 `forbidden` detail=`request_required`. Il client farà invece POST `/api/parties/<seed>/join-requests`
  - Limiti: max 5 party/utente attive (count `players` con `leftAt IS NULL` & non kicked), max 30 member/party
  - displayName check: nessun altro membro attivo con stesso nickname

**POST `/api/parties/<seed>/leave`**
- Setta `leftAt = now` sulla riga players dell'utente. Se era ultimo master → 409 `conflict` con detail `last_master_must_archive_or_promote`. Decisione gestita lato UI con prompt.

**POST `/api/parties/<seed>/archive`**
- Solo master. Setta `parties.archivedAt = now`. Disconnette tutti i WS aperti su quella party (close 4004 `archived`). Audit log.

### Multi-master

**POST `/api/parties/<seed>/promote`**
- Body: `{ targetUserId }`. Solo master. Promuove player a master.

**POST `/api/parties/<seed>/demote`**
- Body: `{ targetUserId }`. Solo master. Demote master a player. Se `targetUserId` è il chiamante stesso, è self-demote: permesso solo se restano altri master. Se demote dell'ultimo master → 409 `last_master`.

### Join requests (party public + request)

**POST `/api/parties/<seed>/join-requests`** (user)
- Body: `{ displayName, message? }`
- Crea riga pending. 409 se già pending.
- 404 se party non esiste / archiviata / private.

**GET `/api/parties/<seed>/join-requests`** (master)
- Query `?status=pending` default. Lista.

**POST `/api/parties/<seed>/join-requests/<id>/approve`** (master)
- Setta status='approved', resolvedBy. **Side-effect**: chiama `joinParty` internamente con userId della richiesta + displayName richiesto. Se nickname conflict (qualcun altro l'ha preso nel frattempo) → 409 e `rejected` (auto-rifiutata).

**POST `/api/parties/<seed>/join-requests/<id>/reject`** (master)
- Body: `{ reason? }`. Setta status='rejected', rejectReason.

**DELETE `/api/parties/<seed>/join-requests/<id>`** (user che l'ha creata)
- Setta status='cancelled'. Permette nuova richiesta.

### Inviti (party private o anche public per shortcut)

**GET `/api/parties/<seed>/invites`** (master)
- Lista inviti non revoked + status (active/used/expired)

**POST `/api/parties/<seed>/invites`** (master)
- Crea token (random 32 byte b64url), expiresAt = now + 7d. Ritorna `{ token, url: '/party/<seed>?invite=<token>' }`.

**POST `/api/parties/<seed>/invites/<id>/revoke`** (master)
- Setta `revokedAt = now`. Token non più consumabile.

### Limiti

Centralizza in `shared/limits.ts`:
```ts
export const MAX_PARTIES_PER_USER = 5
export const MAX_MEMBERS_PER_PARTY = 30
export const MAX_TOTAL_PARTIES = 100
export const PARTY_INACTIVITY_ARCHIVE_DAYS = 30
export const INVITE_TTL_DAYS = 7
```

Verifiche in `joinParty`/`createParty`. `MAX_TOTAL_PARTIES` è soft check: blocca create con 429 `rate_limited` detail=`system_party_cap`.

### WS

**Refactor `usePartyConnection` da singleton a factory keyed per seed:**

```ts
// app/composables/usePartyConnections.ts (plurale)
export function usePartyConnections() {
  // Map seed → connection state
  return {
    open(seed): Connection,
    close(seed): void,
    closeAll(): void,
    list(): Connection[],
    get(seed): Connection | null
  }
}
```

Ogni `Connection` espone: ws, status, pendingQueue, reconnectAt, retryNow,
notMember, send. Tipi e logica simili all'attuale singleton ma scoped.

**Stores Pinia keyed:** anziché `useChatStore()` singleton, `useChatStore(seed)`
che ritorna istanza dedicata. Pinia supporta keyed stores via passaggio
parametro nel define. Stesso per zombies, player-positions, weather-overrides,
master-tools, party. Al close di una connection, store associato → reset.

**Server WS handler:** nessun cambio. Ogni connessione ws è già scoped per
party via il seed nel hello.

### Auto-archive cron

Plugin Nitro (`server/plugins/party-auto-archive.ts`):
- Al boot e ogni 6h: `UPDATE parties SET archived_at = now WHERE archived_at IS NULL AND last_activity_at < now - 30*86400_000`
- Per ogni party archiviata: kick tutti i ws aperti (close 4004 `archived`)
- Log: numero archiviate

`last_activity_at` è già aggiornato dal flow chat e movimento. Verifico in
`touchParty` se viene chiamato in tutti i casi giusti — se no, lo aggancio.

## UI

### Top tab bar (sempre visibile post-login eccetto su `/login` `/register` `/admin/*`)

Componente `PartyTabBar.vue`:
- Lista delle party in cui sono membro attivo (max 5 tab visibili + dropdown overflow)
- Ogni tab: cityName + badge unread count (rosso) + dot DM pending
- Tab attiva: highlight verde
- Click tab → `router.push('/party/<seed>')` che apre il switch context client (la connessione WS rimane aperta in background per le altre)
- Bottone "+" a destra → `router.push('/parties')` (browser)

### `/parties` browser

`app/pages/parties.vue`:
- Hero con search bar + filtri checkbox + sort dropdown
- Lista paginata (infinite scroll)
- Riga: città, n. membri, ultimo evento, master, badge auto/request, pulsante azione contestuale
- Bottone "Crea nuova party" in alto a destra → modal con form (displayName, visibility, joinPolicy, cityName?)

### Party page (`/party/<seed>`)

- Modifica esistente: rimuove logica "single connection", il context viene
  fornito da `usePartyConnections().get(seed)`. Tutti gli store usano il seed
  come key. Quando `mainView` cambia o `viewedAreaId` cambia, l'effetto è
  scoped solo a quella party.
- Form join (per not_member) come oggi.
- Aggiungi UI master per gestire visibility, joinPolicy, inviti, richieste,
  promote/demote — sezione nel `MasterPanel.vue` esistente:
  - Tab "Party" → switch visibility/joinPolicy + archivia
  - Tab "Master" → lista master + promote/demote + leave/transfer
  - Tab "Inviti" → genera/lista/revoca
  - Tab "Richieste" → coda pending + approve/reject
- Menu nick: aggiunge "Esci da questa party" (con conferma)

### Notifiche cross-party

`useCrossPartyNotifications` composable, registrato a livello app:
- Si abbona ai `message:new` di tutte le connection attive
- Per ogni messaggio non da self:
  - Se party non in primo piano (route corrente !== `/party/<seed>` di quella) → incrementa contatore unread per quel seed
  - Se kind ∈ {dm, whisper} con target=me → push toast (con click → naviga al seed) + suono notifica
- Lo store chat di party-non-foreground continua a buffer i messaggi (resta in memoria, ma niente UI live)

Lo store viewStore.chatCollapsed ora è anche per-party: ogni party ha il suo
stato collapsed (i.e., `useViewStore(seed)`).

## Migration

Migration `0003_v2b_multi_party.sql`:
- ALTER TABLE parties ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'
- ALTER TABLE parties ADD COLUMN join_policy TEXT NOT NULL DEFAULT 'request'
- ALTER TABLE parties ADD COLUMN archived_at INTEGER
- ALTER TABLE players ADD COLUMN left_at INTEGER
- CREATE TABLE party_invites …
- CREATE TABLE party_join_requests …

Niente clean break: i dati v2a sono già nuovi (post-clean-break v2a) e i
default sui nuovi campi gestiscono le righe esistenti.

## Testing

Unit:
- limits constants
- helpers party-invites (token generation, expiresAt logic)

Integration services:
- party-invites: create, list active, revoke, consume
- party-join-requests: create dedup, approve creates membership, reject,
  cancel
- party leave: soft-delete + last-master guard
- promote/demote: transitions, last-master guard, self-demote

Integration API:
- /api/parties browser: filtri, sort, paginazione, visibility, mine
- /api/parties POST con visibility/joinPolicy
- /api/parties/<seed>/join: auto vs request vs invite-token vs private
- /api/parties/<seed>/invites flow
- /api/parties/<seed>/join-requests flow
- /api/parties/<seed>/leave: soft-delete, slot freed, nickname riusabile
- /api/parties/<seed>/archive: kick ws, scompare browser
- /api/parties/<seed>/promote/demote: stati corretti, last-master guard

Integration WS:
- N WS aperte simultanee per N party (lo stesso utente)
- Cross-party message:new → store giusto, non leakage tra party

Unit composables (frontend):
- usePartyConnections factory: open/close, list, badge unread per seed
- useCrossPartyNotifications: increment correctly, route detection

Manuale (smoke):
- 2 utenti, 3 party, switch tra tab, vedere notifiche DM cross-party,
  promote/demote, archivia, browser sort/filtri.

## File toccati

Nuovi:
- `server/services/party-invites.ts`
- `server/services/party-join-requests.ts`
- `server/api/parties/[seed]/leave.post.ts`
- `server/api/parties/[seed]/archive.post.ts`
- `server/api/parties/[seed]/promote.post.ts`
- `server/api/parties/[seed]/demote.post.ts`
- `server/api/parties/[seed]/join-requests/index.{get,post}.ts`
- `server/api/parties/[seed]/join-requests/[id]/approve.post.ts`
- `server/api/parties/[seed]/join-requests/[id]/reject.post.ts`
- `server/api/parties/[seed]/join-requests/[id]/cancel.delete.ts`
- `server/api/parties/[seed]/invites/index.{get,post}.ts`
- `server/api/parties/[seed]/invites/[id]/revoke.post.ts`
- `server/api/parties/index.get.ts` (browser, paginato)
- `server/plugins/party-auto-archive.ts`
- `app/composables/usePartyConnections.ts` (rimpiazza usePartyConnection singleton; il vecchio file sarà wrapper deprecato fino a fine refactor)
- `app/composables/useCrossPartyNotifications.ts`
- `app/components/layout/PartyTabBar.vue`
- `app/pages/parties.vue`
- `app/components/master/PartySettingsTab.vue`
- `app/components/master/MasterListTab.vue`
- `app/components/master/InvitesTab.vue`
- `app/components/master/JoinRequestsTab.vue`
- `shared/limits.ts`
- `shared/protocol/http.ts` — schemi per nuovi endpoint
- `server/db/migrations/0003_v2b.sql` (generata + manualmente integrata)

Modificati:
- `server/db/schema.ts` — estensioni
- `server/services/parties.ts` — visibility/joinPolicy/archive/leave + ensure existing flow
- `server/services/players.ts` — soft-delete leftAt + multi-master + promote/demote
- `server/api/parties/index.post.ts` — accetta visibility/joinPolicy
- `server/api/parties/[seed]/join.post.ts` — accetta inviteToken, gestisce policy
- `app/pages/party/[seed].vue` — usa usePartyConnections().get(seed)
- `app/pages/index.vue` — link "Sfoglia party" → /parties; il form create migra al modal su /parties
- `app/components/layout/PartyHeader.vue` — top tab bar globale (estratto in PartyTabBar)
- `app/components/layout/NickMenu.vue` — voce "Esci da questa party"
- `app/composables/usePartyConnection.ts` — wrapper deprecato verso usePartyConnections
- `app/stores/*.ts` — keyed by seed (chat, party, view, zombies, player-positions, weather-overrides, master-tools)
- `shared/errors.ts` — codici nuovi: `private_party`, `request_required`, `last_master`, `member_limit`, `party_limit`, `archived`, `invite_invalid`
- `app/composables/useErrorFeedback.ts` — toast IT
- `README.md` — sezione multi-party + browser

## Codici errore aggiunti

```
private_party        — party privata, manca invito
request_required     — party in modalità request
last_master          — non puoi demote/leave: sei l'unico master
member_limit         — party piena (30/30)
party_limit          — utente ha già 5 party attive
archived             — party archiviata, niente nuove operazioni
invite_invalid       — invite token non valido / scaduto / usato / revocato
```

Mappa toast IT in `useErrorFeedback`.

## Rischi noti

- **N WS in parallelo**: con 5 party × M utenti, server regge 5M connessioni
  websocket attive. Il design è single-node, in-memory; reggiamo qualche
  centinaio. Multi-node richiederebbe sticky session o pub/sub.
- **Cross-party state pollution**: il refactor stores keyed-by-seed è
  delicato; serve testare bene che chat/zombi/posizioni di party A non
  appaiano in party B.
- **Auto-archive di party con master attivi inattivi 30g**: se nessuno parla
  ma ci sono ancora membri, viene archiviata. Accettato per design (politica
  "GC" automatica). Master può sempre toccarla (basta un messaggio per
  resettare lastActivityAt).
- **Inviti pubblici condivisi su social**: rischio di link distribuiti che
  bypassano controllo master. Mitigato da: monouso, scadenza 7d, revocabili.
  Master può sempre kickare/bannare un fastidioso entrato via invito.

## Out of scope ribadito

- Recovery delle archiviate (v2c)
- Mappe alternative (v2d)
- Mobile-first (v2e)
- Storia "party in cui sono stato e ho lasciato" → fuori dal browser, accesso
  solo via URL diretto se ricorda il seed (in v2c eventualmente lista "le mie
  party storiche")

## Self-review della spec

**Coverage Q1-Q9**: tutte ✓.

**Placeholder**: nessuno.

**Ambiguità**: la unique partial su `players (party_seed, nickname)` con
soft-delete è risolta a livello applicativo (query esclude leftAt).

**Scope check**: focalizzata su multi-party + browser. Recovery party
archiviata espressamente in v2c.

**Hard refactor**: Pinia stores keyed e usePartyConnections sono il
principale rischio implementativo. Plan 8 dovrà partire da questo refactor
come task separati prima di toccare le feature.
