# GDR Zombie

Piattaforma web per giocare GDR (gioco di ruolo) a tema zombi / post-apocalittico
via chat testuale, con una mappa della città a zone, voice chat di prossimità,
meteo procedurale e strumenti di moderazione per il master.

Dark-only, desktop-first, nessuna registrazione: si gioca per "party" identificate
da un seed UUID; i partecipanti scelgono solo un nickname e un ruolo (player o
master).

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
pnpm db:migrate   # prima volta: crea ./data/gdr.sqlite
pnpm dev          # http://localhost:3000
```

Il server Nitro espone:
- HTTP + SSR (SPA in realtà, `ssr: false`)
- WebSocket su `/ws/party` (via `experimental.websocket` di Nitro)

## Come si gioca

1. Nella home **crea una party**: ricevi un seed UUID e un master token (il
   token sblocca il ruolo master, tienilo al sicuro).
2. Condividi **solo il seed** (o l'URL) con chi vuoi far giocare — il token
   non va mai condiviso, te lo dà il DB.
3. Gli altri giocatori aprono l'URL, scelgono un nickname e entrano come user.
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
