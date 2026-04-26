# GDR Zombie

Piattaforma web per giocare GDR (gioco di ruolo) a tema zombi / post-apocalittico
via chat testuale, con una mappa della città a zone, voice chat di prossimità,
meteo procedurale e strumenti di moderazione per il master.

Dark-only, desktop-first. Dalla **v2a** serve un account (username + password)
per giocare: ogni utente sceglie poi un *display name* per-party. Le party
restano identificate da un seed UUID; il ruolo master appartiene al creatore
della party.

## Stack

- **Nuxt 4** (SSR-less / SPA) con Nitro per HTTP + WebSocket nello stesso processo
- **Nuxt UI 4** + **TailwindCSS 4** (dark-only)
- **TypeScript strict**
- **Drizzle ORM** + **better-sqlite3** (DB locale in `./data/gdr.sqlite`)
- **Pinia** lato client, **Zod v4** ai confini
- **WebRTC mesh** peer-to-peer per voice chat di prossimità
- **Web Audio API** (meteo procedurale + notifiche senza asset)
- **Vitest** per unit/integration

## Setup

Serve Node 20+ e pnpm 10+.

```bash
pnpm install
pnpm db:migrate   # prima volta: crea ./data/gdr.sqlite + seed admin/changeme
pnpm dev          # http://localhost:3000
```

`pnpm db:migrate` applica le migrazioni drizzle e chiama `scripts/seed-superadmin.ts`
che inserisce l'account superadmin di default `admin / changeme` con flag
`must_reset`: al primo login (su `/admin/login`) sei obbligato a cambiare la
password prima di poter operare. Finché la password è quella di default,
il server lo segnala in console con un warning.

Il server Nitro espone:
- HTTP + SSR (SPA, `ssr: false`)
- WebSocket su `/ws/party` (via `experimental.websocket` di Nitro)
  autenticato dal cookie `gdr_session`

## Auth (v2a)

- **Registrazione self-service con approvazione**: vai su `/register`, compila
  username + password. Il tuo account entra in stato `pending`; un superadmin
  deve approvarti dal dashboard admin prima che tu possa fare login.
- **Login utente** su `/login`. La sessione è un cookie `gdr_session`
  httpOnly SameSite=Lax con TTL 30 giorni (sliding): viene esteso ogni volta
  che fai una chiamata autenticata entro gli ultimi 15 giorni di validità.
- **Login superadmin** su `/admin/login` (separato dal login utente). Con
  mustReset attivo tutti gli endpoint admin rispondono 403 tranne
  change-password.
- **Rate limit**: 5 tentativi falliti di login in 15 minuti per
  `(username, ip)` → 429. 3 registrazioni / ora per IP.
- **Password reset**: non c'è self-service (niente email). L'utente chiede al
  superadmin, che dal dashboard genera una password temporanea one-shot
  mostrata solo lì.
- **Audit log**: tabella `auth_events` append-only con register, login,
  login_failed, logout, change-password, ban, reset. Consultabile dal tab
  "Audit" del dashboard admin.

Il display name per-party si sceglie al join (o alla creazione, nel caso del
master). Lo stesso account può apparire con display name diversi in party
diverse.

## Multi-party (v2b)

- **Più party in parallelo**: l'account può essere membro fino a **5 party
  attive** contemporaneamente, ognuna con la propria connessione WebSocket.
  La top tab bar elenca le party "tue" con badge messaggi non letti per
  switch rapido tra esse.
- **Visibilità**: il master sceglie alla creazione tra `public` (compare nel
  browser pubblico `/parties`) o `private` (accessibile solo via link/invito).
- **Politica di accesso**: `auto` (drop-in immediato) o `request` (utente
  invia richiesta, master approva dalla coda).
- **Browser party** `/parties`: filtri (solo auto-join, solo con posti
  liberi, solo le mie), ricerca testo su città e master, sort per ultima
  attività / membri / più recenti, paginazione 20.
- **Inviti**: il master genera token monouso (7 giorni) per saltare la
  policy. Token revocabili. Una party privata si entra solo via invito.
- **Multi-master**: una party può avere più master pari grado. Qualsiasi
  master promuove o demove altri (l'ultimo master non può demovere se stesso
  o lasciare senza prima archiviare).
- **Leave / archive**: l'utente esce dalla party col bottone nel nick menu;
  il master può archiviare la party rendendola read-only e invisibile dal
  browser. **Auto-archive** delle party inattive da 30 giorni.
- **Notifiche cross-party**: messaggi di chat area incrementano un badge
  unread sulla tab non in primo piano; missive (DM) e whisper diretti
  emettono toast cliccabile + suono (rispetta i settings notifiche).

Limiti default (modificabili dal superadmin in v2c): 5 party/utente, 30
member/party, 100 party totali nel sistema.

## Admin dashboard (v2c)

Console di gestione su `/admin` con sidebar nav e sub-route dedicate:

- **`/admin/dashboard`** — counters live (utenti per status, party
  attive/archiviate, ws connessi, messaggi 24h) + grafici time-series
  ultimi 30 giorni (messaggi/giorno, login success vs failed) calcolati
  dal cron `daily-metrics` (snapshot orario UTC con recovery dei giorni
  mancanti al boot).
- **`/admin/users`** — lista utenti per status (approved/banned), search
  per nickname, ban/reset-password, **promuovi a superadmin**.
- **`/admin/parties`** — full control sulle party: lista filtrata
  (active/archived/all), dettaglio con membri, edit visibility/joinPolicy/
  cityName, **transfer master** tra account, archivia/ripristina,
  **hard delete** con conferma "DELETE" (cascade FK).
- **`/admin/registrations`** — coda pending: approve/reject.
- **`/admin/admins`** — gestione multi-superadmin: lista attivi/revocati,
  promuovi user esistente (copia username + passwordHash), revoca con
  guard "ultimo attivo" (409 `last_admin`).
- **`/admin/metrics`** — time-series con filtro date range, **export CSV**
  per `users | parties | audit | messages` (stream con `Content-
  Disposition: attachment`, max 50000 righe per request, cursor per chunk).
- **`/admin/settings`** — 13 settings runtime suddivise in tre sezioni:
  - **Limiti** (8 chiavi): `maxPartiesPerUser`, `maxMembersPerParty`,
    `maxTotalParties`, `partyInactivityArchiveDays`, `inviteTtlDays`,
    `loginRateMaxFailures`, `loginRateWindowMinutes`,
    `registerRateMaxPerHour`.
  - **Features** (3 toggles): `registrationEnabled`,
    `partyCreationEnabled`, `voiceChatEnabled`.
  - **Sistema**: `maintenanceMode` + `maintenanceMessage`.
  Cache in-memory, modifiche applicate al prossimo lookup. I rate
  limiter sono ricostruiti automaticamente quando le chiavi cambiano.
- **`/admin/audit`** — log unificato `admin_actions` (azioni superadmin)
  + `auth_events` (auth flow), filtrabile per actor/kind/range, export
  CSV.

**Modalità manutenzione**: toggle setta `system.maintenanceMode=true`.
Il middleware Nitro risponde 503 `{ code: 'maintenance' }` su
`/api/*` salvo `/api/admin/*`, `/api/auth/me`, `/api/auth/login`,
`/api/system/status`. Il middleware client redirige gli utenti non
superadmin a `/maintenance` (pagina pubblica statica).

**Endpoint pubblico** `/api/system/status` espone
`{ maintenanceMode, maintenanceMessage, registrationEnabled,
partyCreationEnabled, voiceChatEnabled, serverTime }` per pre-flight
client senza auth.

I limiti hardcoded in `shared/limits.ts` restano come **default
fallback** se la tabella `system_settings` è ancora vuota (primo boot
prima del seed migration).

## Multi-mappa procedurale (v2d)

La mappa fissa MVP (14 zone hardcoded di `shared/map/areas.ts`) è stata
sostituita da un sistema **multi-mappa procedurale** per party. Migration
`0005_brown_killmonger` fa clean break dei dati party-scoped, introduce
le tabelle `map_types`, `party_maps`, `map_transitions` e aggiunge
`mapId` (nullable in T1, NOT NULL+PK estesa nella futura 0006) sulle
tabelle area-scoped.

### Tipologie

Catalogo `map_types` seed-ato dalla migration con tre tipi base:

- **`city`** — tessuto urbano denso, areaCount 10–15, default
  `{density:0.5, roadStyle:'grid'}`. Pool nomi: Chiesa, Ospedale,
  Supermercato, Polizia, Scuola, Ponte, Quartiere Residenziale, Fogne,
  Porto, Radio-Torre, Stazione Servizio, Rifugio, Giardino, Caserma,
  Mercato.
- **`country`** — aree aperte e zone agricole, areaCount 6–10, default
  `{forestRatio:0.4, riverChance:0.6}`. Pool nomi: Casolare, Fattoria,
  Stalla, Silo, Fienile, Pozzo, Cantina, Mulino, Sentiero, Recinto,
  Vigneto, Bosco, Fiume, Ponte.
- **`wasteland`** — distese desolate post-apocalittiche, areaCount 6–12,
  default `{ruinRatio:0.5, craterCount:2}`. Pool nomi: Accampamento,
  Avamposto, Bunker, Posto di Blocco, Dune, Discarica, Carcassa,
  Trincea, Rovine, Cratere, Cratere Radiazioni, Ponte Sgretolato.

I superadmin possono modificare `defaultParams`/`enabled` da
`/admin/map-types` (POST `/api/admin/map-types/[id]`); il codice del
generator è TS hardcoded in `shared/map/generators/{city,country,wasteland}.ts`,
deterministico (stesso `(typeId, seed, params)` → stessa mappa
bit-identica) con cache process-locale via `cacheKey`.

### Flow master

`createParty` crea automaticamente una **spawn map** city con seed
random. Il master dalla tab **Mondo** del MasterPanel:

- Vede la lista `party_maps` con badge isSpawn, count membri/zombi.
- **Crea nuova mappa** (modal): seleziona tipo, nome (1–32 char), seed
  opzionale, flag isSpawn. POST `/api/parties/[seed]/maps`.
- Per ogni mappa: bottone **Spawn** (set-spawn), **Porte**
  (TransitionsModal: lista outgoing+incoming, aggiungi/elimina porta
  con select aree del generator + bidirectional default true),
  **Elimina** (con pre-check: vuota, non spawn).

Limite `MAX_MAPS_PER_PARTY = 10` con override runtime via
`limits.maxMapsPerParty`.

### Cross-map move

Il client riceve `state:init` con `maps[]` + `transitions[]` + `me.currentMapId`.
Quando un master crea una `map_transition` da `(fromMap, fromArea)` →
`(toMap, toArea)`, il componente `MapTransitionDoors` disegna nella
SVG/canvas una **strada-porta** dashed che esce dall'area edge verso
il bordo. Click sulla porta invia `move:request` con `toMapId` +
`toAreaId`.

Server `handleMoveRequest`:

- Intra-map (`toMapId` omesso o uguale al currentMapId): valida via
  `GeneratedMap.adjacency` della mappa attiva. Master bypassa
  adjacency e closed-status.
- Cross-map: cerca `map_transition` matching, in caso negativo errore
  `not_a_transition` (403). Master può attraversare anche senza
  transition (admin teleport free).

Dopo il move il server emette `player:moved` con `fromMapId`/`toMapId`
e re-emette uno **`state:init` aggiornato** al solo peer che ha
cambiato mappa (zombie, posizioni, meteo, areasState, messaggi della
nuova mappa). Niente broadcast del refresh: idempotente via hydrate
client.

### Render engine

`<MapView />` istanzia `<MapViewSvg />`, wrapper su `<GameMap />` che
consuma la `GeneratedMap` deterministica via `useGeneratedMap` e riusa
zoom/pan, MapPlayersBox, MapLegend, MapAvatar, MapWeatherOverlay,
MapTransitionDoors.

In v2d era stato sperimentato un secondo engine canvas (PixiJS)
dietro a un toggle admin: rimosso per concentrare il polish sul path
SVG. La struttura router-friendly resta in `MapView.vue` per re-introdurre
altri engine in futuro (es. Leaflet per multi-city zoomabile).

### Codici errore v2d

- `map_type_not_found` (404)
- `map_not_found` (404)
- `map_limit` (429) — superato `limits.maxMapsPerParty`
- `map_not_empty` (409) — delete bloccato (player/zombi/transitions
  in entrata)
- `cannot_delete_spawn` (409) — delete della mappa spawn
- `transition_invalid` (400) — fromArea/toArea non esistono nel
  GeneratedMap
- `not_a_transition` (403) — move cross-map senza transition (user)

Toast IT in `useErrorFeedback`.

## Come si gioca

1. Fai **login** (o registrati e aspetta l'approvazione di un superadmin).
2. Dalla home **crea una party**: digiti il tuo display name per quella party
   e ricevi il seed UUID. Sei automaticamente il master della party creata.
3. Condividi l'URL `/party/<seed>` con chi vuoi far giocare. Gli altri, una
   volta loggati col loro account, all'apertura dell'URL possono unirsi
   scegliendo un display name per questa party.
4. In chat scrivi testo normale per parlare nell'area corrente; usa gli slash
   command per variare registro:
   - `/me apre la porta` — azione in terza persona
   - `/w "Nome Utente" testo` — sussurro privato nell'area
   - `/shout aiuto!` — sentito anche nelle aree adiacenti
   - `/ooc fuori personaggio` — meta
   - `/dm Nome testo` — missiva privata (inbox)
   - `/roll 2d6+3` — tiro dadi visibile a tutti
5. Ti muovi cliccando le aree adiacenti sulla mappa; la tua area attuale si
   apre in dettaglio al click. Il master può spostarsi ovunque e vede tutto
   per moderazione.

### Master

Oltre agli slash command (`/npc`, `/announce`, `/roll!`, `/weather`, `/mute`,
`/kick`, `/ban`, `/move`, `/close`, `/open`, `/setname`, `/status`), il master
ha una UI dedicata (tab "🛠 Master") con:
- Strumenti rapidi: annuncio, NPC speaker, tiro nascosto, override meteo
- Log azioni (audit)
- Elenco banditi con unban one-click

Nel **dettaglio zona** il master ha anche un editor con tool spawn singolo,
spawn orda rettangolare/lasso, selezione multipla, move drag e remove — più
un tool NPC per creare entità nominate (es. "Poliziotto Robert") da una
modale. Gli NPC comparsi nel mondo sono poi autocompletati quando digiti
`/npc ...`.

## Script

```bash
pnpm dev              # dev server
pnpm build            # build production (include db:bundle)
pnpm preview          # preview build
pnpm lint             # eslint
pnpm typecheck        # vue-tsc + nuxt
pnpm test             # vitest run
pnpm test:watch       # vitest watch
pnpm test:coverage    # con coverage v8
pnpm db:generate      # genera nuova migration da schema + bundle
pnpm db:migrate       # applica migration al DB locale
pnpm db:bundle        # rigenera il bundle SQL embedded (auto su build/test)
```

## Architettura in breve

- `app/` — frontend Nuxt: `pages/`, `components/` (per dominio: chat, map, dm,
  master, layout), `stores/` Pinia, `composables/` (WS, voice, weather, sound,
  session, server time), `assets/css/`.
- `server/` — runtime Nitro: `routes/` HTTP API + WS handler, `services/`
  (DB access per parties, players, messages, areas, bans, master actions,
  weather overrides), `db/` (schema Drizzle + migrazioni), `ws/` (connection
  registry, rate limit, state in-memory per zombi/posizioni).
- `shared/` — codice cross-lato: `protocol/` (Zod schemas per HTTP + WS),
  `map/` (aree fisse, adiacenze, meteo deterministico per seed+ora), `slash/`
  (parser comandi), `dice/`, `seed/`, `errors.ts`.
- `scripts/bundle-migrations.ts` — bundle delle migrazioni SQL come stringhe
  TS embedded, perché Nitro non bundla file `.sql` a runtime.

Zombie e NPC vivono in memoria sul server (non persistono al restart), al
pari delle posizioni in-area. Party, players, chat, aree, ban e audit log
sono persistiti in SQLite.

## Deploy

Build standard Nitro:

```bash
pnpm build
node .output/server/index.mjs
```

Variabili d'ambiente utili:
- `PORT` — porta HTTP (default 3000)
- `NITRO_PORT` / `HOST` — alias/override se usi il runtime Nitro diretto

Dietro reverse proxy (nginx / caddy), abilita l'upgrade WebSocket sul path
`/ws/party`. Esempio nginx:

```nginx
location /ws/party {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

Il DB SQLite è un file (`./data/gdr.sqlite`) — assicurati che la directory
sia scrivibile dal processo e inclusa nei backup.

## Scope MVP

Sono **fuori scope** (intenzionalmente):
- Login/registrazione/OAuth, password reset, profilo utente persistente
  (caratteristiche, abilità, inventario, xp). Il profilo utente arriverà
  post-auth, vedi `docs/superpowers/specs/2026-04-23-gdr-zombie-mvp-design.md`
  §14.
- Dashboard admin, analytics, report
- Multi-party attiva simultanea per utente, multi-mappa/multi-city
- Mobile-first redesign

Vedi lo spec e i piani in `docs/superpowers/` per roadmap e decisioni
architetturali.

## Licenza

Vedi `LICENSE`.
