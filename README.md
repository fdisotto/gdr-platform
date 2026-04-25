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
