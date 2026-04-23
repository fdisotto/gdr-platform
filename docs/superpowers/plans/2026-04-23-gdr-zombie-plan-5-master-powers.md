# GDR Zombie — Plan 5: Poteri master

> Prerequisito: Plan 4 completato. Chat completa, DM, paginazione storia funzionanti.

**Goal:** Implementare tutti i poteri master definiti nello spec §8: cancellare/modificare messaggi, mutare, kickare, bannare, sbannare, muovere (teletrasporto), chiudere/aprire aree, cambiare stato/nome area, override meteo, impersonare NPC, annuncio globale, hidden roll. Layout sidebar sinistra completo (specifica §7). Audit log completo (`master_actions`). Observer view per il master (tab "Tutto").

**Architettura:** Aggiungiamo handler WS dedicati per ogni azione master, tutti gate-d da un middleware `requireMaster(conn)`. Ogni azione produce una riga in `master_actions` tramite il nuovo `server/services/master-actions.ts`. La UI aggiunge `MasterPanel.vue` (vista principale alternativa), context menu click-destra su messaggi e giocatori, slash commands master (già parsati in Plan 4 ma non eseguiti). Sidebar sinistra diventa il layout ufficiale dello spec (§7).

---

## Task 1 — Servizio master-actions (audit)

**Files:**
- Create: `server/services/master-actions.ts`
- Create: `tests/integration/services/master-actions.test.ts`

- [ ] Funzioni: `logMasterAction(db, { partySeed, masterId, action, target?, payload? })`, `listMasterActions(db, partySeed, limit)`.
- [ ] TDD. Commit.

---

## Task 2 — Middleware requireMaster + error codes

**Files:**
- Modify: `server/routes/ws/party.ts` o nuovo `server/ws/auth.ts`.

Helper:
```ts
function requireMaster(conn: ConnectionInfo, role: 'user' | 'master'): boolean {
  return role === 'master'
}
```
+ wrapper in `handleMessage` che guarda `parsed.type.startsWith('master:')` e se il role non è master risponde `error master_only`.

- [ ] Commit.

---

## Task 3 — master:delete + master:edit

**Files:**
- Modify: `server/routes/ws/party.ts`
- Create: `tests/integration/ws/master-moderation.test.ts`

**Logica:**
- `master:delete { messageId }`:
  - verifica messaggio esiste e appartiene alla party.
  - `softDeleteMessage(db, messageId, masterId)` + audit.
  - Broadcast `message:update` con il row aggiornato a tutti gli interessati (stesso fan-out del kind originale).
- `master:edit { messageId, newBody }`:
  - verifica body ≤ 2000 char.
  - Salva `payload: { previousBody }` in master-actions.
  - `editMessage(db, messageId, newBody)`.
  - Broadcast `message:update`.

UI player: messaggio soft-deleted appare come `[messaggio rimosso]`. Master vede originale barrato.

- [ ] TDD integration. Commit.

---

## Task 4 — master:mute / unmute

**Files:**
- Modify: `server/services/players.ts` (`setMute(db, playerId, muted, untilMs?)`)
- Modify: `server/routes/ws/party.ts`
- Extend: `tests/integration/ws/master-moderation.test.ts`

**Logica:**
- `master:mute { playerId, value, minutes? }`: aggiorna `isMuted`, `mutedUntil` (null = permanent).
- Broadcast `player:muted { playerId, value, mutedUntil? }` a tutti gli interessati.
- `handleChatSend`: se player muted (+ mutedUntil > now), `error muted`.
- Auto-unmute lazy: se `mutedUntil <= now`, trattarlo come unmuted.

- [ ] Test: mutato non può scrivere, unmutato può.
- [ ] Commit.

---

## Task 5 — master:kick / ban / unban

**Files:**
- Modify: `server/services/players.ts` (`kickPlayer`, ban già in Plan 1)
- Modify: `server/services/bans.ts` (nuovo? oppure aggiungi a players.ts)
- Modify: `server/routes/ws/party.ts`

**Logica:**
- `master:kick { playerId, reason? }`: mark `isKicked=true`, invalida `sessionToken`, send `kicked` al target, close WS. Audit.
- `master:ban { playerId, reason? }`: kick + insert in `bans` table. Audit.
- `master:unban { nicknameLower }`: delete from bans. Audit.

Broadcast `player:left { playerId, reason }` agli altri (escluso il kickato).

- [ ] TDD. Commit.

---

## Task 6 — master:move (teleport)

**Files:**
- Modify: `server/routes/ws/party.ts`

**Logica:**
- `master:move { playerId, toAreaId }`: ignora adiacenza, chiamato come `handleMoveRequest` ma con from/to arbitrari. `player:moved { teleported: true }` broadcast.
- Permette anche auto-teleport del master.

- [ ] TDD. Commit.

---

## Task 7 — master:area (status, customName, notes)

**Files:**
- Modify: `server/services/areas.ts` (`updateArea`, `closeArea`, `openArea` — Task 4 Plan 3 fatto già close/open)
- Modify: `server/routes/ws/party.ts`

**Logica:**
- `master:area { areaId, patch: { status?, customName?, notes? } }`: update `areas_state` row.
- Broadcast `area:updated { patch: full row }`.

Slash commands: `/close`, `/open`, `/setname`, `/status` mappano qui o su `master:area-close`/`master:area-open` dedicati (scegliere: unico evento generico + campi booleani `close`/`open` — più pulito).

Proposta: `master:area { areaId, patch: { status?, customName?, notes?, closed? } }`. Se `closed === true`: insert in area_access_bans. Se `closed === false`: delete. Il resto fa update di `areas_state`.

- [ ] TDD. Commit.

---

## Task 8 — master:weather (override)

**Files:**
- Create: `server/services/weather-overrides.ts`
- Modify: `server/routes/ws/party.ts`

**Logica servizio:**
- `setOverride(db, seed, areaId | null, { code, intensity, expiresAt? })` — nota il problema SQLite null-pk: usa `'*'` come sentinel per global (e convert `null ↔ '*'` al boundary).
- `clearOverride(db, seed, areaId | null)`.
- `listOverrides(db, seed)`.

**Logica handler:**
- `master:weather { areaId: string | null, clear: bool, code?, intensity?, expiresAt? }`.
- Broadcast `weather:updated { areaId, effective }`. Effective è calcolato post-override.

Client usa `useAreaWeather` (Plan 3) e riconcilia con override quando arriva l'evento.

- [ ] TDD. Commit.

---

## Task 9 — master:npc

**Files:**
- Modify: `server/routes/ws/party.ts`

**Logica:**
- `master:npc { areaId, npcName, body }`: inserisce `messages` con `kind='npc'`, `authorPlayerId: masterId`, `authorDisplay: npcName`. Broadcast con fan-out `npc` (area + master).
- UI: renderizza con badge NPC (già Plan 4 task 5 copre il kind).

- [ ] TDD. Commit.

---

## Task 10 — master:announce

**Files:**
- Modify: `server/routes/ws/party.ts`

**Logica:**
- `master:announce { body }`: inserisce messaggio `kind='announce'`, `areaId: null`. Broadcast a TUTTI i player della party.
- UI: toast fullwidth + riga persistente in chat.

- [ ] TDD. Commit.

---

## Task 11 — master:roll hidden

**Files:**
- Modify: `server/routes/ws/party.ts`

**Logica:**
- `master:roll { expr, hidden: true }`: stesso parse roll di Plan 4 Task 3, ma:
  - `kind='roll'`, ma fan-out ristretto a soli conn con `role='master'`.
  - Persist (serve per storico master).

- [ ] TDD. Commit.

---

## Task 12 — Context menu messaggio + player

**Files:**
- Create: `app/components/chat/MessageContextMenu.vue`
- Create: `app/components/players/PlayerActionsMenu.vue`

**Menu messaggio (tasto destro / click icona "⋮"):**
- Sempre: "Copia testo".
- Autore o master: "Modifica".
- Master: "Cancella".

**Menu player (click su avatar sidebar o mappa):**
- Self: niente azione.
- Master targeting un altro player: "Mute / Unmute", "Kick", "Ban", "Unban" (se bannato), "Muovi a…" (submenu aree).

Implementazione: Nuxt UI fornisce `UContextMenu` o simile; altrimenti `<teleport>` + position-fixed + click-outside.

Invia i rispettivi `master:*` via `connection.send`.

- [ ] Commit.

---

## Task 13 — Layout sidebar sinistra (definitivo)

**Files:**
- Modify: `app/pages/party/[seed].vue`
- Create: `app/components/layout/GameSidebar.vue`
- Create: `app/components/layout/ServerClock.vue`

Layout ASCII (da spec §7 rivista):

```
┌──────────────────────────────────────────────────┐
│ HEADER                                           │
├─────────┬────────────────────────────────────────┤
│ SIDEBAR │   VISTA PRINCIPALE                     │
│  280px  │   GameMap / DM / Players / Master      │
│  ⏱ ora  │   55vh                                 │
│  ☁ mete │                                        │
│  🗺 Mapp├────────────────────────────────────────┤
│  💬 Mess│   CHAT (45vh)                          │
│  👥 Gio │                                        │
│  ⚙ Mast │                                        │
└─────────┴────────────────────────────────────────┘
```

- `GameSidebar` contiene `<ServerClock>`, `<WeatherBadge>`, nav items (icon + label), footer con area corrente e pulsanti cambio nickname/esci.
- Store UI: `useViewStore` (`defineStore('view', () => ({ mainView: 'map' | 'dm' | 'players' | 'master' }))`).
- Nav items cambiano `mainView`.

- [ ] Commit.

---

## Task 14 — MasterPanel (strumenti master)

**Files:**
- Create: `app/components/master/MasterPanel.vue`
- Create: `app/components/master/MasterActionsLog.vue`
- Create: `app/components/master/AreaControls.vue`
- Create: `app/components/master/WeatherControls.vue`
- Create: `app/components/master/AnnounceEditor.vue`
- Create: `app/components/master/NpcSpeaker.vue`
- Create: `app/components/master/HiddenRollTool.vue`

Vista attivata quando `mainView === 'master'`. Accessibile solo se `me.role === 'master'`.

**Componenti:**
- `MasterActionsLog`: fetch via nuovo evento `master:fetch-actions` o GET `/api/parties/:seed/master-actions`. Tabella scroll.
- `AreaControls`: griglia 14 card con stato attuale, dropdown per cambiare status, input custom name, toggle closed/open.
- `WeatherControls`: select area (o globale `*`), select code, slider intensity, toggle expiresAt.
- `AnnounceEditor`: textarea + preview + send.
- `NpcSpeaker`: input npcName + body + area select.
- `HiddenRollTool`: input expression + bottone rolla; storico roll nascosti (solo master).

Ogni componente invia il corrispondente evento master via `connection.send`.

- [ ] Commit (potrebbe essere suddiviso in più task-step per commit più piccoli).

---

## Task 15 — Tab "Tutto" chat per master (observer)

**Files:**
- Modify: `app/components/chat/ChatTabs.vue`
- Modify: `app/stores/chat.ts`

**Logica:**
- Master vede tab extra "Tutto" che aggrega messaggi da tutte le aree ordinati per createdAt.
- Filtro opzionale per kind dropdown.
- Server invia al master al `hello` anche una mini-history globale (ultimi 50 messaggi di tutta la party). Gli eventi `message:new` già arrivano al master indipendentemente dall'area.

- [ ] Commit.

---

## Task 16 — Gate finale Plan 5

- [ ] `pnpm lint && pnpm typecheck && pnpm build && pnpm test` verdi.
- [ ] Manual E2E: master può fare tutto quanto sopra; user vede effetti appropriati.
- [ ] Commit chiusura:

```
git commit --allow-empty -m "chore: chiude plan 5 poteri master"
```

---

## Checklist

- [ ] Task 1 — audit log service
- [ ] Task 2 — requireMaster middleware
- [ ] Task 3 — master:delete + edit
- [ ] Task 4 — mute/unmute
- [ ] Task 5 — kick/ban/unban
- [ ] Task 6 — teleport
- [ ] Task 7 — master:area
- [ ] Task 8 — master:weather override
- [ ] Task 9 — master:npc
- [ ] Task 10 — master:announce
- [ ] Task 11 — master:roll hidden
- [ ] Task 12 — context menu messaggio/player
- [ ] Task 13 — layout sidebar sinistra definitivo
- [ ] Task 14 — MasterPanel + sub-components
- [ ] Task 15 — tab "Tutto" master
- [ ] Task 16 — gate
