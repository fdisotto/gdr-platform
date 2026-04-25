# GDR Zombie — Plan 9: Admin dashboard completo (v2c)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare la spec v2c — dashboard admin completo con full control sulle party, multi-superadmin via UI, system settings runtime, time-series + counters + CSV export, maintenance mode, sidebar nav su sotto-route `/admin/*`. Refactor dei limiti da hardcoded a lookup runtime via `system_settings`.

**Architettura:** Migration 0004 aggiunge `system_settings`, `daily_metrics`, `admin_actions`, e `revokedAt` su `superadmins`. Nuovi services per settings cache, audit admin, metrics computate. Endpoint REST `/api/admin/*` espansi (parties CRUD, admins, settings, metrics, export, maintenance) + endpoint pubblico `/api/system/status`. Plugin Nitro: cron daily-metrics e maintenance-guard. UI: layout `app/layouts/admin.vue` con sidebar nav, sub-pagine `/admin/dashboard`, `/admin/users`, `/admin/parties`, `/admin/admins`, `/admin/registrations`, `/admin/metrics`, `/admin/settings`, `/admin/audit`. Pagina pubblica `/maintenance` per non-admin durante manutenzione.

**Tech Stack:** Nuxt 4 · Nitro · Drizzle ORM · better-sqlite3 · Zod · Pinia · Vitest.

**Riferimenti:**
- Spec: `docs/superpowers/specs/2026-04-25-gdr-zombie-v2c-admin-design.md`
- CLAUDE.md per regole collaborazione

**Convenzioni git:** un commit per task, subject italiano imperativo lowercase ≤72 char, no trailer AI, staging mirato. Pre-commit: `pnpm lint && pnpm typecheck && pnpm test` verdi.

**Approccio:** 4 fasi sequenziali. Fase 1 (foundation services) e Fase 2 (API) sono indipendenti dalla UI; Fase 3 (UI) consuma quanto creato. Fase 4 = smoke + README + gate.

---

## FASE 1 — Foundation (schema + services + integrazione runtime)

### Task 1 — Schema estensioni + migration 0004

**Files:**
- Modify: `server/db/schema.ts`
- Create: `server/db/migrations/0004_*.sql` (drizzle-kit + manual seed)
- Modify: `server/db/migrations.generated.ts` (auto)

- [ ] **Step 1**: aggiungi `revokedAt`, `revokedBy` su `superadmins`
- [ ] **Step 2**: aggiungi tabelle `systemSettings`, `dailyMetrics`, `adminActions` come da spec
- [ ] **Step 3**: `pnpm db:generate`. Edita SQL per aggiungere INSERT seed default in `system_settings` (idempotente: usa `INSERT OR IGNORE`)
- [ ] **Step 4**: `pnpm db:migrate` su DB locale, verifica con `sqlite3 .schema system_settings`, `SELECT * FROM system_settings` → vedi default
- [ ] **Step 5**: typecheck + test verdi
- [ ] **Step 6**: commit

```
chore: schema + migration 0004 system-settings, daily-metrics, admin-actions
```

### Task 2 — Service `system-settings`

**Files:**
- Create: `server/services/system-settings.ts`
- Test: `tests/integration/services/system-settings.test.ts`

API (TDD):
```ts
export interface SettingValue { value: unknown, updatedAt: number, updatedBy: string | null }
export type SettingKey = string  // free string, validato dai consumer

getSetting(db, key, defaultValue?): unknown                    // cache in-memory
getSettingNumber(db, key, defaultValue: number): number
getSettingBoolean(db, key, defaultValue: boolean): boolean
getSettingString(db, key, defaultValue: string): string
listSettings(db): Record<string, SettingValue>
setSetting(db, key, value, updatedBy): void                    // invalida cache
invalidateCache(): void                                         // helper per test
```

Test: cache hit, miss → DB lookup, set invalida cache, defaults se chiave mancante, type accessor coercion.

Commit: `feat: service system-settings con cache in-memory e default fallback`

### Task 3 — Service `admin-actions`

**Files:**
- Create: `server/services/admin-actions.ts`
- Test: `tests/integration/services/admin-actions.test.ts`

```ts
export type AdminActionKind = 'party.edit' | 'party.archive' | ... // unione completa
logAdminAction(db, { superadminId, action, targetKind?, targetId?, payload? }): void
listAdminActions(db, opts: { limit?, before? }): AdminActionRow[]
listAdminActionsByActor(db, superadminId, limit?): AdminActionRow[]
```

Commit: `feat: service admin-actions per audit log dashboard`

### Task 4 — Service `daily-metrics`

**Files:**
- Create: `server/services/daily-metrics.ts`
- Test: `tests/integration/services/daily-metrics.test.ts`

```ts
export interface DailyMetricsRow { date: string, /* tutti i campi */ }

computeDailyMetrics(db, dateUtc: string): DailyMetricsRow      // aggrega counts
upsertDailyMetrics(db, row: DailyMetricsRow): void
getDailyMetrics(db, dateUtc): DailyMetricsRow | null
listDailyMetrics(db, fromDate, toDate): DailyMetricsRow[]      // range inclusivo
recoverMissingDays(db, days = 30): number                      // ritorna n. giorni recuperati
```

Test:
- seed DB con utenti/party/messaggi a vari ts → computeDailyMetrics di un giorno specifico ritorna count corretti
- recoverMissingDays inserisce solo giorni mancanti

Commit: `feat: service daily-metrics con aggregazione e recovery`

### Task 5 — Estendi `superadmins` service con revokedAt + middleware filter

**Files:**
- Modify: `server/services/superadmins.ts` — aggiungi `revokeSuperadmin`, `findActiveSuperadminByUsername`, `findActiveSuperadminById`, `listActiveSuperadmins`, `countActiveSuperadmins`. Le esistenti `findSuperadminByUsername` etc continuano a esistere ma per /admin auth usiamo le `Active*` versions.
- Modify: `server/utils/auth-middleware.ts` — `requireSuperadmin` deve usare il filtro active (escludere revokedAt non null)
- Test: estendi `tests/integration/services/superadmins.test.ts`

- [ ] Test: revoke → findActiveById ritorna null. countActiveSuperadmins corretto.
- [ ] Test middleware: superadmin revocato → 401 anche con cookie valido.

Commit: `feat: superadmins revokedAt con filtro middleware auth`

### Task 6 — Estendi `parties` service: hardDelete + transferMaster

**Files:**
- Modify: `server/services/parties.ts`
- Test: estendi i test relativi

```ts
hardDeleteParty(db, seed): void                                // DELETE FROM parties — cascade FK
transferMaster(db, seed, fromUserId, toUserId): void           // promote target + demote source
```

Test:
- hardDeleteParty cancella party + cascade pulisce players, messages, invites, ecc
- transferMaster: target deve essere member attivo, source deve essere master attivo

Commit: `feat: parties service hard-delete e transfer-master`

### Task 7 — Codici errore + integrazione limiti runtime

**Files:**
- Modify: `shared/errors.ts` — aggiungi `maintenance`, `last_admin`, `setting_invalid`
- Modify: `server/services/players.ts` — sostituisci `MAX_PARTIES_PER_USER`, `MAX_MEMBERS_PER_PARTY` con `getSettingNumber('limits.maxPartiesPerUser', MAX_PARTIES_PER_USER)`. Stesso per altre costanti usate nei limit check.
- Modify: `server/services/parties.ts` — stesso per `MAX_TOTAL_PARTIES`
- Modify: `server/services/party-invites.ts` — `INVITE_TTL_DAYS` runtime
- Modify: `server/api/auth/register.post.ts` e `login.post.ts` — `loginRateMaxFailures`/`registerRateMaxPerHour` runtime (rate limiter wrap che legge settings)
- Modify: `server/utils/http.ts` — mapping nuovi codici a status code
- Modify: `app/composables/useErrorFeedback.ts` — toast IT per nuovi codici (`maintenance` blocking, `last_admin` warn, `setting_invalid` warn)

- [ ] Test: cambiando il setting `limits.maxPartiesPerUser` a 2, l'utente con 2 party non può creare la 3°
- [ ] Commit

```
feat: limiti party runtime via system-settings + nuovi codici errore
```

---

## FASE 2 — API admin

### Task 8 — Endpoints `/api/admin/parties` CRUD

**Files:**
- Create: `server/api/admin/parties/index.get.ts` (list paginato)
- Create: `server/api/admin/parties/[seed]/index.get.ts` (dettaglio)
- Create: `server/api/admin/parties/[seed]/edit.post.ts` (visibility/joinPolicy/cityName)
- Create: `server/api/admin/parties/[seed]/archive.post.ts`
- Create: `server/api/admin/parties/[seed]/restore.post.ts`
- Create: `server/api/admin/parties/[seed]/transfer-master.post.ts`
- Create: `server/api/admin/parties/[seed]/index.delete.ts`
- Test: `tests/integration/api/admin/parties-admin.test.ts`

Per ogni endpoint: `requireSuperadmin`, audit log dell'azione, payload JSON contestuale. Delete richiede `body.confirm === 'DELETE'`. Archive kicka ws aperti come T14 v2b.

Commit: `feat: endpoint admin parties list/edit/transfer/restore/archive/delete`

### Task 9 — Endpoints `/api/admin/admins` (multi-superadmin)

**Files:**
- Create: `server/api/admin/admins/index.get.ts` (list)
- Create: `server/api/admin/admins/index.post.ts` (elevate user)
- Create: `server/api/admin/admins/[id]/revoke.post.ts`
- Test: `tests/integration/api/admin/admins.test.ts`

Logica elevate: prendi `targetUserId` dal body, lookup `users.findById`, se non approved → 400. Genera nuovo `superadmin.id` (uuid), copia username + passwordHash. mustReset=false. Audit.

Revoke: setta revokedAt + revokedBy. Revoca tutte le session attive del superadmin (via `revokeAllForSuperadmin`). 409 `last_admin` se è l'unico attivo.

Commit: `feat: admin endpoint per gestione multi-superadmin con elevate/revoke`

### Task 10 — Endpoints `/api/admin/settings`

**Files:**
- Create: `server/api/admin/settings/index.get.ts`
- Create: `server/api/admin/settings/[key].post.ts`
- Test: `tests/integration/api/admin/settings.test.ts`

GET: ritorna mappa completa `{ key: { value, updatedAt, updatedBy } }`.

POST: body `{ value }`. Server-side validation per chiave nota:
- `limits.*`: int positivo, range ragionevole (es. maxPartiesPerUser 1-50)
- `features.*`: boolean
- `system.maintenanceMode`: boolean
- `system.maintenanceMessage`: string ≤500 char

Commit: `feat: admin endpoint settings get/set con validazione tipi`

### Task 11 — Endpoints `/api/admin/metrics`

**Files:**
- Create: `server/api/admin/metrics/counters.get.ts`
- Create: `server/api/admin/metrics/timeseries.get.ts`
- Test: `tests/integration/api/admin/metrics.test.ts`

Counters: snapshot live aggregato. Timeseries: query `daily_metrics` filtrata per range.

Commit: `feat: admin endpoint metrics counters e timeseries`

### Task 12 — Endpoint export CSV

**Files:**
- Create: `server/api/admin/export.get.ts`
- Test: `tests/integration/api/admin/export.test.ts`

Stream CSV. Helper `csvEscape(row[]): string`. Header `Content-Type: text/csv`, `Content-Disposition: attachment; filename=...`.

Per kind:
- `users`: id, username, status, createdAt, approvedAt, bannedReason
- `parties`: seed, cityName, visibility, joinPolicy, createdAt, archivedAt, memberCount, lastActivityAt
- `audit`: timestamp, kind (admin|auth), actor, action, targetKind, targetId, detail
- `messages`: id, partySeed, kind, authorDisplay, areaId, body, createdAt

Limit 50000 righe; cursor per chunk successivi.

Commit: `feat: admin endpoint export csv per users/parties/audit/messages`

### Task 13 — Maintenance mode toggle + middleware server

**Files:**
- Create: `server/api/admin/maintenance.post.ts`
- Create: `server/plugins/maintenance-guard.ts` (middleware Nitro)
- Test: `tests/integration/api/admin/maintenance.test.ts`

Toggle: aggiorna `system.maintenanceMode` + `system.maintenanceMessage`. Audit.

Plugin: ad ogni request HTTP, prima del routing handler, controlla setting. Se true:
- pass through per: `/api/admin/*`, `/api/auth/login` e `/api/auth/me` se utente è superadmin (deve poter loggarsi anche in maintenance)
- 503 JSON `{ code: 'maintenance', message }` per tutti gli altri /api/*
- la SPA ha la sua logica (T25)

Test: with maintenance on, GET /api/parties → 503, GET /api/admin/parties con superadmin cookie → 200.

Commit: `feat: maintenance mode toggle e middleware server`

### Task 14 — Endpoint pubblico `/api/system/status`

**Files:**
- Create: `server/api/system/status.get.ts`

Pubblico, ritorna `{ maintenanceMode: boolean, maintenanceMessage: string, registrationEnabled: boolean, partyCreationEnabled: boolean, voiceChatEnabled: boolean, serverTime: number }`. Utile al client per pre-flight check senza autenticazione.

Commit: `feat: endpoint pubblico /api/system/status`

### Task 15 — Plugin Nitro daily-metrics cron

**Files:**
- Create: `server/plugins/daily-metrics.ts`
- Test: integrazione separata (manuale o test con mock di Date)

Logica:
1. Al boot: chiama `recoverMissingDays(db, 30)` (calcola e salva ogni giorno mancante negli ultimi 30)
2. setInterval ogni ora: controlla se è cambiato il giorno UTC corrente rispetto all'ultimo computed; se sì, snapshot del giorno appena chiuso
3. timer.unref()

Commit: `feat: plugin nitro daily-metrics cron orario con recovery boot`

---

## FASE 3 — UI client

### Task 16 — Layout `app/layouts/admin.vue` con sidebar nav

**Files:**
- Create: `app/layouts/admin.vue`
- Modify: pages admin esistenti per usare `definePageMeta({ layout: 'admin' })`

Sidebar a sinistra (192-256px desktop, collapse a icone su mobile):
- Voci: Dashboard, Utenti, Party, Registrazioni, Admin, Metriche, Impostazioni, Audit
- Highlight voce attiva (in base a `route.path`)
- Bottone Logout in fondo
- Badge "manutenzione attiva" se `system.maintenanceMode` (status pubblico)

Content area `<slot/>` dentro main.

Commit: `feat: layout admin con sidebar nav e sub-route highlight`

### Task 17 — Page `/admin/dashboard` (counters live + grafici time-series)

**Files:**
- Create: `app/pages/admin/dashboard.vue`
- Create: `app/components/admin/MetricsChart.vue` (SVG line/bar minimal)
- Create: `app/composables/useAdminApi.ts` (helper $fetch /api/admin/*)

Dashboard:
- Cards counters (users approved/pending/banned, parties active/archived, ws current, messages last24h)
- Grafici time-series ultimi 30g: messaggi/giorno, login success vs failed, party create

`MetricsChart.vue`: SVG inline minimale (no chart library), supporta line + bar. Props: `{ data: { date: string, value: number }[], color, height }`.

Commit: `feat: admin dashboard con counters live e grafici time-series`

### Task 18 — Page `/admin/users` (refactor da admin/index.vue tab)

**Files:**
- Create: `app/pages/admin/users/index.vue`
- Sposta logica da `app/pages/admin/index.vue` tab "Utenti" qui
- Modify: `app/pages/admin/index.vue` → diventa redirect a `/admin/dashboard`

Aggiunte rispetto al tab esistente:
- Bottone "Promuovi a admin" per utenti approved (calls /api/admin/admins POST)
- Filtri search + status

Commit: `feat: pagina admin users con elevate-to-admin`

### Task 19 — Pages `/admin/parties` (lista + dettaglio)

**Files:**
- Create: `app/pages/admin/parties/index.vue`
- Create: `app/pages/admin/parties/[seed].vue`

Lista: tabella con paginazione/cursor, filtri (active/archived), search. Per riga: cityName, master(s), members, lastActivity, badge visibility/policy/archived. Click → dettaglio.

Dettaglio: card con info party + tabs:
- Membri: lista con bottone "Trasferisci master a..." (per master attivi/altri)
- Settings: form edit visibility/joinPolicy/cityName + save
- Azioni: bottoni Archive/Restore/Delete (delete con prompt confirm "DELETE")

Commit: `feat: pagine admin parties list e dettaglio con azioni full`

### Task 20 — Page `/admin/registrations` (refactor da tab)

**Files:**
- Create: `app/pages/admin/registrations/index.vue`
- Logica spostata da `admin/index.vue`

Commit: `feat: pagina admin registrations come sub-route`

### Task 21 — Page `/admin/admins` (multi-superadmin)

**Files:**
- Create: `app/pages/admin/admins/index.vue`

Lista superadmins attivi + revocati. Bottone "Revoca" per attivi (non per self se ultimo). Sezione "Promuovi user esistente" con search user + conferma.

Commit: `feat: pagina admin admins gestione multi-superadmin`

### Task 22 — Page `/admin/metrics` (timeseries esteso + export CSV)

**Files:**
- Create: `app/pages/admin/metrics.vue`

Filtri date range (default 30g). Grafici time-series. Bottoni export CSV per ogni kind (users/parties/audit/messages) con download.

Commit: `feat: pagina admin metrics con date range e export csv`

### Task 23 — Page `/admin/settings` (form raggruppato)

**Files:**
- Create: `app/pages/admin/settings.vue`

Form raggruppato in sezioni: Limiti, Features, Sistema. Ogni input ha:
- label + description
- valore corrente
- bottone "Reset to default"
- save inline (POST a ogni cambio o globale)

Validazione client per range/tipo. Toast su successo/errore.

Commit: `feat: pagina admin settings con form raggruppato e validazione`

### Task 24 — Page `/admin/audit`

**Files:**
- Create: `app/pages/admin/audit.vue`

Visualizza unione di `admin_actions` + `auth_events` (toggle "tutto" / "solo admin" / "solo auth"). Filtri per actor, kind, range date. Paginazione cursor. Export CSV.

Commit: `feat: pagina admin audit con filtri e cross-source`

### Task 25 — Page `/maintenance` + middleware client

**Files:**
- Create: `app/pages/maintenance.vue`
- Create: `app/middleware/maintenance.global.ts`

Page: pagina pubblica con messaggio + link `/admin/login` (per amministratori).

Middleware: prima di qualsiasi navigazione (eccetto `/admin/*`, `/login`, `/maintenance`), fetch `/api/system/status`. Se `maintenanceMode` E auth.identity?.kind !== 'superadmin' → redirect `/maintenance`.

Commit: `feat: pagina maintenance e middleware client globale`

### Task 26 — Helper `useAdminApi` + error feedback IT

**Files:**
- Create: `app/composables/useAdminApi.ts` (se non già T17)
- Modify: `app/composables/useErrorFeedback.ts`

Helper centralizza chiamate /api/admin/* con error reporting consistente.

Toast IT:
```ts
maintenance: blocking { title: 'Manutenzione', body: '<message dal status>', cta: 'Riprova fra poco' }
last_admin: { level: 'warn', title: 'Sei l\'unico superadmin attivo' }
setting_invalid: { level: 'warn', title: 'Valore impostazione non valido' }
```

Commit: `feat: helper useAdminApi e feedback italiano per errori v2c`

---

## FASE 4 — Smoke + docs + gate

### Task 27 — Smoke manuale end-to-end

Checklist (no commit):

- [ ] `pnpm db:migrate` → 0004 applicata, default in system_settings
- [ ] Login admin, vai `/admin/dashboard` → counters
- [ ] Sidebar funzionante: switch tra sub-route
- [ ] /admin/users → elevate user a admin → user può loggare /admin/login con sue credenziali → vede dashboard
- [ ] /admin/admins → revoke nuovo admin → sue session diventano invalide al prossimo /me
- [ ] /admin/parties → archive party → scompare dal browser pubblico → restore → riappare
- [ ] /admin/parties → transfer master → master cambia
- [ ] /admin/parties → delete (confirm 'DELETE') → party sparisce
- [ ] /admin/settings → cambia maxPartiesPerUser=1 → user con 1 party prova create → 429 party_limit
- [ ] /admin/maintenance → on → user logged-in viene rediretto a /maintenance al next nav; admin continua a usare /admin
- [ ] /admin/metrics → time-series visibili (almeno 1 giorno se cron ha già girato), CSV export funziona
- [ ] /admin/audit → vede admin_actions delle azioni precedenti

### Task 28 — README aggiornato

**Files:**
- Modify: `README.md`

Aggiungi sezione "Admin dashboard (v2c)" con: sidebar nav, gestione party, multi-superadmin, settings runtime, metriche, manutenzione.

Commit: `docs: sezione admin v2c in readme`

### Task 29 — Gate finale plan 9

- [ ] `pnpm lint && pnpm typecheck && pnpm test` verdi
- [ ] Test count target: 434 + ~80 nuovi (parties admin + admins + settings + metrics + export + maintenance + system-settings + admin-actions + daily-metrics) = ~510+
- [ ] Smoke task 27 completato
- [ ] Commit:

```
git commit --allow-empty -m "chore: chiude plan 9 admin v2c"
```

Optional tag: `v0.4.0-admin`

---

## Checklist riassuntiva

- [ ] T1 — schema + migration 0004
- [ ] T2 — service system-settings
- [ ] T3 — service admin-actions
- [ ] T4 — service daily-metrics
- [ ] T5 — superadmins revokedAt + middleware
- [ ] T6 — parties hardDelete + transferMaster
- [ ] T7 — limiti runtime + errors
- [ ] T8 — admin parties endpoints
- [ ] T9 — admin admins endpoints
- [ ] T10 — admin settings endpoints
- [ ] T11 — admin metrics endpoints
- [ ] T12 — admin export csv
- [ ] T13 — maintenance toggle + plugin guard
- [ ] T14 — /api/system/status
- [ ] T15 — plugin daily-metrics cron
- [ ] T16 — layout admin sidebar
- [ ] T17 — dashboard page
- [ ] T18 — users page
- [ ] T19 — parties pages
- [ ] T20 — registrations page
- [ ] T21 — admins page
- [ ] T22 — metrics page
- [ ] T23 — settings page
- [ ] T24 — audit page
- [ ] T25 — maintenance page + middleware
- [ ] T26 — useAdminApi + feedback IT
- [ ] T27 — smoke manuale
- [ ] T28 — README
- [ ] T29 — gate
