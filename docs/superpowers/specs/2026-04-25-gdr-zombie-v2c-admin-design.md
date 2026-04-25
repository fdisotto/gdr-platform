# GDR Zombie v2c — Admin dashboard completo

**Goal:** Estendere il dashboard `/admin` minimale di v2a a una console di
gestione completa: full control sulle party (read/write/archive/restore/
delete), `system_settings` runtime modificabili (limiti, feature toggles,
modalità manutenzione), full observability (counters + time-series + CSV
export), multi-superadmin con elevate da UI + audit, ban globale
account, sidebar nav su sotto-route `/admin/*`.

## Scope

Incluso:
- Schema: nuove tabelle `system_settings`, `daily_metrics`,
  `admin_actions`. Campo `revokedAt` su `superadmins`.
- API admin estese: party CRUD (list/edit/delete/restore/transfer-master/
  archive), settings (get/set), metrics (counters + time-series),
  admins (elevate/revoke), export (CSV stream), maintenance toggle.
- Cron daily metrics (plugin Nitro).
- Middleware maintenance mode (Nuxt + Nitro).
- UI sidebar nav: `/admin/dashboard`, `/admin/users`, `/admin/parties`,
  `/admin/registrations`, `/admin/admins`, `/admin/metrics`,
  `/admin/settings`, `/admin/audit`.
- Audit log dedicato `admin_actions` separato da `auth_events`.

Fuori scope (rimandato):
- Mappe alternative (v2d)
- Mobile-first redesign (v2e)
- Email transactional (v3+)
- Dashboard mobile-first

## Decisioni chiave (dal brainstorming)

| Q | Decisione |
|---|---|
| Q1 | Full control admin sulle party: list/view/edit visibility-policy/transfer-master/archive/restore/delete |
| Q2 | Limiti configurabili runtime via tabella `system_settings`. Cache in-memory. Default seedati al boot. |
| Q3 | Full observability: counters live + time-series 30g + CSV export per users/parties/audit |
| Q4 | Multi-superadmin via UI elevate. Self-revoke vietato se ultimo. Audit obbligatorio. |
| Q5 | Server-wide: maintenance mode + feature toggles (registration, party-creation, voice) + ban globale account |
| Q6 | Sidebar nav multi-page con sotto-route `/admin/*` |
| Q7 | Hard-delete party (cascade FK), nuova tabella `admin_actions`, `system_settings` key-value JSON, time-series via cron, CSV streaming |

## Architettura

```
/admin layout
  ├── sidebar nav: Dashboard, Utenti, Party, Registrazioni, Admin,
  │                Metriche, Impostazioni, Audit, Logout
  └── content area (router-view per sotto-route)

API /api/admin/
  ├── (esistenti v2a) auth, registrations, users, auth-events
  ├── parties               GET list, GET [seed], POST [seed]/edit,
  │                         POST [seed]/transfer-master, POST [seed]/restore,
  │                         POST [seed]/archive, DELETE [seed]
  ├── admins                GET list, POST elevate, POST [id]/revoke
  ├── settings              GET all, POST [key] (set)
  ├── metrics               GET counters, GET timeseries
  ├── export                GET ?kind={users|parties|audit|messages}
  └── maintenance           POST toggle on/off

services
  ├── system-settings.ts (cache in-memory + DB write-through)
  ├── admin-actions.ts (append-only audit)
  ├── daily-metrics.ts (computeSnapshot + persist)
  └── (esteso) parties.ts: hardDeleteParty, transferMaster

plugin nitro
  ├── system-settings-bootstrap (seed defaults se mancanti)
  ├── daily-metrics-cron (snapshot giornaliero + recovery boot)
  └── maintenance-guard (middleware HTTP)
```

## Modello dati

### Nuove tabelle

```ts
systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),                 // JSON serializzato
  updatedAt: integer('updated_at').notNull(),
  updatedBy: text('updated_by').references(() => superadmins.id)
})

// Time-series leggera: una riga per giorno (UTC), aggregati pre-calcolati.
dailyMetrics = sqliteTable('daily_metrics', {
  date: text('date').primaryKey(),                // 'YYYY-MM-DD'
  usersTotal: integer('users_total').notNull(),
  usersApproved: integer('users_approved').notNull(),
  usersPending: integer('users_pending').notNull(),
  usersBanned: integer('users_banned').notNull(),
  partiesTotal: integer('parties_total').notNull(),
  partiesActive: integer('parties_active').notNull(),
  partiesArchived: integer('parties_archived').notNull(),
  messagesNew: integer('messages_new').notNull(), // creati in quel giorno
  authLoginSuccess: integer('auth_login_success').notNull(),
  authLoginFailed: integer('auth_login_failed').notNull(),
  computedAt: integer('computed_at').notNull()
})

adminActions = sqliteTable('admin_actions', {
  id: text('id').primaryKey(),
  superadminId: text('superadmin_id').notNull()
    .references(() => superadmins.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),               // enum stringa
  targetKind: text('target_kind'),                // 'user' | 'party' | 'admin' | 'setting' | null
  targetId: text('target_id'),
  payload: text('payload'),                       // JSON serializzato
  createdAt: integer('created_at').notNull()
}, t => [
  index('admin_actions_time_idx').on(t.createdAt),
  index('admin_actions_actor_idx').on(t.superadminId, t.createdAt)
])
```

Enum `admin_actions.action` (espandibile):
- `party.edit`, `party.archive`, `party.restore`, `party.delete`,
  `party.transfer_master`
- `user.ban`, `user.unban` (cross-party global), `user.reset_password`,
  `user.approve_registration`, `user.reject_registration`
- `admin.elevate`, `admin.revoke`
- `setting.update`
- `maintenance.enable`, `maintenance.disable`

### Estensione `superadmins`

```ts
revokedAt: integer('revoked_at')        // null = attivo
revokedBy: text('revoked_by').references(() => superadmins.id)
```

Lookup `findActiveSuperadminByUsername` filtra `revokedAt IS NULL`.
La sessione di un superadmin revocato viene revocata immediatamente
(via `revokeAllForSuperadmin`).

### Estensione `users.status` (eventuale)

`status='banned'` esiste già da v2a. La differenza in v2c: il ban
viene tracciato in `admin_actions` invece (o in aggiunta) a
`auth_events`. Niente cambio schema su `users`.

### Default `system_settings`

Seed iniziale (al primo boot, se mancanti):

| key | value default | tipo |
|---|---|---|
| `limits.maxPartiesPerUser` | `5` | int |
| `limits.maxMembersPerParty` | `30` | int |
| `limits.maxTotalParties` | `100` | int |
| `limits.partyInactivityArchiveDays` | `30` | int |
| `limits.inviteTtlDays` | `7` | int |
| `limits.loginRateMaxFailures` | `5` | int |
| `limits.loginRateWindowMinutes` | `15` | int |
| `limits.registerRateMaxPerHour` | `3` | int |
| `features.registrationEnabled` | `true` | bool |
| `features.partyCreationEnabled` | `true` | bool |
| `features.voiceChatEnabled` | `true` | bool |
| `system.maintenanceMode` | `false` | bool |
| `system.maintenanceMessage` | `"Manutenzione in corso. Torniamo presto."` | string |

Tutti modificabili via UI (`/admin/settings`). Le costanti hard-coded
in `shared/limits.ts` diventano **default fallback** se la tabella è
ancora vuota — usate da `getSetting(key)` come secondo argomento.

## API HTTP

Tutte richiedono `requireSuperadmin(event)` salvo dove indicato.
Ogni mutazione produce una riga `admin_actions`.

### Party admin

**GET `/api/admin/parties`**
- Query: `?status=` (active|archived|all default all), `?q=`, `?cursor=`, `?limit=` (default 20, max 50)
- Ritorna `{ items: PartyAdminRow[], nextCursor }` con per riga: seed, cityName, visibility, joinPolicy, archivedAt, memberCount (active), masterDisplays, createdAt, lastActivityAt.

**GET `/api/admin/parties/[seed]`**
- Dettaglio + lista membri attivi (id, userId, username, displayName, role, joinedAt, lastSeenAt, isMuted, leftAt) + count messaggi + count zombi + invites attive.

**POST `/api/admin/parties/[seed]/edit`**
- Body: `{ visibility?, joinPolicy?, cityName? }`. Aggiorna campi; touch lastActivityAt; audit log.

**POST `/api/admin/parties/[seed]/archive`**
- Setta archivedAt + kick ws aperti. Audit.

**POST `/api/admin/parties/[seed]/restore`**
- Azzera archivedAt. Audit.

**POST `/api/admin/parties/[seed]/transfer-master`**
- Body: `{ fromUserId, toUserId }`. fromUserId perde role='master', toUserId guadagna. Throw se fromUserId non master attivo o toUserId non member attivo. Audit.

**DELETE `/api/admin/parties/[seed]`**
- Body: `{ confirm: 'DELETE' }` per evitare accidenti. Hard delete row `parties`; FK CASCADE pulisce tutto il resto. Kick ws aperti. Audit.

### Admins (multi-superadmin)

**GET `/api/admin/admins`**
- Lista `superadmins` (id, username, mustReset, createdAt, revokedAt, revokedBy).

**POST `/api/admin/admins`**
- Body: `{ targetUserId }` — promuove un user a superadmin copiando username + passwordHash. mustReset=false (la password user deve già essere settata). Audit.

**POST `/api/admin/admins/[id]/revoke`**
- Body: `{ reason? }`. Setta revokedAt. Revoca tutte le session attive del superadmin. 409 last_admin se è l'unico attivo (controlla count).

### Settings

**GET `/api/admin/settings`**
- Ritorna mappa `{ key: { value, updatedAt, updatedBy } }` di tutte.

**POST `/api/admin/settings/[key]`**
- Body: `{ value }` (qualsiasi JSON serializzabile compatibile col tipo previsto). Validazione client + server: schema per chiave noto, range/enum se applicabile (es. limits.* devono essere int positivi, features.* boolean). Audit.

### Metrics

**GET `/api/admin/metrics/counters`**
- Snapshot live calcolato on-the-fly:
  - users: `{ total, pending, approved, banned }`
  - parties: `{ total, active, archived, byVisibility: { public, private }, byPolicy: { auto, request } }`
  - messages: `{ total, last24h }`
  - zombies: `{ total, npcs }`
  - sessions: `{ active, expired (last 24h) }`
  - wsConnections: `{ current }` (dal registry server-side)

**GET `/api/admin/metrics/timeseries`**
- Query: `?days=` (default 30, max 365). Ritorna ultimi N giorni da `daily_metrics`. Se mancano giorni (server spento), ritorna NULL su quei giorni.

### Export CSV

**GET `/api/admin/export`**
- Query: `?kind=users|parties|audit|messages` (audit = admin_actions+auth_events combinati o sceglibili)
- Stream CSV con header content-type/disposition. Per limit di sicurezza, max 50000 righe per request — se di più, paginazione con `?cursor=`.

### Maintenance

**POST `/api/admin/maintenance`**
- Body: `{ enabled: boolean, message?: string }`. Aggiorna `system_settings` chiavi `system.maintenanceMode` e `system.maintenanceMessage`. Audit.

## Maintenance mode middleware

**Server (Nitro):** plugin che, ad ogni request HTTP non /api/admin/* e
non /api/auth/* per superadmin, controlla `system.maintenanceMode`.
Se true e l'identità non è superadmin → 503 JSON
`{ code: 'maintenance', message: '...' }`.

**Client (Nuxt):** middleware globale che fa `fetch('/api/auth/me')`
e, se `maintenanceMode` attivo (passato come header risposta o tramite
endpoint dedicato `/api/system/status` pubblico), redirige a
`/maintenance` (pagina statica con messaggio + link `/admin/login`).

## UI client: sidebar nav `/admin/*`

Layout: `app/layouts/admin.vue` con sidebar fissa a sinistra (192-256px)
e content area a destra. Voci:

| Voce | Route | Descrizione |
|---|---|---|
| Dashboard | `/admin/dashboard` | Counters live + grafici time-series |
| Utenti | `/admin/users` | Lista con filtri pending/approved/banned, ban/reset/elevate |
| Party | `/admin/parties` | Lista filtri active/archived, view, edit, transfer-master, archive, restore, delete |
| Registrazioni | `/admin/registrations` | Coda pending (resta come oggi) |
| Admin | `/admin/admins` | Multi-superadmin: lista, elevate, revoke |
| Metriche | `/admin/metrics` | Time-series + filtri data range + export CSV |
| Impostazioni | `/admin/settings` | Form per settings raggruppate (Limiti, Features, Sistema). Ogni campo ha description + reset-to-default |
| Audit | `/admin/audit` | Log unito admin_actions + auth_events filtrabile |
| Logout | (azione) | Logout admin |

Mobile responsive: sidebar collapse a icone-only sotto md.

`/maintenance` pagina pubblica statica (logo + messaggio + link admin
login). Visibile a chi non è superadmin quando manutenzione attiva.

## Migration

Migration `0004_v2c_admin.sql`:
- ALTER TABLE superadmins ADD COLUMN revoked_at INTEGER
- ALTER TABLE superadmins ADD COLUMN revoked_by TEXT REFERENCES superadmins(id)
- CREATE TABLE system_settings ...
- CREATE TABLE daily_metrics ...
- CREATE TABLE admin_actions ...
- INSERT seed default values in system_settings (idempotente: ON CONFLICT DO NOTHING)

Niente clean break: dati esistenti restano integri.

## Cron daily metrics

Plugin Nitro `server/plugins/daily-metrics.ts`:
1. Al boot: chiama `recoverMissingDays()` che calcola e salva metriche per
   ogni giorno mancante negli ultimi 30 (recovery dopo downtime).
2. Schedula `setInterval` a frequenza variabile: ogni ora controlla se
   è cambiato il giorno UTC; al cambio, snapshot del giorno appena
   chiuso. Più affidabile di un timer giornaliero esatto.
3. `unref()` per non bloccare graceful shutdown.

`computeDailyMetrics(db, date): DailyMetricsRow` raggruppa query SQL
sui dati esistenti (counts su users.status, parties.archivedAt,
messages.createdAt by day, auth_events.event by day).

## Limiti configurabili: integrazione runtime

Refactor: tutti gli usi di costanti `MAX_*` in `shared/limits.ts`
diventano lazy lookup via `getSettingNumber('limits.maxPartiesPerUser', MAX_PARTIES_PER_USER_DEFAULT)`.
Cache in-memory invalidata su `setSetting(key)`. Le service esistenti
(`joinParty`, `createParty`, ecc) chiamano l'helper invece dell'import
diretto.

`shared/limits.ts` resta come **default fallback** + tipi: nessuna
breaking change per chi importa la costante.

## Codici errore aggiunti

- `maintenance` — 503 quando manutenzione attiva
- `last_admin` — 409 demote ultimo superadmin
- `setting_invalid` — 400 valore fuori range/tipo

Mappa toast IT in `useErrorFeedback`.

## Testing

Unit:
- `system-settings`: getSetting/setSetting + cache invalidation
- `admin-actions`: log appende
- `daily-metrics`: computeDailyMetrics deterministico su DB seed

Integration:
- /api/admin/parties: list/edit/archive/restore/delete/transfer
- /api/admin/admins: elevate/revoke/last_admin guard
- /api/admin/settings: get/set + tipo enforcement
- /api/admin/metrics/{counters, timeseries}
- /api/admin/export ?kind=users|parties|audit
- maintenance toggle: 503 per non-admin, 200 per admin

UI:
- Sidebar nav layout
- Settings form validation client
- Metrics page con grafici minimal (SVG inline)

Manuale:
- Maintenance: attiva, verifica /, /party, /login bloccati; /admin OK
- Elevate user → user può accedere /admin
- Revoke admin → session revocata + 401 al successivo /me
- Limit override: cambia maxPartiesPerUser=2, verifica blocco creazione

## File toccati

Nuovi:
- `server/db/migrations/0004_*.sql`
- `server/services/system-settings.ts`
- `server/services/admin-actions.ts`
- `server/services/daily-metrics.ts`
- `server/api/admin/parties/index.get.ts`
- `server/api/admin/parties/[seed]/index.get.ts`
- `server/api/admin/parties/[seed]/edit.post.ts`
- `server/api/admin/parties/[seed]/transfer-master.post.ts`
- `server/api/admin/parties/[seed]/restore.post.ts`
- `server/api/admin/parties/[seed]/archive.post.ts`
- `server/api/admin/parties/[seed]/index.delete.ts`
- `server/api/admin/admins/index.get.ts`
- `server/api/admin/admins/index.post.ts`
- `server/api/admin/admins/[id]/revoke.post.ts`
- `server/api/admin/settings/index.get.ts`
- `server/api/admin/settings/[key].post.ts`
- `server/api/admin/metrics/counters.get.ts`
- `server/api/admin/metrics/timeseries.get.ts`
- `server/api/admin/export.get.ts`
- `server/api/admin/maintenance.post.ts`
- `server/api/system/status.get.ts` (pubblico, dice se maintenance)
- `server/plugins/daily-metrics.ts`
- `server/plugins/maintenance-guard.ts`
- `app/layouts/admin.vue` (sidebar)
- `app/pages/admin/dashboard.vue`
- `app/pages/admin/users/index.vue` (refactor da admin/index.vue tab)
- `app/pages/admin/parties/index.vue`
- `app/pages/admin/parties/[seed].vue`
- `app/pages/admin/registrations/index.vue` (estratto da tab)
- `app/pages/admin/admins/index.vue`
- `app/pages/admin/metrics.vue`
- `app/pages/admin/settings.vue`
- `app/pages/admin/audit.vue`
- `app/pages/maintenance.vue`
- `app/middleware/maintenance.global.ts`
- `app/components/admin/MetricsChart.vue` (SVG line/bar minimal)
- `app/composables/useAdminApi.ts` (helper per chiamate /api/admin/*)
- `tests/integration/api/admin/parties-admin.test.ts`
- `tests/integration/api/admin/admins.test.ts`
- `tests/integration/api/admin/settings.test.ts`
- `tests/integration/api/admin/metrics.test.ts`
- `tests/integration/api/admin/export.test.ts`
- `tests/integration/api/admin/maintenance.test.ts`
- `tests/integration/services/system-settings.test.ts`
- `tests/integration/services/daily-metrics.test.ts`

Modificati:
- `server/db/schema.ts` — nuove tabelle + revokedAt su superadmins
- `server/services/superadmins.ts` — `revokeSuperadmin`, lookup filtra revokedAt
- `server/services/parties.ts` — `hardDeleteParty`, `transferMaster`
- `server/services/players.ts` — usa system-settings per limiti
- `server/api/parties/index.post.ts` — limit lookup runtime
- `server/api/parties/[seed]/join.post.ts` — limit lookup runtime
- `server/utils/auth-middleware.ts` — `requireSuperadmin` filtra revokedAt
- `app/pages/admin/index.vue` → diventa redirect a `/admin/dashboard`
- `shared/limits.ts` — costanti diventano DEFAULT fallback
- `shared/errors.ts` — `maintenance`, `last_admin`, `setting_invalid`
- `app/composables/useErrorFeedback.ts` — toast IT nuovi
- `README.md` — sezione admin v2c

## Self-review

**Coverage Q1-Q7**: tutte ✓.

**Placeholder**: nessuno.

**Ambiguità**: la copia password_hash da user a superadmin in `elevate` —
è coerente con il modello (account separati ma collegati). Da gestire:
se l'user cambia password dopo elevate, il superadmin non si aggiorna.
Accettato per MVP (admin cambia password dal suo flusso `/admin/change-password`).

**Scope check**: non incluso editor mappe (v2d), né mobile-first (v2e),
né email. Il dashboard è web-only desktop-first come tutto il resto.

**Rischi**:
- Cache `system_settings` in-memory + multi-process: accettato single-node;
  multi-node serve invalidate via pub/sub.
- Hard-delete party irreversibile: confirm string `'DELETE'` mitiga.
- Time-series cron: se DB cresce, tabella `daily_metrics` resta piccola
  (1 row/giorno). Retention 365 = ~365 righe.
