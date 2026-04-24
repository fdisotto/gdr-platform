# GDR Zombie — Plan 7: Auth (v2a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre account utente (username + password) come prerequisito per giocare. Rimpiazza il flow nickname/localStorage con autenticazione server-side a cookie httpOnly. Aggiunge superadmin su tabella separata con seed script, approvazione delle registrazioni da dashboard minimale, display name per-party, audit log. Clean break: le tabelle MVP vengono azzerate dalla migration.

**Architettura:** Nuovi services `auth`, `users`, `superadmins`, `sessions`, `auth-events`. Middleware auth che estrae identità dal cookie. Endpoint `/api/auth/*` e `/api/admin/*`. WS upgrade autenticato via cookie. Pagine SPA `/login`, `/register`, `/me`, `/admin`. Pinia store `auth` + composable `useAuth`. Migration `0002` azzera dati MVP e introduce FK `players.user_id`.

**Tech Stack:** Nuxt 4 · Nitro · Drizzle ORM · better-sqlite3 · Zod · bcryptjs · Pinia · Vitest.

**Riferimenti:**
- Spec: `docs/superpowers/specs/2026-04-24-gdr-zombie-v2a-auth-design.md`
- Direttive collaborazione: `CLAUDE.md`

**Convenzioni git:** un commit per task, subject italiano imperativo minuscolo ≤72 char, mai trailer AI, staging mirato. Prima di committare ogni task: `pnpm lint && pnpm typecheck && pnpm test` verdi.

**Breaking changes previsti (dichiarati in CLAUDE.md come accettati):**
- DB MVP azzerato alla migration
- `sessionToken` localStorage rimosso
- `HelloEvent.sessionToken` rimosso
- `master_token_hash` resta in schema ma non più generato/usato

---

## Task 1 — Estendere schema Drizzle con nuove tabelle auth e FK player.user_id

**Files:**
- Modify: `/Users/mashfrog/Work/gdr-zombie/server/db/schema.ts`
- Test: `/Users/mashfrog/Work/gdr-zombie/tests/integration/db-roundtrip.test.ts` (già esiste, estenderlo è opzionale in questo task)

- [ ] **Step 1: Aggiungere tabella users**

Edit `server/db/schema.ts`, aggiungi prima di `zombies`:

```ts
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  usernameLower: text('username_lower').notNull(),
  passwordHash: text('password_hash').notNull(),
  mustReset: integer('must_reset', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: ['pending', 'approved', 'banned'] }).notNull(),
  createdAt: integer('created_at').notNull(),
  approvedAt: integer('approved_at'),
  approvedBy: text('approved_by'),
  bannedReason: text('banned_reason')
}, t => [
  uniqueIndex('users_username_lower_unique').on(t.usernameLower),
  index('users_status_idx').on(t.status)
])
```

- [ ] **Step 2: Aggiungere tabella superadmins**

```ts
export const superadmins = sqliteTable('superadmins', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  usernameLower: text('username_lower').notNull(),
  passwordHash: text('password_hash').notNull(),
  mustReset: integer('must_reset', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull()
}, t => [
  uniqueIndex('superadmins_username_lower_unique').on(t.usernameLower)
])
```

- [ ] **Step 3: Aggiungere tabella sessions**

```ts
export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  superadminId: text('superadmin_id').references(() => superadmins.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  lastActivityAt: integer('last_activity_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent')
}, t => [
  index('sessions_user_idx').on(t.userId),
  index('sessions_superadmin_idx').on(t.superadminId),
  index('sessions_expires_idx').on(t.expiresAt)
])
```

Nota: il CHECK constraint "exactly one of user_id / superadmin_id" va espresso nella SQL migration manualmente post-generazione (drizzle-kit non genera CHECK). Inseriamo a mano nel file SQL.

- [ ] **Step 4: Aggiungere tabella auth_events**

```ts
export const authEvents = sqliteTable('auth_events', {
  id: text('id').primaryKey(),
  actorKind: text('actor_kind', { enum: ['user', 'superadmin', 'anonymous'] }).notNull(),
  actorId: text('actor_id'),
  usernameAttempted: text('username_attempted'),
  event: text('event').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  detail: text('detail'),
  createdAt: integer('created_at').notNull()
}, t => [
  index('auth_events_time_idx').on(t.createdAt),
  index('auth_events_actor_idx').on(t.actorKind, t.actorId, t.createdAt)
])
```

- [ ] **Step 5: Aggiungere FK users.id → players.user_id**

Modificare `export const players = sqliteTable('players', { ... })`:
- Aggiungere campo:

```ts
userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })
```

- Aggiungere index constraint composto alla fine del callback `t => [...]`:

```ts
uniqueIndex('players_party_user_unique').on(t.partySeed, t.userId)
```

- Lasciare `players_party_nickname_unique` intatto (nickname resta displayName per-party e deve restare unico nella party).

- [ ] **Step 6: Verificare typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add server/db/schema.ts
git commit -m "chore: schema drizzle per users, superadmins, sessions, auth_events"
```

---

## Task 2 — Generare migration 0002 con drizzle-kit e aggiungere CHECK + clean break

**Files:**
- Create: `server/db/migrations/0002_*.sql` (generato)
- Modify: il file generato per aggiungere CHECK e DELETE FROM
- Modify: `server/db/migrations.generated.ts` (auto via pnpm db:bundle)

- [ ] **Step 1: Generare migration**

Run: `pnpm db:generate`
Attesa: nuovo file `server/db/migrations/0002_<name>.sql` con le CREATE TABLE e l'ALTER per `players.user_id`.

- [ ] **Step 2: Aggiungere CHECK a sessions in testa alla migration**

Il file SQL generato conterrà `CREATE TABLE sessions (...)`. Non editiamolo direttamente (drizzle rigenera); aggiungiamo invece una seconda migration SQL a mano `0003_session_check.sql` con:

```sql
-- SQLite non supporta ALTER TABLE ADD CHECK, ma supporta CREATE TABLE AS SELECT
-- Trick: ricreare la tabella con il CHECK, copiare i dati (al primo deploy è vuota).

CREATE TABLE sessions_new (
  token TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  superadmin_id TEXT REFERENCES superadmins(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  CHECK (
    (user_id IS NOT NULL AND superadmin_id IS NULL) OR
    (user_id IS NULL AND superadmin_id IS NOT NULL)
  )
);
--> statement-breakpoint
INSERT INTO sessions_new SELECT * FROM sessions;
--> statement-breakpoint
DROP TABLE sessions;
--> statement-breakpoint
ALTER TABLE sessions_new RENAME TO sessions;
--> statement-breakpoint
CREATE INDEX sessions_user_idx ON sessions(user_id);
--> statement-breakpoint
CREATE INDEX sessions_superadmin_idx ON sessions(superadmin_id);
--> statement-breakpoint
CREATE INDEX sessions_expires_idx ON sessions(expires_at);
```

- [ ] **Step 3: Aggiungere clean break SQL in migration 0002**

Il file `0002_*.sql` va editato per aggiungere DELETE FROM in testa, PRIMA delle CREATE TABLE / ALTER (così se l'ALTER richiede colonne non-null su righe esistenti non fallisce).

Aprire `server/db/migrations/0002_*.sql` e aggiungere in cima:

```sql
-- v2a clean break: azzera dati MVP prima di introdurre auth
DELETE FROM zombies;
--> statement-breakpoint
DELETE FROM player_positions;
--> statement-breakpoint
DELETE FROM master_actions;
--> statement-breakpoint
DELETE FROM bans;
--> statement-breakpoint
DELETE FROM area_access_bans;
--> statement-breakpoint
DELETE FROM weather_overrides;
--> statement-breakpoint
DELETE FROM messages;
--> statement-breakpoint
DELETE FROM areas_state;
--> statement-breakpoint
DELETE FROM players;
--> statement-breakpoint
DELETE FROM parties;
--> statement-breakpoint
```

(Rimuovi blocchi se il file generato non ha gli statement-breakpoint esatti — consistency con gli altri statement del file.)

- [ ] **Step 4: Rigenerare bundle**

Run: `pnpm db:bundle`
Expected: `server/db/migrations.generated.ts` aggiornato con 4 bundle (era 2).

- [ ] **Step 5: Applicare migration su DB locale**

Run:
```bash
rm -f data/gdr.sqlite   # fresh start nel dev
pnpm db:migrate
```
Expected: no errori. Ispezione: `sqlite3 data/gdr.sqlite '.schema users'` mostra tabella users.

- [ ] **Step 6: Typecheck + test**

Run: `pnpm typecheck && pnpm test`
Expected: verdi (i test esistenti usano `createTestDb` che ricrea lo schema in memoria, dovrebbero continuare a passare).

- [ ] **Step 7: Commit**

```bash
git add server/db/migrations/0002_*.sql server/db/migrations/0003_session_check.sql server/db/migrations/meta/ server/db/migrations.generated.ts
git commit -m "chore: migration 0002 auth + clean break mvp, 0003 check sessions"
```

---

## Task 3 — Aggiornare shared/errors.ts con nuovi codici auth

**Files:**
- Modify: `shared/errors.ts`
- Test: `tests/unit/errors.test.ts`

- [ ] **Step 1: Aggiungere codici**

Edit `shared/errors.ts`, aggiungi alla union `ErrorCode`:

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

- [ ] **Step 2: Estendere il test di errors per coprire i nuovi codici**

In `tests/unit/errors.test.ts` aggiungi un assert che ogni nuovo codice è accettato dallo schema Zod (se esiste), o semplicemente che è di tipo `ErrorCode`:

```ts
it('include i codici v2a auth', () => {
  const codes: ErrorCode[] = ['invalid_credentials','account_pending','account_banned','username_taken','weak_password','invalid_username','must_reset_first','session_expired','not_member']
  expect(codes.length).toBeGreaterThan(0)
})
```

- [ ] **Step 3: Run test**

Run: `pnpm vitest run tests/unit/errors.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add shared/errors.ts tests/unit/errors.test.ts
git commit -m "feat: nuovi codici errore auth in shared/errors"
```

---

## Task 4 — Schema HTTP Zod per auth in shared/protocol/http.ts

**Files:**
- Modify: `shared/protocol/http.ts`
- Test: `tests/unit/protocol/http.test.ts` (se esiste) o creazione nuovo file `tests/unit/protocol/auth-http.test.ts`

- [ ] **Step 1: Definire schemi**

Edit `shared/protocol/http.ts` aggiungi in coda:

```ts
export const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/
const Username = z.string().min(3).max(32).regex(USERNAME_REGEX)
const Password = z.string().min(8).max(256)

export const RegisterBody = z.object({
  username: Username,
  password: Password
})
export type RegisterBody = z.infer<typeof RegisterBody>

export const LoginBody = z.object({
  username: Username,
  password: z.string().min(1) // niente regex: validazione lato verify
})
export type LoginBody = z.infer<typeof LoginBody>

export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: Password
})
export type ChangePasswordBody = z.infer<typeof ChangePasswordBody>

export const BanUserBody = z.object({
  reason: z.string().max(500).optional()
})
export type BanUserBody = z.infer<typeof BanUserBody>

export const RejectRegistrationBody = z.object({
  reason: z.string().max(500).optional()
})
export type RejectRegistrationBody = z.infer<typeof RejectRegistrationBody>

// Response schemas per me endpoint
export const MeResponse = z.object({
  kind: z.enum(['user', 'superadmin']),
  id: z.string(),
  username: z.string(),
  mustReset: z.boolean()
})
export type MeResponse = z.infer<typeof MeResponse>
```

- [ ] **Step 2: Test schemi**

Create `tests/unit/protocol/auth-http.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RegisterBody, LoginBody, ChangePasswordBody } from '~~/shared/protocol/http'

describe('auth http schemas', () => {
  it('RegisterBody accetta username valido', () => {
    expect(RegisterBody.parse({ username: 'mash', password: '12345678' })).toBeTruthy()
  })
  it('RegisterBody rifiuta username con spazi', () => {
    expect(() => RegisterBody.parse({ username: 'm a s h', password: '12345678' })).toThrow()
  })
  it('RegisterBody rifiuta password corta', () => {
    expect(() => RegisterBody.parse({ username: 'mash', password: '1234567' })).toThrow()
  })
  it('ChangePasswordBody richiede entrambe', () => {
    expect(() => ChangePasswordBody.parse({ currentPassword: 'x' })).toThrow()
  })
})
```

- [ ] **Step 3: Run test**

Run: `pnpm vitest run tests/unit/protocol/auth-http.test.ts`
Expected: 4 PASS.

- [ ] **Step 4: Commit**

```bash
git add shared/protocol/http.ts tests/unit/protocol/auth-http.test.ts
git commit -m "feat: schemi zod register/login/change-password/ban"
```

---

## Task 5 — Service auth: hash, verify, token gen

**Files:**
- Create: `server/services/auth.ts`
- Test: `tests/unit/server/auth-primitives.test.ts`

- [ ] **Step 1: Scrivere il test prima (TDD)**

Create `tests/unit/server/auth-primitives.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, generateSessionToken } from '~~/server/services/auth'

describe('auth primitives', () => {
  it('hashPassword + verifyPassword round-trip', async () => {
    const h = await hashPassword('secret123')
    expect(await verifyPassword('secret123', h)).toBe(true)
    expect(await verifyPassword('wrong', h)).toBe(false)
  })
  it('hashPassword produces different hash for same input', async () => {
    const h1 = await hashPassword('x')
    const h2 = await hashPassword('x')
    expect(h1).not.toBe(h2) // salt diverso
  })
  it('generateSessionToken returns url-safe 43 char (32 bytes b64url)', () => {
    const t = generateSessionToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.length).toBeGreaterThanOrEqual(43)
  })
  it('generateSessionToken returns unique', () => {
    const tokens = new Set()
    for (let i = 0; i < 50; i++) tokens.add(generateSessionToken())
    expect(tokens.size).toBe(50)
  })
})
```

- [ ] **Step 2: Run test - fail**

Run: `pnpm vitest run tests/unit/server/auth-primitives.test.ts`
Expected: FAIL (file non esiste).

- [ ] **Step 3: Implementare service**

Create `server/services/auth.ts`:

```ts
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const BCRYPT_FACTOR = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_FACTOR)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}
```

- [ ] **Step 4: Run test - pass**

Run: `pnpm vitest run tests/unit/server/auth-primitives.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/auth.ts tests/unit/server/auth-primitives.test.ts
git commit -m "feat: service auth con hash, verify, token generation"
```

---

## Task 6 — Service users con CRUD e status transitions

**Files:**
- Create: `server/services/users.ts`
- Test: `tests/integration/services/users.test.ts`

- [ ] **Step 1: Test**

Create `tests/integration/services/users.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { insertUser, findUserByUsername, findUserById, approveUser, banUser, listUsersByStatus, rejectUser, markMustReset, updatePassword } from '~~/server/services/users'
import { hashPassword } from '~~/server/services/auth'
import { generateUuid } from '~~/server/utils/crypto'

let db: Db
beforeEach(() => { db = createTestDb() })

describe('users service', () => {
  it('insertUser crea pending', async () => {
    const hash = await hashPassword('secret12')
    const u = insertUser(db, { id: generateUuid(), username: 'Mash', passwordHash: hash })
    expect(u.status).toBe('pending')
    expect(u.username).toBe('Mash')
    expect(u.usernameLower).toBe('mash')
  })
  it('findUserByUsername è case-insensitive', async () => {
    const hash = await hashPassword('secret12')
    insertUser(db, { id: generateUuid(), username: 'Mash', passwordHash: hash })
    expect(findUserByUsername(db, 'MASH')?.username).toBe('Mash')
    expect(findUserByUsername(db, 'mash')?.username).toBe('Mash')
  })
  it('rifiuta duplicate username case-insensitive', async () => {
    const hash = await hashPassword('secret12')
    insertUser(db, { id: generateUuid(), username: 'Mash', passwordHash: hash })
    expect(() => insertUser(db, { id: generateUuid(), username: 'MASH', passwordHash: hash })).toThrow()
  })
  it('approveUser transita status', async () => {
    const u = insertUser(db, { id: generateUuid(), username: 'A', passwordHash: 'h' })
    approveUser(db, u.id, 'sa-1')
    const r = findUserById(db, u.id)
    expect(r?.status).toBe('approved')
    expect(r?.approvedBy).toBe('sa-1')
  })
  it('banUser transita status e scrive reason', async () => {
    const u = insertUser(db, { id: generateUuid(), username: 'A', passwordHash: 'h' })
    approveUser(db, u.id, 'sa-1')
    banUser(db, u.id, 'spam')
    const r = findUserById(db, u.id)
    expect(r?.status).toBe('banned')
    expect(r?.bannedReason).toBe('spam')
  })
  it('listUsersByStatus filtra', () => {
    insertUser(db, { id: 'u1', username: 'a', passwordHash: 'h' })
    const u2 = insertUser(db, { id: 'u2', username: 'b', passwordHash: 'h' })
    approveUser(db, u2.id, 'sa')
    expect(listUsersByStatus(db, 'pending')).toHaveLength(1)
    expect(listUsersByStatus(db, 'approved')).toHaveLength(1)
  })
  it('rejectUser elimina pending', () => {
    const u = insertUser(db, { id: 'u', username: 'a', passwordHash: 'h' })
    rejectUser(db, u.id)
    expect(findUserById(db, u.id)).toBeNull()
  })
  it('markMustReset e updatePassword', async () => {
    const u = insertUser(db, { id: 'u', username: 'a', passwordHash: 'h' })
    markMustReset(db, u.id, true)
    expect(findUserById(db, u.id)?.mustReset).toBe(true)
    const newHash = await hashPassword('newsecret')
    updatePassword(db, u.id, newHash)
    const r = findUserById(db, u.id)
    expect(r?.passwordHash).toBe(newHash)
    expect(r?.mustReset).toBe(false)
  })
})
```

- [ ] **Step 2: Run test - fail**

Run: `pnpm vitest run tests/integration/services/users.test.ts`
Expected: FAIL (file non esiste).

- [ ] **Step 3: Implementare service**

Create `server/services/users.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { users } from '~~/server/db/schema'

export type UserStatus = 'pending' | 'approved' | 'banned'

export interface UserRow {
  id: string
  username: string
  usernameLower: string
  passwordHash: string
  mustReset: boolean
  status: UserStatus
  createdAt: number
  approvedAt: number | null
  approvedBy: string | null
  bannedReason: string | null
}

export function insertUser(db: Db, params: { id: string, username: string, passwordHash: string }): UserRow {
  const now = Date.now()
  const row: UserRow = {
    id: params.id,
    username: params.username,
    usernameLower: params.username.toLowerCase(),
    passwordHash: params.passwordHash,
    mustReset: false,
    status: 'pending',
    createdAt: now,
    approvedAt: null,
    approvedBy: null,
    bannedReason: null
  }
  db.insert(users).values(row).run()
  return row
}

export function findUserByUsername(db: Db, username: string): UserRow | null {
  const r = db.select().from(users)
    .where(eq(users.usernameLower, username.toLowerCase()))
    .get() as UserRow | undefined
  return r ?? null
}

export function findUserById(db: Db, id: string): UserRow | null {
  const r = db.select().from(users).where(eq(users.id, id)).get() as UserRow | undefined
  return r ?? null
}

export function listUsersByStatus(db: Db, status: UserStatus): UserRow[] {
  return db.select().from(users).where(eq(users.status, status)).all() as UserRow[]
}

export function approveUser(db: Db, id: string, approvedBy: string): void {
  db.update(users)
    .set({ status: 'approved', approvedAt: Date.now(), approvedBy })
    .where(eq(users.id, id))
    .run()
}

export function banUser(db: Db, id: string, reason: string | null): void {
  db.update(users)
    .set({ status: 'banned', bannedReason: reason })
    .where(eq(users.id, id))
    .run()
}

export function rejectUser(db: Db, id: string): void {
  db.delete(users).where(and(eq(users.id, id), eq(users.status, 'pending'))).run()
}

export function markMustReset(db: Db, id: string, value: boolean): void {
  db.update(users).set({ mustReset: value }).where(eq(users.id, id)).run()
}

export function updatePassword(db: Db, id: string, newHash: string): void {
  db.update(users).set({ passwordHash: newHash, mustReset: false }).where(eq(users.id, id)).run()
}
```

- [ ] **Step 4: Run test - pass**

Run: `pnpm vitest run tests/integration/services/users.test.ts`
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/users.ts tests/integration/services/users.test.ts
git commit -m "feat: service users con crud, status transitions, lookup case-insensitive"
```

---

## Task 7 — Service superadmins analogo

**Files:**
- Create: `server/services/superadmins.ts`
- Test: `tests/integration/services/superadmins.test.ts`

- [ ] **Step 1: Test**

Simile a users ma senza status/approvazione — solo insert/find/updatePassword/markMustReset/list.

- [ ] **Step 2: Implementazione**

API:
```ts
insertSuperadmin(db, { id, username, passwordHash, mustReset? }): SuperadminRow
findSuperadminByUsername(db, username): SuperadminRow | null
findSuperadminById(db, id): SuperadminRow | null
listSuperadmins(db): SuperadminRow[]
updatePassword(db, id, newHash): void  // azzera anche mustReset
markMustReset(db, id, value): void
```

- [ ] **Step 3: Commit**

```bash
git add server/services/superadmins.ts tests/integration/services/superadmins.test.ts
git commit -m "feat: service superadmins con crud base"
```

---

## Task 8 — Service sessions con sliding expiration

**Files:**
- Create: `server/services/sessions.ts`
- Test: `tests/integration/services/sessions.test.ts`

- [ ] **Step 1: Test (TDD)**

```ts
describe('sessions service', () => {
  it('createSession per user', () => { ... })
  it('createSession per superadmin', () => { ... })
  it('findSession restituisce row valida non scaduta', () => { ... })
  it('findSession returns null se scaduta', () => { ... })
  it('extendSession aggiorna last_activity_at e prolunga expires_at se dentro soglia', () => { ... })
  it('extendSession non prolunga se fuori soglia (sessione recente)', () => { ... })
  it('revokeSession cancella', () => { ... })
  it('revokeAllForUser cancella solo quelle dell user', () => { ... })
  it('cleanupExpired cancella scadute', () => { ... })
})
```

- [ ] **Step 2: Implementazione**

```ts
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 giorni
export const SESSION_EXTEND_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000 // prolunga se < 15d residui

export interface SessionRow { ... }

export function createSession(db, params: { token, userId? | superadminId?, ip?, userAgent? }): SessionRow { ... }
export function findSession(db, token): SessionRow | null  // null se scaduta
export function extendSession(db, token, now = Date.now()): void
export function revokeSession(db, token): void
export function revokeAllForUser(db, userId): void
export function revokeAllForSuperadmin(db, superadminId): void
export function cleanupExpiredSessions(db): number  // ritorna righe cancellate
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: service sessions con sliding expiration e revoca"
```

---

## Task 9 — Service auth-events append-only audit log

**Files:**
- Create: `server/services/auth-events.ts`
- Test: `tests/integration/services/auth-events.test.ts`

- [ ] **Step 1-3: TDD standard**

API:
```ts
export type AuthEventKind = 'register' | 'register_approved' | 'register_rejected' | 'login' | 'login_failed' | 'logout' | 'password_changed_self' | 'password_reset_by_admin' | 'banned' | 'session_expired'

export function logAuthEvent(db, { actorKind, actorId?, usernameAttempted?, event, ip?, userAgent?, detail? }): void
export function listAuthEvents(db, limit = 100): AuthEventRow[]
export function listAuthEventsByActor(db, actorKind, actorId, limit = 100): AuthEventRow[]
```

- [ ] **Commit**

```bash
git commit -m "feat: service auth-events per audit log append-only"
```

---

## Task 10 — Middleware auth: estrae identità da cookie

**Files:**
- Create: `server/utils/auth-middleware.ts`
- Test: `tests/integration/middleware/auth.test.ts`

- [ ] **Step 1-3: TDD**

API (helper da chiamare nei handler):
```ts
import type { H3Event } from 'h3'

export type AuthIdentity =
  | { kind: 'user', id: string, username: string, mustReset: boolean }
  | { kind: 'superadmin', id: string, username: string, mustReset: boolean }
  | null

export async function readAuthIdentity(event: H3Event): Promise<AuthIdentity>
export async function requireUser(event: H3Event): Promise<{ id, username, mustReset }>  // throws 401
export async function requireSuperadmin(event: H3Event): Promise<{ id, username, mustReset }>  // throws 401 or 403
```

Legge cookie `gdr_session`, trova session row, controlla expires_at, chiama extendSession, fa lookup user/superadmin.

- [ ] **Commit**

```bash
git commit -m "feat: middleware auth legge cookie gdr_session e autentica"
```

---

## Task 11 — Cookie helpers per SPA

**Files:**
- Create: `server/utils/session-cookie.ts`
- Test: `tests/unit/server/session-cookie.test.ts`

- [ ] **Step 1: Implementazione**

```ts
import type { H3Event } from 'h3'
import { setCookie, deleteCookie } from 'h3'

const COOKIE_NAME = 'gdr_session'

export function setSessionCookie(event: H3Event, token: string) {
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === 'production'
  })
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

export const SESSION_COOKIE_NAME = COOKIE_NAME
```

- [ ] **Commit**

```bash
git commit -m "feat: helpers cookie sessione gdr_session"
```

---

## Task 12 — Seed script superadmin

**Files:**
- Create: `scripts/seed-superadmin.ts`
- Modify: `package.json` — aggiornare `db:migrate` per chiamare il seed dopo
- Test: `tests/integration/services/seed-superadmin.test.ts`

- [ ] **Step 1: Test**

```ts
describe('seed superadmin', () => {
  it('inserisce admin/changeme con mustReset=true se tabella vuota', async () => {
    const db = createTestDb()
    await seedDefaultSuperadmin(db)
    const rows = listSuperadmins(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.username).toBe('admin')
    expect(rows[0]!.mustReset).toBe(true)
    expect(await verifyPassword('changeme', rows[0]!.passwordHash)).toBe(true)
  })
  it('no-op se esiste già un superadmin', async () => {
    const db = createTestDb()
    await seedDefaultSuperadmin(db)
    await seedDefaultSuperadmin(db)
    expect(listSuperadmins(db)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Implementare seedDefaultSuperadmin in superadmins service**

Esportare dalla service `seedDefaultSuperadmin(db: Db)`: idempotente.

- [ ] **Step 3: Creare script CLI**

`scripts/seed-superadmin.ts`:

```ts
import { createDbFromFile } from '~~/server/db/client'
import { seedDefaultSuperadmin } from '~~/server/services/superadmins'

const db = createDbFromFile('./data/gdr.sqlite')
const inserted = await seedDefaultSuperadmin(db)
console.log(inserted ? '[seed] superadmin admin/changeme creato (mustReset=true)' : '[seed] superadmin già presente, nessuna azione')
```

- [ ] **Step 4: Aggiornare package.json**

```json
"db:migrate": "drizzle-kit migrate && tsx scripts/seed-superadmin.ts"
```

- [ ] **Step 5: Verificare end-to-end**

```bash
rm -f data/gdr.sqlite
pnpm db:migrate
# attesa: migration ok, seed stampa "admin/changeme creato"
pnpm db:migrate
# attesa: seed stampa "già presente"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-superadmin.ts server/services/superadmins.ts package.json tests/integration/services/seed-superadmin.test.ts
git commit -m "feat: seed script superadmin default admin/changeme idempotente"
```

---

## Task 13 — Cleanup job sessioni scadute al boot

**Files:**
- Modify: `nuxt.config.ts` o nuovo `server/plugins/auth-startup.ts`

- [ ] **Step 1: Plugin Nitro**

Create `server/plugins/auth-startup.ts`:

```ts
import { useDb } from '~~/server/utils/db'
import { cleanupExpiredSessions } from '~~/server/services/sessions'
import { listSuperadmins } from '~~/server/services/superadmins'
import { verifyPassword } from '~~/server/services/auth'

export default defineNitroPlugin(async () => {
  const db = useDb()
  const n = cleanupExpiredSessions(db)
  if (n > 0) console.log(`[auth] cleanup: ${n} sessioni scadute rimosse`)

  // Warning default superadmin
  const sas = listSuperadmins(db)
  for (const sa of sas) {
    if (sa.mustReset && await verifyPassword('changeme', sa.passwordHash)) {
      console.warn(`⚠  SUPERADMIN "${sa.username}" con password di default. Cambia dalla /admin prima di andare live.`)
    }
  }
})
```

- [ ] **Commit**

```bash
git add server/plugins/auth-startup.ts
git commit -m "feat: plugin nitro cleanup sessioni e warning superadmin default"
```

---

## Task 14 — Endpoint POST /api/auth/register

**Files:**
- Create: `server/api/auth/register.post.ts`
- Test: `tests/integration/api/auth/register.test.ts`

- [ ] **Step 1: Test TDD**

Casi:
- 202 su valid → row users pending, event `register`
- 400 su invalid input
- 409 su username duplicato (case-insensitive)
- 429 su rate limit

- [ ] **Step 2: Rate limiter register**

Estendere `server/ws/rate-limit.ts` oppure creare `server/services/rate-limits.ts` con due limiter condivisi: `loginRateLimiter` e `registerRateLimiter`. Per ora aggiungere il registerRateLimiter (3/h per IP).

- [ ] **Step 3: Endpoint**

```ts
export default defineEventHandler(async (event) => {
  try {
    const body = RegisterBody.parse(await readBody(event))
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
    if (!registerRateLimiter.tryHit(ip)) {
      throw createError({ statusCode: 429, statusMessage: 'rate_limited' })
    }
    const db = useDb()
    if (findUserByUsername(db, body.username)) {
      logAuthEvent(db, { actorKind: 'anonymous', event: 'register', usernameAttempted: body.username, ip, detail: 'username_taken' })
      throw createError({ statusCode: 409, statusMessage: 'username_taken' })
    }
    const hash = await hashPassword(body.password)
    const user = insertUser(db, { id: generateUuid(), username: body.username, passwordHash: hash })
    logAuthEvent(db, { actorKind: 'anonymous', event: 'register', actorId: user.id, usernameAttempted: body.username, ip })
    setResponseStatus(event, 202)
    return { status: 'pending' }
  } catch (e) { toH3Error(e) }
})
```

- [ ] **Commit**

```bash
git commit -m "feat: endpoint /api/auth/register con rate limit e stato pending"
```

---

## Task 15 — Endpoint POST /api/auth/login

**Files:**
- Create: `server/api/auth/login.post.ts`
- Test: `tests/integration/api/auth/login.test.ts`

- [ ] **Step 1: Test TDD**

Casi:
- 200 su credenziali valide + stato approved → cookie set + body { mustReset: false }
- 401 su username inesistente o password errata (stessa response per evitare enumeration)
- 403 su pending
- 403 su banned
- 429 dopo 5 fail in 15 min per (username, ip)
- 200 con mustReset=true se flag attivo

- [ ] **Step 2: Endpoint**

Logica:
1. Parse body, estrai IP
2. Check rate limit per (usernameLower, ip)
3. Trova user: se mancante, `loginRateLimiter.tryHit` già contato, log `login_failed`, return 401 invalid_credentials
4. Verify password: se falso, log + rate limit, 401
5. Check status: pending → 403 account_pending; banned → 403 account_banned
6. createSession + setSessionCookie + log login
7. Reset rate limiter counter su success
8. Return `{ mustReset: user.mustReset }`

Nota: **il login superadmin vive su endpoint separato** `/api/admin/login` per semplificare (login.post.ts gestisce solo users).

- [ ] **Commit**

```bash
git commit -m "feat: endpoint /api/auth/login con cookie, rate limit, log"
```

---

## Task 16 — Endpoint POST /api/auth/logout e GET /api/auth/me

**Files:**
- Create: `server/api/auth/logout.post.ts`
- Create: `server/api/auth/me.get.ts`
- Test: `tests/integration/api/auth/logout-me.test.ts`

- [ ] **Step 1: Test**

- /logout senza cookie → 204 (idempotente)
- /logout con cookie valido → revoca session + clear cookie
- /me con cookie valido → 200 identity
- /me senza cookie → 401
- /me con session scaduta → 401

- [ ] **Step 2: Implementazione**

- [ ] **Commit**

```bash
git commit -m "feat: endpoint /api/auth/logout e /api/auth/me"
```

---

## Task 17 — Endpoint POST /api/auth/change-password

**Files:**
- Create: `server/api/auth/change-password.post.ts`
- Test: `tests/integration/api/auth/change-password.test.ts`

- [ ] **Step 1: Test**

- 401 senza cookie
- 401 con currentPassword errata
- 400 se newPassword uguale a currentPassword
- 200 su successo → updatePassword (azzera mustReset), revokeAllForUser tranne la corrente, log event
- Altri cookie dell'utente diventano invalidi

- [ ] **Commit**

```bash
git commit -m "feat: cambio password utente con revoca altre sessioni"
```

---

## Task 18 — Endpoint admin: login + change-password + lock su must_reset

**Files:**
- Create: `server/api/admin/login.post.ts`
- Create: `server/api/admin/logout.post.ts`
- Create: `server/api/admin/change-password.post.ts`
- Test: `tests/integration/api/admin/auth.test.ts`

- [ ] **Step 1: Test**

- Login admin default `admin`/`changeme` → 200 + body `{ mustReset: true }`
- Login admin wrong → 401
- Post-login ma con mustReset=true: ogni endpoint admin (tranne change-password e logout) risponde 403 `must_reset_first`
- change-password superadmin: azzera mustReset, da allora admin endpoints sbloccati

- [ ] **Step 2: helper `requireSuperadmin` enforce mustReset block**

Modificare `requireSuperadmin` per accettare un'opzione `{ allowMustReset?: boolean }` (default false). Se false e `mustReset=true` → throw 403 must_reset_first.

- [ ] **Commit**

```bash
git commit -m "feat: admin login con blocco must_reset"
```

---

## Task 19 — Endpoint admin: registrazioni pending (list + approve + reject)

**Files:**
- Create: `server/api/admin/registrations/index.get.ts`
- Create: `server/api/admin/registrations/[id]/approve.post.ts`
- Create: `server/api/admin/registrations/[id]/reject.post.ts`
- Test: `tests/integration/api/admin/registrations.test.ts`

- [ ] **Step 1: Test**

Flow: register → /admin/registrations?status=pending → approve → user può login.

- [ ] **Commit**

```bash
git commit -m "feat: admin endpoint per approvazione registrazioni"
```

---

## Task 20 — Endpoint admin: users ban + reset-password

**Files:**
- Create: `server/api/admin/users/[id]/ban.post.ts`
- Create: `server/api/admin/users/[id]/reset-password.post.ts`
- Test: `tests/integration/api/admin/users.test.ts`

- [ ] **Step 1: Test**

- Ban: user non può più loggare, sessioni revocate
- Reset password: ritorna temp pw, user riesce a loggare con la temp, mustReset blocca fino al cambio

- [ ] **Commit**

```bash
git commit -m "feat: admin endpoint ban e reset-password utenti"
```

---

## Task 21 — Endpoint admin: listing auth events

**Files:**
- Create: `server/api/admin/auth-events.get.ts`
- Test: `tests/integration/api/admin/auth-events.test.ts`

- [ ] **Commit**

```bash
git commit -m "feat: admin endpoint audit log auth"
```

---

## Task 22 — Modifica /api/parties e /api/parties/[seed]/join: richiedono auth

**Files:**
- Modify: `server/api/parties/index.post.ts`
- Modify: `server/api/parties/[seed]/join.post.ts`
- Delete: `server/api/parties/[seed]/reclaim-master.post.ts` (non serve più, master = creator)
- Delete: `server/api/parties/[seed]/resume.post.ts` (cookie sostituisce sessionToken)
- Modify: `shared/protocol/http.ts` — nuovo schema join con `displayName`
- Test: `tests/integration/api/parties-create.test.ts` (da aggiornare)
- Test: `tests/integration/api/parties-join.test.ts` (da aggiornare)

- [ ] **Step 1: Modificare schemi**

```ts
// Rimuove masterNickname, partyName (se cambia), nickname — li sostituisce con:
export const CreatePartyBody = z.object({
  cityName: z.string().min(1).max(64).optional() // opzionale, default random
})
export const JoinPartyBody = z.object({
  displayName: z.string().min(2).max(24).regex(NICKNAME_REGEX)
})
```

Rimuovere `ReclaimMasterBody`, `ResumeBody`.

- [ ] **Step 2: Modificare createParty service signature**

`createParty(db, { userId, cityName? }): { seed, cityState, masterPlayer }` — niente più masterToken.

- [ ] **Step 3: Modificare players service**

`joinParty(db, seed, { userId, displayName }): PlayerRow`. Se già esiste riga per `(seed, userId)`, aggiorna lastSeenAt e ritorna (re-join idempotente). Se displayName già preso nella party da altro user → errore.

- [ ] **Step 4: Endpoint create**

```ts
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const body = CreatePartyBody.parse(await readBody(event))
    const db = useDb()
    const result = await createParty(db, { userId: me.id, cityName: body.cityName })
    // … ritorno
  } catch (e) { toH3Error(e) }
})
```

- [ ] **Step 5: Endpoint join**

```ts
const me = await requireUser(event)
const body = JoinPartyBody.parse(await readBody(event))
const player = joinParty(db, seed, { userId: me.id, displayName: body.displayName })
```

- [ ] **Step 6: Rimuovere file deprecati**

```bash
git rm server/api/parties/[seed]/reclaim-master.post.ts
git rm server/api/parties/[seed]/resume.post.ts
```

- [ ] **Commit**

```bash
git commit -m "feat: parties endpoint richiedono auth, displayName per-party"
```

---

## Task 23 — WS party: auth via cookie, rimuove sessionToken

**Files:**
- Modify: `server/routes/ws/party.ts`
- Modify: `shared/protocol/ws.ts` — rimuove `sessionToken` da `HelloEvent`

- [ ] **Step 1: Schema HelloEvent**

```ts
export const HelloEvent = z.object({
  type: z.literal('hello'),
  seed: z.string()
})
```

- [ ] **Step 2: handleHello server**

```ts
async function handleHello(peer, seed) {
  const event = peer.request  // accesso al request h3 via peer
  const me = await readAuthIdentity(event)
  if (!me || me.kind !== 'user') {
    sendJson(peer, { type: 'error', code: 'session_expired' })
    peer.close(4001, 'session_expired')
    return
  }
  const db = useDb()
  const player = findPlayerByUserInParty(db, seed, me.id)
  if (!player || player.isKicked) {
    sendJson(peer, { type: 'error', code: 'not_member' })
    peer.close(4003, 'not_member')
    return
  }
  // resto del flow invariato…
}
```

Nota: `peer.request` potrebbe essere `peer.ctx.request` — vedere API Nitro websocket. Se non diretto, passare identità via `upgrade` handler.

- [ ] **Step 3: Test**

Aggiornare i test integration ws per usare cookie invece di sessionToken.

- [ ] **Commit**

```bash
git commit -m "feat: ws party autentica via cookie gdr_session"
```

---

## Task 24 — Store client auth + composable useAuth

**Files:**
- Create: `app/stores/auth.ts`
- Create: `app/composables/useAuth.ts`
- Test: `tests/unit/composables/use-auth.test.ts`

- [ ] **Step 1: Store**

```ts
export const useAuthStore = defineStore('auth', () => {
  const identity = ref<MeResponse | null>(null)
  const loading = ref(false)
  const isAuthenticated = computed(() => identity.value !== null)
  const isUser = computed(() => identity.value?.kind === 'user')
  const isSuperadmin = computed(() => identity.value?.kind === 'superadmin')
  async function fetchMe() { … }
  function setIdentity(me: MeResponse | null) { … }
  function reset() { identity.value = null }
  return { identity, loading, isAuthenticated, isUser, isSuperadmin, fetchMe, setIdentity, reset }
})
```

- [ ] **Step 2: Composable**

```ts
export function useAuth() {
  const store = useAuthStore()
  async function register(username, password) { … POST /api/auth/register, return {status:'pending'} }
  async function login(username, password) { … POST /api/auth/login, poi fetchMe }
  async function logout() { … POST /api/auth/logout, store.reset() }
  async function changePassword(current, next) { … }
  return { register, login, logout, changePassword, ...store }
}
```

- [ ] **Commit**

```bash
git commit -m "feat: store auth e composable useAuth"
```

---

## Task 25 — Middleware Nuxt auth: redirect se non loggato

**Files:**
- Create: `app/middleware/auth.global.ts`

- [ ] **Step 1: Implementazione**

```ts
import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()
  // Route pubbliche: /, /login, /register, /admin/login
  const publicRoutes = new Set(['/', '/login', '/register', '/admin/login'])
  if (publicRoutes.has(to.path)) return
  if (!auth.identity) await auth.fetchMe()
  // Pagine admin richiedono superadmin
  if (to.path.startsWith('/admin')) {
    if (auth.identity?.kind !== 'superadmin') return navigateTo('/admin/login')
    if (auth.identity.mustReset && to.path !== '/admin/change-password') return navigateTo('/admin/change-password')
    return
  }
  // Altre route richiedono user
  if (!auth.isUser.value) return navigateTo('/login')
  if (auth.identity?.mustReset && to.path !== '/me') return navigateTo('/me?force-reset=1')
})
```

- [ ] **Commit**

```bash
git commit -m "feat: middleware nuxt auth.global per route protette"
```

---

## Task 26 — Pagina /login (user)

**Files:**
- Create: `app/pages/login.vue`

- [ ] **Step 1: UI form**

Input username + password + submit. On 200 → redirect `/` (o `to.query.next` se presente).
Error handling: mostra toast con messaggio IT per invalid_credentials, account_pending, account_banned, rate_limited.

- [ ] **Commit**

```bash
git commit -m "feat: pagina login utente"
```

---

## Task 27 — Pagina /register

**Files:**
- Create: `app/pages/register.vue`

- [ ] **Step 1: UI**

Form username + password + conferma password. On 202 → schermata statica "Registrazione inviata, attendi approvazione".
Error handling: username_taken, weak_password, invalid_username, rate_limited.

- [ ] **Commit**

```bash
git commit -m "feat: pagina registrazione"
```

---

## Task 28 — Pagina /me (profilo utente)

**Files:**
- Create: `app/pages/me.vue`

- [ ] **Step 1: UI**

Mostra username, status. Form change-password. Bottone logout.
Se `mustReset`, highlight del form change-password in rosso e nega navigazione via router.

- [ ] **Commit**

```bash
git commit -m "feat: pagina me con cambio password e logout"
```

---

## Task 29 — Pagine admin: /admin/login, /admin/change-password, /admin/index

**Files:**
- Create: `app/pages/admin/login.vue`
- Create: `app/pages/admin/change-password.vue`
- Create: `app/pages/admin/index.vue`

- [ ] **Step 1: /admin/login**

Form separato da user login. Redirect post-login a /admin se mustReset=false, altrimenti /admin/change-password.

- [ ] **Step 2: /admin/change-password**

Form dedicato. Dopo successo → /admin/.

- [ ] **Step 3: /admin/index**

Shell dashboard minimale v2a:
- Tab "Registrazioni" (pending)
- Tab "Utenti" (approved + banned)
- Tab "Audit" (ultimi N eventi)
- Logout in sidebar

- [ ] **Commit**

```bash
git commit -m "feat: pagine admin con login, change-password, dashboard minimale"
```

---

## Task 30 — Rimuove useSession legacy + `/` flusso login-wall

**Files:**
- Delete: `app/composables/useSession.ts` (se possibile; altrimenti refactor a wrapper su useAuth)
- Modify: `app/pages/index.vue` — non più form nickname, diventa hub post-login
- Modify: `app/pages/party/[seed].vue` — rimuove lettura sessionToken

- [ ] **Step 1: Home page v2a**

`/` mostra:
- Se non loggato: "Benvenuto, fai login o registrati" + link
- Se loggato user: bottone "Crea nuova party" + placeholder "Le tue party (v2b)"
- Se loggato superadmin: redirect /admin/

- [ ] **Step 2: party/[seed] page**

Rimuove `session.getSession(seed)`. La guardia di accesso diventa: se `useAuth` è autenticato E `player.userId === me.id` (verificato dal server all'upgrade), procede. Altrimenti redirect a `/` con toast not_member.

- [ ] **Commit**

```bash
git commit -m "feat: home diventa hub post-login, party page usa cookie auth"
```

---

## Task 31 — Error feedback IT per nuovi codici

**Files:**
- Modify: `app/composables/useErrorFeedback.ts`

- [ ] **Step 1: Mappe**

Aggiungere toast IT per: invalid_credentials, account_pending, account_banned, username_taken, weak_password, invalid_username, must_reset_first, session_expired, not_member. Alcuni bloccanti (es. session_expired se eri in party). Alcuni toast.

- [ ] **Commit**

```bash
git commit -m "feat: feedback italiano per errori auth"
```

---

## Task 32 — Smoke test manuale end-to-end

Nessun commit. Checklist manuale da eseguire dopo i task 1-31:

- [ ] `rm -f data/gdr.sqlite && pnpm db:migrate` → seed admin
- [ ] `pnpm dev` → warning console superadmin default
- [ ] Browser `/admin/login` → `admin / changeme` → forzato change-password
- [ ] Cambia password admin → /admin dashboard accessibile
- [ ] Browser (altra finestra) `/register` → crea `anna / anna1234`
- [ ] Dashboard admin → tab Registrazioni → approva `anna`
- [ ] Browser → `/login` → `anna / anna1234` → `/me`
- [ ] Click "Crea party" → crea, redirect a `/party/<seed>` → OK
- [ ] Browser 3 `/register` → crea `bob / bob12345` → approva
- [ ] Browser 3 → `/login` `bob / bob12345`
- [ ] Browser 3 → navigate a `/party/<seed>` → chiede displayName (flow TBD)
- [ ] Bob si unisce → entrambi vedono party, chat funziona
- [ ] Anna manda messaggio, Bob lo riceve
- [ ] Dashboard admin ban `bob` → Bob viene disconnesso WS, tentativo login 403
- [ ] Reset password Bob dal dashboard → temp pw → Bob login → forza change-password

---

## Task 33 — Aggiornare README con auth section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Sezione Auth**

Spiega:
- Avvio: `pnpm db:migrate` crea l'admin default `admin/changeme`
- Primo login: `/admin/login` (NB: URL separato da user)
- Warning console finché password default attiva
- User registration: self-service con approvazione
- Cookie session, 30d sliding

- [ ] **Commit**

```bash
git commit -m "docs: sezione auth in readme"
```

---

## Task 34 — Gate finale v2a

- [ ] `pnpm lint && pnpm typecheck && pnpm test` tutti verdi
- [ ] Numero test ≥ 240 (baseline pre-v2a 217 + ~25 nuovi)
- [ ] Smoke manuale Task 32 completato senza bug
- [ ] Commit finale:

```bash
git commit --allow-empty -m "chore: chiude plan 7 auth v2a"
```

Opzionale: tag `v0.2.0-auth`.

---

## Checklist

- [ ] Task 1 — schema drizzle
- [ ] Task 2 — migration 0002 + clean break + 0003 check sessions
- [ ] Task 3 — codici errore nuovi
- [ ] Task 4 — schemi http zod
- [ ] Task 5 — service auth primitives
- [ ] Task 6 — service users
- [ ] Task 7 — service superadmins
- [ ] Task 8 — service sessions
- [ ] Task 9 — service auth-events
- [ ] Task 10 — middleware auth
- [ ] Task 11 — cookie helpers
- [ ] Task 12 — seed script
- [ ] Task 13 — cleanup plugin
- [ ] Task 14 — /api/auth/register
- [ ] Task 15 — /api/auth/login
- [ ] Task 16 — /api/auth/logout + /me
- [ ] Task 17 — /api/auth/change-password
- [ ] Task 18 — admin login + lock must_reset
- [ ] Task 19 — admin registrations
- [ ] Task 20 — admin ban + reset-password
- [ ] Task 21 — admin auth-events
- [ ] Task 22 — parties endpoint richiedono auth
- [ ] Task 23 — ws auth via cookie
- [ ] Task 24 — store + composable
- [ ] Task 25 — middleware nuxt
- [ ] Task 26 — /login
- [ ] Task 27 — /register
- [ ] Task 28 — /me
- [ ] Task 29 — /admin/*
- [ ] Task 30 — rimuove useSession, home hub
- [ ] Task 31 — error feedback IT
- [ ] Task 32 — smoke manuale
- [ ] Task 33 — readme
- [ ] Task 34 — gate finale
