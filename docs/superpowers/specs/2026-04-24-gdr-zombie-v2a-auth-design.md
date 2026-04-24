# GDR Zombie v2a — Auth (registrazione, login, superadmin)

**Goal:** Introdurre account utente permanenti (username + password) come
prerequisito per giocare alla piattaforma. Sostituisce l'attuale flow
"nickname libero in localStorage" con autenticazione server-side a sessione
cookie. Il nickname resta come *display name* scelto per-party, separato
dall'username. Aggiunge una classe utente privilegiata **superadmin** su
tabella separata, con seed automatico al primo deploy e approvazione delle
registrazioni utente.

## Scope

Incluso:
- Tabelle `users`, `superadmins`, `sessions`, `auth_events` + FK su `players`
- Endpoint REST per registrazione, login, logout, cambio password, "me"
- Endpoint admin minimi per approvare registrazioni pending e resettare password
- Pagine `/register`, `/login`, `/me` + modifiche a `/` (redirect se loggato)
- Middleware auth (HTTP + WS via cookie)
- Seed script idempotente del superadmin default
- Clean break: le tabelle esistenti vengono azzerate

Fuori scope (rimandato):
- Email (v2+): niente invio mail, niente verifica email
- Password reset self-service (richiede email o domanda segreta)
- 2FA, OAuth, SSO
- Profilo utente con caratteristiche/abilità (v3 post-auth)
- Multi-party simultaneo (v2b)
- Parties browser pubblico (v2b)
- Admin dashboard completo (v2c) — v2a include solo il minimo per approvare
  registrazioni e resettare password
- Map variants (v2d)
- Mobile-first redesign (v2e)

## Decisioni chiave (dal brainstorming)

- **Account obbligatorio ovunque**, niente guest. Login wall su `/`.
- **Display name per party** separato dall'username.
- **Superadmin su tabella separata** (nessun ruolo elevato sugli user).
- **Seed superadmin con default fissi** (`admin` / `changeme`), login superadmin
  bloccato finché non cambia password.
- **Cookie httpOnly** `gdr_session`, SameSite=Lax. No bearer token in localStorage.
- **Registrazione self-service con approvazione**: utente registra → stato
  pending → superadmin approva dal dashboard → utente può fare login.
- **Deploy = clean break**: migration azzera i dati MVP.
- **Password reset solo via superadmin** (niente email per ora).
- **Sessione 30 giorni sliding**, rate limit login 5/15min per `(username, IP)`.

## Architettura

```
browser (SPA Nuxt)
  │
  │ HTTPS (cookie httpOnly)
  ▼
Nitro
  ├── /api/auth/*        POST register | login | logout | change-password | me
  ├── /api/admin/*       superadmin-only: pending regs, approve, reject, reset
  ├── /api/parties/*     come oggi ma richiede auth utente
  ├── /ws/party          upgrade WS, auth via cookie
  │
  ├── services/auth.ts   hash, verify, token gen
  ├── services/users.ts  CRUD users + status transitions
  ├── services/superadmins.ts CRUD superadmins + seed
  ├── services/sessions.ts create/lookup/extend/revoke
  ├── services/auth-events.ts append-only audit log
  ├── middleware/auth    estrae identità dal cookie, la attacca all'event
  └── db:
        users, superadmins, sessions, auth_events (nuove)
        players.user_id (nuovo FK)
```

## Modello dati

### Nuove tabelle

```ts
users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL,                      -- preserva case originale
  username_lower  TEXT NOT NULL UNIQUE,               -- lookup case-insensitive
  password_hash   TEXT NOT NULL,                      -- bcrypt factor 10
  must_reset      INTEGER NOT NULL DEFAULT 0,         -- boolean: forza change-password al prossimo login
  status          TEXT NOT NULL                       -- 'pending' | 'approved' | 'banned'
                    CHECK (status IN ('pending','approved','banned')),
  created_at      INTEGER NOT NULL,
  approved_at     INTEGER,                            -- null finché pending
  approved_by     TEXT REFERENCES superadmins(id),    -- null se pending o banned
  banned_reason   TEXT                                -- null se status != 'banned'
)
-- INDEX users_status_idx ON (status) per la coda registrazioni pending

superadmins (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL,
  username_lower  TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  must_reset      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
)

sessions (
  token             TEXT PRIMARY KEY,                  -- random 32 bytes b64url
  user_id           TEXT REFERENCES users(id) ON DELETE CASCADE,
  superadmin_id     TEXT REFERENCES superadmins(id) ON DELETE CASCADE,
  created_at        INTEGER NOT NULL,
  last_activity_at  INTEGER NOT NULL,
  expires_at        INTEGER NOT NULL,
  ip                TEXT,
  user_agent        TEXT,
  CHECK (
    (user_id IS NOT NULL AND superadmin_id IS NULL) OR
    (user_id IS NULL AND superadmin_id IS NOT NULL)
  )
)
-- INDEX sessions_user_idx ON (user_id)
-- INDEX sessions_superadmin_idx ON (superadmin_id)
-- INDEX sessions_expires_idx ON (expires_at) per cleanup job

auth_events (
  id                  TEXT PRIMARY KEY,
  actor_kind          TEXT NOT NULL                   -- 'user' | 'superadmin' | 'anonymous'
                        CHECK (actor_kind IN ('user','superadmin','anonymous')),
  actor_id            TEXT,                           -- null se anonymous o tentativo fallito
  username_attempted  TEXT,                           -- per register/login falliti
  event               TEXT NOT NULL,                  -- vedi enum sotto
  ip                  TEXT,
  user_agent          TEXT,
  detail              TEXT,                           -- opzionale: motivo ban, old/new password hash non mai memorizzati
  created_at          INTEGER NOT NULL
)
-- INDEX auth_events_time_idx ON (created_at)
-- INDEX auth_events_actor_idx ON (actor_kind, actor_id, created_at)
```

Enum `auth_events.event`:
- `register` — utente ha compilato /register
- `register_approved` — superadmin ha approvato
- `register_rejected` — superadmin ha rifiutato (o hard-delete del pending)
- `login` — sessione creata ok
- `login_failed` — password errata / username inesistente / account banned / pending
- `logout` — revoca sessione esplicita
- `password_changed_self` — utente ha cambiato la propria
- `password_reset_by_admin` — superadmin ha generato temp password
- `banned` — superadmin ha bannato utente
- `session_expired` — sessione scaduta (registrato al primo tentativo fallito)

### Modifica tabelle esistenti

```ts
players (
  // campi esistenti invariati tranne:
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  // nickname resta, ora ha semantica: "display name per questa party"

  UNIQUE (party_seed, user_id)     -- un account = uno slot per party
  UNIQUE (party_seed, nickname)    -- display name univoco nella party (già esiste)
)
```

Il campo `master_token_hash` su `parties` resta ma non viene più usato per
sbloccare il ruolo master: **il ruolo master è assegnato al creatore della
party** (l'utente loggato che fa POST /api/parties). Non si trasferisce.
(Post-v2b si potrà aggiungere "trasferisci master a altro player").

### Clean break al deploy

La migration `0002` (v2a):
1. Crea le 4 nuove tabelle
2. Azzera `parties, players, messages, areas_state, area_access_bans, weather_overrides, master_actions, bans, zombies, player_positions` con `DELETE FROM …`
3. Aggiunge `user_id` a `players` come NOT NULL (possibile solo dopo azzeramento)
4. Rende `master_token_hash` NULLABLE (già esiste, non si userà più)
5. Seed della riga superadmin default con `must_reset=1`

## HTTP API

### Public (no auth)

**POST `/api/auth/register`**
- Body Zod: `{ username: string(3..32 a-zA-Z0-9_-), password: string(>=8) }`
- 400 invalid_input | 409 username_taken | 429 rate_limited | 202 ok
- Side effect: inserisce `users` row con `status='pending'`, scrive `auth_events` register
- NON crea sessione

**POST `/api/auth/login`**
- Body: `{ username, password }`
- 401 invalid_credentials | 403 account_pending | 403 account_banned | 429 rate_limited
- 200 → setta cookie `gdr_session`. Se `must_reset=1`, response body include `{ mustReset: true }` e il frontend deve obbligatoriamente navigare al form change-password prima di qualsiasi altra azione
- Rate limit: 5 fail/15min per `(username_lower, ip)` → 429 con Retry-After

**POST `/api/auth/logout`**
- Cookie richiesto (di qualunque tipo, user o superadmin)
- Revoca la riga `sessions` e clear cookie lato server (`Set-Cookie: gdr_session=; Max-Age=0`)
- 204

**GET `/api/auth/me`**
- 200 `{ kind: 'user' | 'superadmin', id, username, mustReset }` se autenticato
- 401 se no cookie o sessione scaduta/revocata

### Authenticated user

**POST `/api/auth/change-password`**
- Body: `{ currentPassword, newPassword }` (newPassword >=8)
- 401 wrong_current | 400 same_as_old | 200 ok
- Side: aggiorna hash, azzera `must_reset`, revoca *tutte le altre* sessioni dell'utente tranne quella corrente, log event

### Authenticated superadmin

**GET `/api/admin/registrations`**
- Query: `?status=pending` (default), `approved`, `banned`
- 200 lista utenti con campi base

**POST `/api/admin/registrations/:userId/approve`**
- 200 → imposta `status='approved'`, `approved_at`, `approved_by`, log event

**POST `/api/admin/registrations/:userId/reject`**
- Body opzionale: `{ reason? }`
- 200 → hard-delete della riga users (perché pending, nessun dato collegato)

**POST `/api/admin/users/:userId/ban`**
- Body: `{ reason? }`
- 200 → `status='banned'`, `banned_reason`, revoca tutte le sessioni dell'utente

**POST `/api/admin/users/:userId/reset-password`**
- 200 `{ tempPassword: string }` — password temporanea generata server-side,
  mostrata solo una volta al superadmin nel dashboard. Setta `must_reset=1`,
  revoca tutte le sessioni dell'utente. Audit log.

**POST `/api/admin/change-password`**
- Analogo a `/api/auth/change-password` ma per superadmin. Obbligatorio al
  primo login quando `must_reset=1` (default del seed).

## Cookie e sessione

- Nome: `gdr_session`
- Attributi: `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` (30 giorni)
- `Secure` aggiunto quando `process.env.NODE_ENV === 'production'` (richiede HTTPS)
- Valore: token opaque generato via `crypto.randomBytes(32).toString('base64url')`
- Il server mantiene la riga `sessions` con `expires_at = now + 30d` e
  `last_activity_at` aggiornato a ogni chiamata autenticata
- Sliding: se `last_activity_at > expires_at - 15d`, estendi `expires_at` a
  `now + 30d` (rinnovo silenzioso quando l'utente è attivo)
- Cleanup job: al boot del server, `DELETE FROM sessions WHERE expires_at < now`

## WebSocket auth

- Al `hello` del ws, il server legge il cookie automaticamente via
  `getCookie(peer.request, 'gdr_session')`
- Lookup sessione → userId → player associato alla party richiesta
- Se user non ha ancora un record in `players` per quella party, è la prima
  volta che si connette: viene ammesso solo se è stato già inserito via
  POST /api/parties/:seed/join (che crea la riga `players` con display name).
  Altrimenti 4003 `not_member`
- Il campo `sessionToken` in `HelloEvent` viene rimosso (breaking), il
  `seed` resta

## UI pages

### `/` (home)
- Se non loggato: form di login + link "Registrati" e "Pannello admin"
- Se loggato user: redirect a `/me` (o v2b: `/parties`)
- Se loggato superadmin: redirect a `/admin`

### `/register`
- Form username + password + conferma
- On submit: chiamata a /api/auth/register, on 202 mostra schermata statica
  "Richiesta inviata. Un admin la approverà presto"

### `/login`
- Form username + password. Link a "Registrati"
- On 200: se `mustReset` → /me?force-reset=1, altrimenti → /me

### `/me`
- Mostra username, status (dovrebbe essere approved), data registrazione
- Form change-password
- Bottone logout
- Placeholder "Profilo personaggio (disponibile con caratteristiche in v3)"

### `/admin`
- Se non loggato superadmin: form login separato
- Se mustReset attivo (primo login superadmin): force change-password
- Dashboard minimale v2a:
  - Tab "Registrazioni" — coda pending, approve/reject one-click
  - Tab "Utenti" — lista approved/banned, ban/unban/reset-password
  - Placeholder "Metriche", "Log" (v2c)
  - Logout

### `/party/:seed`
- Richiede sessione user (redirect /login se no)
- Richiede essere già membro della party (redirect / con toast se no member)
- Il flow "crea party" resta in `/` (bottone solo se loggato)
- Il flow "unisciti via seed" viene rimosso dalla home: ora si entra via
  invito diretto `/party/:seed` o via pagina browser (v2b)

## Seed script superadmin

File `scripts/seed-superadmin.ts`:
- Se esiste almeno una riga in `superadmins`: no-op, esce 0
- Altrimenti: inserisce `{ username: 'admin', password_hash: bcrypt('changeme', 10), must_reset: 1 }`
- Chiamato automaticamente dopo `db:migrate` nel `package.json` script:
  `"db:migrate": "drizzle-kit migrate && tsx scripts/seed-superadmin.ts"`

Il server, al boot, se c'è un superadmin con `must_reset=1` e password che
verifica a `changeme`, stampa in console:

```
⚠  SUPERADMIN con credenziali di default (admin/changeme).
   Login web bloccato finché non cambi la password via POST /api/admin/change-password.
```

Il login superadmin blocca effettivamente finché `must_reset=1` E la password
è ancora quella di default (verificata al login): il login succede ma
l'unica azione permessa è change-password; ogni altro endpoint admin risponde
403 `must_reset_first`.

## Rate limiting

Util esistente `createRateLimiter` esteso per supportare chiavi dinamiche.
Nuovi limiter:
- `loginRateLimiter`: windowMs=15*60*1000, maxHits=5, key=`${usernameLower}:${ip}`
- `registerRateLimiter`: windowMs=60*60*1000, maxHits=3, key=`${ip}`
  (protegge dal flooding di pending)

In-memory, niente Redis — coerente col pattern attuale `chatRateLimiter`.

## Audit log

Ogni operazione d'auth scrive una riga in `auth_events`. Letture solo dal
dashboard admin (v2c avrà la UI completa; v2a espone `GET /api/admin/auth-events`
solo per testing, senza UI).

## Error handling

Codici errore nuovi in `shared/errors.ts`:
```ts
'invalid_credentials'
'account_pending'
'account_banned'
'username_taken'
'weak_password'
'invalid_username'
'must_reset_first'
'session_expired'
'not_member'
```

Vanno mappati in `useErrorFeedback.ts` con stringhe italiane user-friendly.

## Testing

### Unit
- Password hash/verify
- Token generation (entropia, no collisioni)
- Rate limiter con chiavi composte
- Status transitions (pending → approved | rejected | banned)

### Integration (tests/integration/)
- `auth/register.test.ts`: valid → 202 + row pending; duplicate username → 409; weak password → 400
- `auth/login.test.ts`: pending → 403; approved → 200 + cookie; wrong pw → 401 + event log; banned → 403; rate limit → 429
- `auth/logout.test.ts`: revoke session, cookie cleared
- `auth/change-password.test.ts`: correct flow + revoke altre sessioni + clear must_reset
- `auth/session.test.ts`: sliding expiration, expired session rejected, cleanup job
- `admin/registrations.test.ts`: pending list, approve, reject
- `admin/users.test.ts`: ban, reset-password flow
- `admin/seed.test.ts`: idempotent, default warning
- `admin/must-reset.test.ts`: login admin con must_reset blocca altri endpoint
- `party/flow.test.ts`: crea party loggato → master; join via display name;
  WS connection con cookie → autentica; senza cookie → 4003

### Manuale (browser)
- Registrazione → pending → login rifiuta
- Superadmin approva → utente può loggare
- Cambio password → altre sessioni revocate (testa con 2 tab)
- Ban → utente loggato viene scollegato (sessione revocata al prossimo tick)
- Superadmin primo login → forzato change-password → dopo cambio l'avviso console sparisce

## Migration deploy

Sequenza operatore su dev:
1. `git pull` v2a
2. `pnpm install`
3. `pnpm db:migrate` → azzera dati, crea nuove tabelle, seed admin
4. `pnpm dev`
5. Browser → /admin → login `admin` / `changeme` → cambio password
6. Smoke test register + approve + login + create party

Su nuovo ambiente prod (futuro):
- Stesso, ma il super admin dovrà avere subito la password cambiata via
  interfaccia web prima di essere operativo (login bloccato altrimenti).

## Rischi noti

- **Rate limit in-memory**: si resetta al restart del server. Acettabile per
  single-node. Se mai andremo multi-node serve Redis.
- **Niente email** = utenti che perdono la password dipendono dal
  superadmin. Accettato (Q7 bundle).
- **Cookie senza CSRF token esplicito**: ci affidiamo a SameSite=Lax. Per
  i form POST sensibili (change-password, ban) il client Nuxt passa
  `Sec-Fetch-Site` naturalmente same-origin. Scope MVP, valutare double-submit
  cookie se in futuro esponiamo API cross-origin.
- **Clean break**: perdita totale dati test. Accettato (Q6=A).

## File che verranno toccati

Nuovi:
- `server/db/schema.ts` — aggiunta tabelle e FK
- `server/db/migrations/0002_auth.sql` — generato da drizzle
- `server/services/auth.ts` — hash, verify, token gen, cookie helpers
- `server/services/users.ts`
- `server/services/superadmins.ts`
- `server/services/sessions.ts`
- `server/services/auth-events.ts`
- `server/utils/auth-middleware.ts` — estrae identità dal cookie
- `server/api/auth/register.post.ts`
- `server/api/auth/login.post.ts`
- `server/api/auth/logout.post.ts`
- `server/api/auth/me.get.ts`
- `server/api/auth/change-password.post.ts`
- `server/api/admin/registrations.get.ts`
- `server/api/admin/registrations/[id]/approve.post.ts`
- `server/api/admin/registrations/[id]/reject.post.ts`
- `server/api/admin/users/[id]/ban.post.ts`
- `server/api/admin/users/[id]/reset-password.post.ts`
- `server/api/admin/change-password.post.ts`
- `server/api/admin/auth-events.get.ts`
- `scripts/seed-superadmin.ts`
- `app/pages/register.vue`
- `app/pages/login.vue`
- `app/pages/me.vue`
- `app/pages/admin/index.vue`
- `app/pages/admin/login.vue`
- `app/stores/auth.ts` — stato client auth, fetch /me al mount
- `app/composables/useAuth.ts` — login/logout/register helpers
- `app/middleware/auth.ts` — Nuxt middleware per pagine protette

Modificati:
- `shared/protocol/http.ts` — schemi register/login/change-password
- `shared/protocol/ws.ts` — rimuove sessionToken da HelloEvent
- `shared/errors.ts` — nuovi codici
- `server/routes/ws/party.ts` — auth via cookie invece di sessionToken
- `server/api/parties/index.post.ts` — richiede user session
- `server/api/parties/[seed]/join.post.ts` — body `{ displayName }`, userId da session
- `package.json` — script `admin:seed`, `admin:reset` CLI per emergenze
- `app/pages/index.vue` — diventa login + create-party hub
- `app/pages/party/[seed].vue` — rimuove lettura sessionToken localStorage
- `app/composables/useSession.ts` — deprecato, sostituito da useAuth (o rimosso se possibile)
- `app/composables/usePartyConnection.ts` — niente sessionToken nell'hello
- `app/composables/useErrorFeedback.ts` — nuovi codici
- `README.md` — sezione auth + deploy con seed admin

## Self-review della spec

**Coverage vs brainstorming**:
- Q1 superadmin su tabella separata con seed ✓
- Q2 account obbligatorio + display name per-party ✓
- Q3 seed script con default fissi e blocco login finché non cambia ✓
- Q4 cookie httpOnly SameSite=Lax ✓
- Q5 self-service con approvazione ✓
- Q6 clean break ✓
- Q7 bundle policy (min pwd 8, username regex, reset via admin, 30d sliding,
  5/15min rate limit, audit) ✓

**Placeholder**: nessuno — tutte le decisioni prese.

**Ambiguità**: `mustReset=1` per il superadmin default — chiarito che blocca
tutti gli endpoint admin tranne change-password.

**Scope**: v2a rimane focalizzato su auth, il dashboard admin è minimale
(solo pending + ban + reset). Multi-party, parties browser, dashboard
completo, map variants, mobile-first sono in v2b/c/d/e distinti.
