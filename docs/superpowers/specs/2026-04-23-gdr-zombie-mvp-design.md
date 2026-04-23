# GDR Zombie — MVP Design Spec

**Data:** 2026-04-23
**Stato:** approvato in brainstorming, in attesa di review finale utente prima del plan implementativo
**Autore:** utente + assistente (sessione brainstorming)

---

## 1. Obiettivo

Costruire un MVP di piattaforma web per gestire un gioco di ruolo dal vivo a tema zombi / post-apocalittico. Giocatori e master si ritrovano in una **party** identificata da un seed, si muovono su una mappa fissa di una città post-apocalittica, chattano per area con i controlli di un GDR classico (parlato, sussurro, emote, OOC, tiri di dado, grido, DM), e il master modera l'intera esperienza.

Non c'è registrazione: si sceglie un nickname al primo accesso, salvato in localStorage. Le estensioni future (login, dashboard interne, multi-mappa) sono fuori scope.

## 2. Ambito MVP

### In scope
- Creazione party con seed UUID + master-token segreto.
- Join via seed; reclaim master via master-token; resume sessione via session-token.
- Mappa fissa di 14 aree con grafo di adiacenza, stato per-area derivato dal seed (+ override master), meteo dinamico per area in funzione di seed + orario server + stagione + override master.
- Chat per area con 10 kind di messaggi: `say`, `whisper`, `emote`, `ooc`, `roll`, `shout`, `dm`, `npc`, `announce`, `system`.
- Posizione fisica del giocatore sulla mappa, movimento libero fra aree adiacenti, teletrasporto master.
- Direct messages cross-area, cross-party **no** (DM solo intra-party).
- Poteri master completi: leggere tutto, cancellare, modificare, mutare, kickare, bannare, muovere, chiudere aree, cambiare stato area/nome, override meteo, impersonare NPC, annuncio globale, roll nascosti.
- Log delle azioni master per audit.
- Palette dark-only a tema zombi.
- Party scala fino a ~30 player + 1 master. Desktop-first, mobile accettato ma non prioritario.
- Persistenza totale messaggi (soft-delete per cancellazioni master), paginazione "carica più" on-demand.

### Fuori scope (esplicitamente)
- Login/registrazione, password reset.
- Dashboard interne amministrative, analytics.
- Multi-party **attiva in contemporanea** (una sola WS/gioco attivo per browser — si possono avere più sessioni salvate in localStorage e switchare, ma non giocare in parallelo in più tab), multi-mappa, mappa generata proceduralmente.
- Voice chat, video.
- Inventario, character sheet strutturati, sistema di regole.
- Mobile-first / touch gestures avanzate.
- Ban cross-device robusto (senza auth non è possibile; limitation nota).

## 3. Architettura

### Stack
- **Frontend**: Nuxt 4 (Vue 3 `<script setup>`, TypeScript), Nuxt UI 4, TailwindCSS 4, Pinia.
- **Backend**: Nitro (stesso processo Nuxt), WebSocket handler, Drizzle ORM, SQLite (`better-sqlite3`).
- **Validazione**: Zod ai confini (HTTP e WS), contratti tipizzati condivisi in `shared/`.
- **Test**: Vitest + `@nuxt/test-utils`.
- **Hash master-token**: `bcryptjs` (factor 8, MVP).

### Data flow
1. Client invia evento → validazione Zod client → WS send.
2. Server riceve → validazione Zod → check permessi (ruolo, mute, posizione) → scrittura DB → fan-out WS deterministico a soli destinatari interessati.
3. Client riceve evento → Pinia store aggiorna → UI reattiva.

### Concetti chiave
- **Party**: aggregato root identificato da `seed` (UUID v4). Il seed è sia codice di join pubblico sia input del generatore deterministico dello stato iniziale aree + nome città + meteo base.
- **Session**: coppia `(party, player)` in memoria server + riga `players` in DB, identificata da `sessionToken` persistito in localStorage.
- **Area**: entità del catalogo statico (14 aree) con stato per-party persistito (status, custom name, note).
- **Master**: player con `role = 'master'`. Uno per party. Possessore del `masterToken` segreto.

## 4. Schema database (Drizzle / SQLite)

```
parties
  seed              TEXT PK              -- UUID v4 pubblico (codice join + seed generator)
  master_token_hash TEXT NOT NULL        -- bcrypt hash del master-token
  city_name         TEXT NOT NULL        -- derivato dal seed
  created_at        INTEGER NOT NULL
  last_activity_at  INTEGER NOT NULL

players
  id                TEXT PK              -- uuid stabile per (party, nickname)
  party_seed        TEXT NOT NULL FK
  nickname          TEXT NOT NULL
  role              TEXT NOT NULL        -- 'user' | 'master'
  current_area_id   TEXT NOT NULL        -- FK logica al catalogo aree
  is_muted          INTEGER NOT NULL DEFAULT 0
  muted_until       INTEGER              -- nullable epoch ms
  is_kicked         INTEGER NOT NULL DEFAULT 0
  joined_at         INTEGER NOT NULL
  last_seen_at      INTEGER NOT NULL
  session_token     TEXT NOT NULL        -- usato per WS handshake / resume
  UNIQUE(party_seed, nickname)

areas_state
  party_seed        TEXT NOT NULL FK
  area_id           TEXT NOT NULL
  status            TEXT NOT NULL        -- 'intact'|'infested'|'ruined'|'closed'
  custom_name       TEXT
  notes             TEXT
  PRIMARY KEY (party_seed, area_id)

messages
  id                TEXT PK
  party_seed        TEXT NOT NULL FK
  kind              TEXT NOT NULL        -- 'say'|'whisper'|'emote'|'ooc'|'roll'|'shout'|'dm'|'npc'|'announce'|'system'
  author_player_id  TEXT                 -- null per system
  author_display    TEXT NOT NULL        -- snapshot nickname / NPC name
  area_id           TEXT                 -- null per dm globali / announce
  target_player_id  TEXT                 -- per whisper/dm
  body              TEXT NOT NULL
  roll_payload      TEXT                 -- JSON se kind='roll'
  created_at        INTEGER NOT NULL
  deleted_at        INTEGER              -- soft delete
  deleted_by        TEXT                 -- master player_id
  edited_at         INTEGER
  INDEX (party_seed, area_id, created_at)
  INDEX (party_seed, target_player_id, created_at)

area_access_bans
  party_seed        TEXT NOT NULL
  area_id           TEXT NOT NULL
  reason            TEXT
  PRIMARY KEY (party_seed, area_id)

weather_overrides
  party_seed        TEXT NOT NULL
  area_id           TEXT                 -- null = globale (override su tutte le aree)
  code              TEXT NOT NULL        -- 'clear'|'overcast'|'fog'|'rain'|'ashfall'|'redSky'|'storm'|'night'
  intensity         REAL NOT NULL
  set_at            INTEGER NOT NULL
  expires_at        INTEGER              -- null = permanente
  PRIMARY KEY (party_seed, area_id)

master_actions
  id                TEXT PK
  party_seed        TEXT NOT NULL
  master_id         TEXT NOT NULL
  action            TEXT NOT NULL
  target            TEXT
  payload           TEXT                 -- JSON opzionale
  created_at        INTEGER NOT NULL
  INDEX (party_seed, created_at)

bans
  party_seed        TEXT NOT NULL
  nickname_lower    TEXT NOT NULL
  reason            TEXT
  banned_at         INTEGER NOT NULL
  PRIMARY KEY (party_seed, nickname_lower)
```

**Note:**
- Messaggi **soft-deleted**: la UI player mostra `[messaggio rimosso]`, il master vede l'originale barrato.
- `player_id` stabile su `(party, nickname)` unico → reconnect idempotente.

## 5. Mappa e stato seed-derivato

### Catalogo aree (statico, `shared/map/areas.ts`)

Aree (14): `piazza`, `giardino`, `supermercato`, `ospedale`, `chiesa`, `polizia`, `scuola`, `rifugio`, `benzinaio`, `case`, `fogne`, `porto`, `radio`, `ponte`.

### Adiacenza (simmetrica, validata in test)

```
piazza       ↔ chiesa, polizia, supermercato, giardino, case
giardino     ↔ piazza, scuola, case
supermercato ↔ piazza, benzinaio, case
ospedale     ↔ scuola, fogne, case
chiesa       ↔ piazza, scuola, fogne
polizia      ↔ piazza, benzinaio, case
scuola       ↔ giardino, ospedale, chiesa
rifugio      ↔ fogne, porto
benzinaio    ↔ supermercato, polizia, ponte
case         ↔ piazza, giardino, supermercato, ospedale, polizia
fogne        ↔ piazza, ospedale, chiesa, rifugio
porto        ↔ rifugio, ponte, radio
radio        ↔ porto, ponte
ponte        ↔ benzinaio, porto, radio
```

`rifugio`/`porto`/`radio`/`ponte` formano un cluster "fuori città" intenzionalmente periferico.

### Derivazione deterministica dal seed

`deriveCityState(seedUuid) → { cityName, areas: { [id]: { status, customName } } }`:
- SHA-256 del seed, primi 8 byte → u64 → seme per Mulberry32 PRNG.
- `cityName`: pescato da lista statica (~40 nomi tematici) + 30% chance di suffisso ("— Quarantena", "— Zona 3", "— Settore C").
- Per ogni area: distribuzione 40% `intact`, 35% `infested`, 20% `ruined`, 5% `closed`. **Vincolo fisso:** `piazza` è sempre `intact` (punto di spawn).
- `customName`: 30% chance per area di pescare un nome alternativo tematico.
- Calcolato server-side su `POST /api/parties`, salvato in `areas_state`.

### Meteo dinamico (`shared/map/weather.ts`)

`computeWeather(seed, areaId, serverTime) → { code, intensity, label }`

Fattori:
- **seed**: stabilità per party (stesso seed → stesso schema).
- **areaId**: modificatori tematici (fogne → umido/stagnante; radio → vento/cieli aperti; porto → bruma; ospedale → neutro clinico; ecc.).
- **ora del giorno** estratta da `serverTime`: 6–18 diurno, 18–22 crepuscolo, 22–6 notturno (bias verso `night`/`fog`).
- **stagione** estratta da mese: inverno (dic-feb) bias `fog`/`night`; primavera (mar-mag) più `clear`/`overcast`; estate (giu-ago) bias `ashfall`/`redSky`/`storm`; autunno (set-nov) bias `rain`/`overcast`.

Funzione pura, ricalcolata on-demand. Nessuna persistenza del risultato.

**Override master:** tabella `weather_overrides`. Scope per-area o globale (`area_id = null`). `effectiveWeather = override || computed`. Master può rimuovere override.

### Formato rendering: SVG inline

Decisione: **SVG inline**, niente Leaflet/Canvas per MVP.

- Ogni area è un componente Vue `<MapArea>` che emette un `<g>` con `<path>`/`<rect>` stilizzato a tema.
- Avatar giocatori: `<MapAvatar>` — cerchio 14px, colore hash-derivato dal nickname, bordo distintivo per self / master.
- Stati area: overlay visivo differenziato (`intact` pulita; `infested` pattern diagonale verde; `ruined` crepe + desaturazione; `closed` cancello + oscuramento).
- Meteo globale/locale: overlay su canvas mappa con `<pattern>` SVG + `@keyframes` CSS (rain traslazione diagonale, fog opacity pulsing, ashfall particelle animate).
- Pan/zoom: **rimosso dall'MVP**. ViewBox fisso che mostra tutte le 14 aree. Migrazione futura a Leaflet prevista se la mappa evolve (multi-city, zoom su dettagli).
- Interazione: hover su area = alone + tooltip; click area adiacente = `move:request`; click area non adiacente = feedback "non raggiungibile"; master ignora restrizioni.

## 6. Protocollo HTTP e WebSocket

### HTTP (one-shot, JSON body, tutti con Zod schemas in `shared/protocol/http.ts`)

- `POST /api/parties` — body `{ masterNickname }`. Crea party, genera seed UUID, master-token, hash, salva master come player, pre-popola `areas_state`. Risposta `{ seed, masterToken, sessionToken, playerId, initialState }`.
- `POST /api/parties/:seed/join` — body `{ nickname }`. Crea player con ruolo user. Verifica ban, conflict nickname. Risposta `{ sessionToken, playerId, initialState }`.
- `POST /api/parties/:seed/reclaim-master` — body `{ masterToken }`. Verifica hash. Risposta come join.
- `POST /api/parties/:seed/resume` — body `{ sessionToken }`. Ripristina sessione post-refresh. Risposta come join.

`initialState` contiene: `party`, `players` online, `areasState`, ultimi 100 messaggi per area corrente + ultimi 50 DM, `serverTime`.

### WebSocket `/ws/party`

Client → server (`defineWebSocketHandler`, validati Zod):
```
hello            { seed, sessionToken }
chat:send        { kind, body, areaId?, targetPlayerId?, rollExpr? }
move:request     { toAreaId }
master:delete    { messageId }
master:edit      { messageId, newBody }
master:mute      { playerId, value, minutes? }
master:kick      { playerId, reason? }
master:ban       { playerId, reason? }
master:move      { playerId, toAreaId }
master:area      { areaId, status?, customName?, closed? }
master:npc       { areaId, npcName, body }
master:announce  { body }
master:roll      { expr, hidden: true }
master:weather   { areaId | null, code?, intensity?, clear? }
master:fetch-history  { areaId?, playerId?, before, limit }
master:unban     { nicknameLower }
```

Server → client:
```
state:init       { me, party, players, areasState, messagesByArea, dms, serverTime }
message:new      { message }
message:update   { message }       -- edit/delete
player:joined    { player }
player:left      { playerId }
player:moved     { playerId, fromAreaId, toAreaId, teleported? }
player:muted     { playerId, value, mutedUntil? }
player:kicked    { playerId, reason? }
area:updated     { areaId, patch }
weather:updated  { areaId | null, effective }
time:tick        { serverTime }    -- ogni 60s per risincro
error            { code, detail }
kicked           { reason }        -- tu sei stato kickato, WS chiusa
session_superseded { }             -- altra tab ha preso la sessione
```

### Fan-out
- `say`, `emote`, `ooc`: player in area + master.
- `whisper`: mittente + target + master.
- `shout`: area + aree adiacenti + master.
- `dm`: mittente + target + master.
- `roll` pubblico: come `say`. `roll` hidden: solo master.
- `npc`: player in area + master.
- `announce`: tutti.
- `system`: destinatari logici dell'evento (es. il player mutato + master + area in cui è).

### Rate limit
- 5 msg/sec per player, in-memory, rolling window. Master escluso. Risposta `error { code: 'rate_limited' }`.

## 7. Sessione, autenticazione, layout

### Flusso home `/`
1. Nickname: legge `localStorage['gdr.nickname']`. Form se assente (2–24 char, `[a-zA-Z0-9 _-]`).
2. Sessioni attive: legge `localStorage['gdr.sessions']` → card "Riprendi partita". Click → `POST /resume`. 404/invalid → rimuovi entry.
3. Azioni:
   - **Crea party** (sempre come master) → `POST /api/parties` → modale "Ecco i tuoi codici" (seed + masterToken copiabili, warning "conservalo"). Salva in `localStorage['gdr.masterTokens'][seed]` e `gdr.sessions[seed]`. Redirect `/party/:seed`.
   - **Unisciti** (user/master radio): user → join; master → richiede masterToken → reclaim.

### Rotta `/party/:seed`
- Guard: sessione locale presente, altrimenti redirect `/` con `?join=<seed>`.
- Mount: WS connect → `hello` → `state:init`.
- Layout desktop-first:

```
┌────────────────────────────────────────────────────────────────────┐
│ HEADER: nome città · seed short · nickname · ruolo                │
├───────────────┬────────────────────────────────────────────────────┤
│ SIDEBAR (L)   │   VISTA PRINCIPALE                                 │
│  280px fissa  │   default: <GameMap />                             │
│               │   alt: DirectMessages / PlayersList / MasterPanel  │
│  ⏱ serverTime │   altezza 55vh                                     │
│  ☁ weather    │                                                    │
│  🗺 Mappa     │                                                    │
│  💬 Messaggi  ├────────────────────────────────────────────────────┤
│  👥 Giocatori │   CHAT (45vh, sotto la mappa, sempre visibile)    │
│  ⚙ Master     │   Tabs dinamici + input con slash commands         │
│  ──────────   │                                                    │
│  area attuale │                                                    │
│  cambia nick  │                                                    │
│  esci party   │                                                    │
└───────────────┴────────────────────────────────────────────────────┘
```

- **Sidebar**: orologio server `HH:MM:SS` + data (offset calcolato da `state:init.serverTime` e risincronizzato da `time:tick`). Meteo dell'area corrente (etichetta + icona). Nav items cambiano la vista principale. Footer con area corrente e pulsanti cambio nickname / esci.
- **Vista principale**: mappa di default. Navigazione su Messaggi → elenco DM + thread aperto. Giocatori → tabella con action-menu (master vede azioni extra). Master → pannello strumenti (log, area controls, weather, announce, NPC, hidden roll).
- **Chat**: tab area corrente sempre presente. Tabs extra per DM aperti, Sussurri area, OOC area. Master ha tab "Tutto" (feed globale filtrabile).
- **Input**: textarea auto-resize (Enter invia, Shift+Enter newline), slash commands parsati client-side. Invio senza slash = `say` nell'area corrente.

### Slash commands
Player: `/w nick msg`, `/me msg`, `/ooc msg`, `/shout msg`, `/roll expr`, `/dm nick msg`.
Master (extra): `/npc NomeNPC msg`, `/announce msg`, `/roll! expr`, `/mute nick [min]`, `/unmute nick`, `/kick nick [motivo]`, `/ban nick [motivo]`, `/unban nick`, `/move nick area`, `/close area`, `/open area`, `/weather [area|*] code [intensity]`, `/weather [area] off`, `/setname area "nome"`, `/status area stato`.

### Sicurezza MVP
- `masterToken`: 32 byte random url-safe, bcrypt hash (factor 8).
- `sessionToken`: 32 byte random, salvato in chiaro in `players.session_token` (lookup diretto).
- Seed UUID v4 inenumerabile.
- Nessun CSRF perché WS/JSON stateless post-handshake.

### Reconnect
- WS cade → exponential backoff 1s/2s/4s/…/30s max.
- Banner UI "riconnessione…".
- Su reconnect: rifa `hello` con stesso sessionToken → `state:init` rehydrate.
- Messaggi pending durante disconnessione: coda client con flag "invio in corso" → reinvio on reconnect.

## 8. Poteri master

### Delivery
- **Slash commands** chat (lista sopra).
- **Context menu** su messaggio (cancella / modifica / copia ID; player solo su msg proprio).
- **Context menu** su player (mute / kick / ban / muovi a …).
- **Master panel** vista dedicata: log azioni, gestione aree (14 card), weather controls, announce editor, NPC speaker, hidden roll tool.

### Server-side
- Middleware gate: `player.role === 'master'`, altrimenti `error forbidden`.
- Ogni azione master → riga in `master_actions` con `payload` JSON (es. body precedente su edit, stato precedente su area change).
- La maggior parte delle azioni emette anche `message:new kind='system'` agli interessati.
- `mute`: `muted_until` null = permanente; check lazy su send.
- `kick`: invalida `session_token`, chiude WS con evento `kicked`.
- `ban`: kick + inserimento in `bans` su `nickname_lower`.
- `npc`: message con `kind='npc'`, `author_player_id = masterId`, `author_display = npcName`. Master vede marker "(tu come NPC)".
- `hidden roll`: fan-out ristretto al solo master.
- `teleport`: ignora adiacenza, emette `player:moved { teleported: true }`.
- `area closed`: riga in `area_access_bans`. Master ignora sempre.
- `announce`: `kind='announce'`, `area_id=null`. Fan-out a tutti. UI toast + riga nelle chat.

### Letture speciali master
- Tutti i messaggi (inclusi whisper/dm non suoi), con badge "🕶 observer".
- Contenuto soft-deleted (barrato in grigio).

## 9. Palette, tema, rendering

### Custom properties (`app/assets/css/main.css`)

```
--z-bg-900: #0b0d0c   --z-bg-800: #121513   --z-bg-700: #1a1e1b
--z-bg-600: #252a26   --z-border: #2f3630
--z-text-hi: #d4d9d1  --z-text-md: #9aa199  --z-text-lo: #656a63

--z-green-900: #0f2a1a  --z-green-700: #1f5a33  --z-green-500: #3a8a4c
--z-green-300: #7cbe79  --z-green-100: #c9e3b0

--z-rust-700:  #5a3018  --z-rust-500:  #a8572a  --z-rust-300:  #d4965b
--z-blood-700: #5a1a1a  --z-blood-500: #8e2c2c  --z-blood-300: #b96565
--z-whisper-500: #6a4e7a  --z-whisper-300: #9b81a8
--z-toxic-500:  #9aa13a
```

### Nuxt UI config
- `primary: 'green'` con token override → `--z-green-*`.
- `neutral: 'slate'` con override verso `--z-bg-*` / `--z-text-*`.
- Extension Tailwind con scala custom `rust`, `blood`, `whisper`, `toxic`.
- **Dark-only**: rimosso `UColorModeButton` dall'header.

### Stili chat per kind

| kind | stile |
|---|---|
| say | testo hi, nickname green-300 |
| whisper | corsivo whisper-300, sfondo whisper-500/10, icona lucchetto |
| emote | corsivo rust-300, prefisso `*` |
| ooc | toxic-500, prefisso `((OOC))`, font più piccolo |
| roll | box bg-700 border green-700, formula + risultato monospace |
| shout | bold rust-500, icona megafono |
| dm | sfondo whisper-500/15, badge "DM" |
| npc | green-300, badge "NPC", font serif |
| announce | full width bg blood-700/40 border blood-500, bold corsivo, glow rosso leggero |
| system | text-lo, compatto, corsivo |
| deleted | `[messaggio rimosso]` in text-lo (master vede originale barrato) |

### Stile mappa
- Sfondo gradiente radiale `#0e1411 → #1a1e1b` + texture grain SVG (`feTurbulence`).
- Aree: fill `bg-800/70`, bordo `green-700` 1.5px. Hover: bordo `green-300` + glow.
- Avatar: cerchio 14px, colore hash(nickname), bordo `bg-900`. Self bordo `green-300` 2px. Master corona SVG.
- Overlay stato area: pattern diagonal (`infested`), noise + crepe (`ruined`), cancello + oscuramento (`closed`).
- Overlay meteo: `<pattern>` SVG + `@keyframes` CSS.

### Font
- UI: system sans di Nuxt UI.
- Monospace (chat/orologio/roll): `JetBrains Mono` (Google Fonts) con fallback `ui-monospace`.

## 10. Errori, edge case

### Codici errore (costanti in `shared/errors.ts`)
`invalid_payload`, `not_found`, `forbidden`, `rate_limited`, `conflict`, `muted`, `banned`, `area_closed`, `not_adjacent`, `master_only`, `session_invalid`, `session_superseded`, `bad_roll_expr`.

### UI
- Errori normali → toast `UToast` (colore palette coerente).
- Errori bloccanti (`session_invalid`, `banned`, `kicked`, `session_superseded`) → modale fullscreen con CTA "Torna alla home".

### Edge case espliciti
1. **Doppia tab stesso nickname**: seconda vince, prima riceve `session_superseded`, chiusura con modale.
2. **Conflict nickname al join**: 409, UI chiede alias locale (non altera `gdr.nickname` globale).
3. **Party inesistente**: 404, rimuovo entry da `gdr.sessions`.
4. **Area chiusa mentre dentro**: resti dentro, non puoi rientrare dopo uscita.
5. **Master non kickabile né bannabile**: check server duro.
6. **Master perde masterToken**: nessuna recovery MVP. Documentato nella modale di creazione.
7. **Rate limit**: messaggio scartato, toast "troppo veloce".
8. **Body > 2000 char**: troncato client + errore server.
9. **Slash malformato**: errore client inline, non invia.
10. **Roll malformato**: errore client con spiegazione sintassi (`NdM`, `NdM+K`, `NdM-K`, `NdM+NdM`).
11. **Server restart**: WS cadono, client ritentano, sessioni in DB valide → rehydrate.
12. **Ban evaso cambio nick**: accettato come limitation MVP (no auth). Risolvibile con auth futura.

## 11. Strategia test

### Unit (Vitest) — logica pura in `shared/`
- `deriveCityState(seed)`: determinismo, distribuzioni statistiche (tolleranza ±5% su 1000 seed), vincolo piazza=intact.
- `computeWeather(seed, areaId, time)`: determinismo, bande orarie, modificatori stagione, modificatori area.
- `parseRoll(expr)` + `rollDice(expr, rng)`: accetta forme supportate, rigetta malformate, distribuzione corretta con RNG seedato.
- `parseSlashCommand(input)`: copre ogni comando e varianti.
- Adiacenza: simmetria, connettività (ogni area raggiungibile da piazza in ≤N hop).
- Token utils: generazione, hashing, verifica.

### Integration (Vitest + `@nuxt/test-utils`) — server
- Flusso HTTP: create, join, reclaim-master, resume. Happy + 404 + conflict + ban.
- Fan-out WS: 3-4 client simulati, asserzione chi riceve cosa per ogni kind.
- Mute: messaggio di player mutato rifiutato, unmute ripristina.
- Kick/ban: connessione chiusa, ban blocca rejoin con stesso nickname.
- Teletrasporto ignora adiacenza.
- Area chiusa blocca movement normale, master ignora.
- Rate limit.
- Override meteo → `weather:updated`.

### E2E (Playwright, 1 scenario happy path)
- Master crea party → riceve codici → entra in `/party/:seed` → vede mappa.
- Player join da secondo browser → vede stato iniziale.
- Invio `say` dal player → master riceve. `/roll 2d6` dal master → player riceve.
- Master cancella messaggio → player vede `[messaggio rimosso]`.

### TDD
Seguiamo `superpowers:test-driven-development` per logica pura. Test prima, implementazione dopo, refactor con copertura.

### Gate "complete"
Prima di dichiarare un task completo: `pnpm lint && pnpm typecheck && vitest run` tutti verdi.

## 12. Struttura cartelle

```
/
├─ CLAUDE.md
├─ docs/superpowers/specs/2026-04-23-gdr-zombie-mvp-design.md
├─ app/
│  ├─ app.vue  app.config.ts
│  ├─ assets/css/main.css
│  ├─ composables/ (useSession, usePartyConnection, useServerTime, useSlashCommands)
│  ├─ stores/ (session, party, players, map, chat, master)
│  ├─ components/ (home/, layout/, map/, chat/, dm/, players/, master/)
│  └─ pages/ (index.vue, party/[seed].vue)
├─ server/
│  ├─ api/parties/ (index.post, [seed]/join.post, reclaim-master.post, resume.post)
│  ├─ routes/ws/party.ts
│  ├─ ws/ (handlers/, connections.ts, fanout.ts, rate-limit.ts)
│  ├─ db/ (client.ts, schema.ts, migrations/)
│  ├─ services/ (parties, players, messages, areas, master-actions, audit)
│  └─ utils/ (crypto, time)
├─ shared/
│  ├─ map/ (areas.ts, weather.ts)
│  ├─ seed/ (prng.ts, derive-city.ts)
│  ├─ dice/ (parse.ts, roll.ts)
│  ├─ slash/parse.ts
│  ├─ protocol/ (http.ts, ws.ts)
│  └─ errors.ts
├─ tests/ (unit/, integration/)
├─ data/ (gitignored: gdr.sqlite locale)
├─ drizzle.config.ts  vitest.config.ts  nuxt.config.ts  package.json
```

### Nuove dipendenze
- runtime: `pinia`, `@pinia/nuxt`, `drizzle-orm`, `better-sqlite3`, `zod`, `bcryptjs`
- dev: `drizzle-kit`, `vitest`, `@nuxt/test-utils`, `@vitest/coverage-v8`, `@types/better-sqlite3`, `@types/bcryptjs`

## 13. Convenzioni git e collaborazione

- **CLAUDE.md** alla radice con: lingua (IT), scope, workflow superpowers, regole git (commit per task, mai trailer AI), stack summary, comando verde gate, tono narrativo.
- Commit subject: italiano, imperativo, minuscolo, ≤72 char.
- Body commit: opzionale, spiega "perché".
- **Zero trailer IA** (`Co-Authored-By: Claude` vietato).
- Staging selettivo (`git add <path>`), niente `-A` cieco.

## 14. Note su estensioni future (riferimento, NON implementare)

- Auth con email/password + OAuth → sostituisce il nickname in localStorage, abilita ban cross-device, multi-device, multi-party per utente.
- Dashboard amministrativa (moderatori globali, metriche party, report abusi).
- Mappa multi-area / multi-città / zoom di dettaglio → migrazione rendering da SVG inline a Leaflet.
- Character sheet strutturati + sistema regole (salute, inventario, tiro base + abilità).
- Voice chat realtime (WebRTC).
- Mobile-first redesign con gesture.

Queste sono citate solo per allineamento: lo spec MVP non pre-costruisce astrazioni per supportarle.
