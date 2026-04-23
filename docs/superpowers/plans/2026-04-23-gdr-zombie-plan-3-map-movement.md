# GDR Zombie — Plan 3: Mappa e movimento

> **For agentic workers:** Use superpowers:subagent-driven-development o superpowers:executing-plans. Prerequisito: Plan 2 completato e verde.

**Goal:** Rendere visibile la mappa della città (SVG), mostrare gli avatar dei giocatori nelle loro aree, permettere al giocatore di spostarsi cliccando un'area adiacente, trasmettere eventi `player:joined/left/moved` e `area:updated` in tempo reale. Aggiungere il kind `shout` con fan-out alle aree adiacenti. Reconnect UX con banner di stato. Meteo visualizzato per area corrente.

**Architettura:** La mappa è un componente Vue che renderizza un `<svg>` inline a viewBox fisso 1000×700, con un `<g>` per ogni area (coordinate da `shared/map/areas.ts`). Gli avatar sono cerchi sovrapposti. Gli overlay di stato/meteo sono `<pattern>` SVG + classi CSS. L'interazione di movimento parte dal click sull'area, passa per il WS, il server valida (adiacenza o master), persiste la nuova posizione e fa fan-out a tutti i client della party.

**Tech stack:** invariato.

**Riferimenti:** spec §4-§5-§6, Plan 2 delivery, `shared/map/areas.ts` + `shared/map/weather.ts` (già implementati in Plan 1).

**Convenzioni:** 1 commit per task, Italian imperative, no AI trailers. Integration test con pattern `build: false + nuxtConfig.nitro.output.dir`.

---

## Task 1 — Estensione servizio players: updateArea

**Files:**
- Modify: `/Users/mashfrog/Work/gdr-zombie/server/services/players.ts` (add `updatePlayerArea`)
- Modify: `/Users/mashfrog/Work/gdr-zombie/tests/integration/services/players.test.ts` (add test)

- [ ] **Test** (aggiungere):
  - `updatePlayerArea(db, playerId, areaId)` scrive la nuova `current_area_id`.
  - Re-fetch → valore aggiornato.

- [ ] **Implement** — aggiungere:

```ts
export function updatePlayerArea(db: Db, playerId: string, areaId: string) {
  db.update(players).set({ currentAreaId: areaId }).where(eq(players.id, playerId)).run()
}
```

- [ ] **Run + typecheck + commit.**

```
git commit -m "feat: aggiungi updatePlayerArea al servizio players"
```

---

## Task 2 — Estensione protocollo WS: move + player:* + area:updated + weather:updated + shout

**Files:**
- Modify: `shared/protocol/ws.ts`
- Modify: `tests/unit/protocol/ws.test.ts`

Nuovi schemi Zod:
- `MoveRequestEvent` (client→server): `{ type: 'move:request', toAreaId: string }`
- `PlayerJoinedEvent` (server→client): `{ type: 'player:joined', player: PlayerSnapshot }`
- `PlayerLeftEvent`: `{ type: 'player:left', playerId: string }`
- `PlayerMovedEvent`: `{ type: 'player:moved', playerId: string, fromAreaId: string, toAreaId: string, teleported: boolean }`
- `AreaUpdatedEvent`: `{ type: 'area:updated', patch: AreaStateSnapshot }`
- `WeatherUpdatedEvent`: `{ type: 'weather:updated', areaId: string | null, effective: WeatherStateSnapshot }`

Aggiornare `ServerEvent` e `ClientEvent` unions.

- [ ] **TDD**: test Zod per ciascuno (happy + missing fields).
- [ ] **Implement** + export.
- [ ] **Run + typecheck + commit.**

```
git commit -m "feat: schemi zod per move, player events, area e weather updated"
```

---

## Task 3 — Handler WS: move:request

**Files:**
- Modify: `server/routes/ws/party.ts` (add `handleMoveRequest`)
- Modify: `server/ws/state.ts` (nessuna modifica se già presente)
- Create: `tests/integration/ws/move.test.ts`

**Logica:**
1. Validazione Zod.
2. `toAreaId` deve essere in `AREA_IDS`.
3. Se non master, controlla `areAdjacent(conn.areaId, toAreaId)` → else `error not_adjacent`.
4. Controlla area non chiusa (`area_access_bans`) per non-master → `error area_closed`.
5. `updatePlayerArea(db, conn.playerId, toAreaId)` + `registry.updateArea(...)`.
6. Broadcast `player:moved` a tutti i player della party (incluso self).
7. Opzionale: inviare al player nuovo un batch di messaggi dell'area appena raggiunta (ultimi 100).

**Test integration** (2 browser simulati con `ws`):
- Master e user in piazza. User invia `move:request toAreaId=chiesa` (adiacente). Entrambi ricevono `player:moved`.
- User invia `move:request toAreaId=rifugio` (non adiacente). Riceve `error not_adjacent`, posizione invariata.
- Master invia `move:request toAreaId=rifugio` (non adiacente per un non-master). Master si muove comunque (`teleported: true`? no — master usa `master:move` separato; qui usa movimento normale che **ignora adiacenza solo per ruolo master**).

- [ ] TDD strict, commit.

```
git commit -m "feat: handler move:request con validazione adiacenza"
```

---

## Task 4 — Servizio area-access-bans (create/remove/list)

**Files:**
- Create: `server/services/area-access.ts`
- Create: `tests/integration/services/area-access.test.ts`

Plan 3 introduce il concetto di "area chiusa" ma le azioni master (`/close`, `/open`) vivono nel Plan 5. In Plan 3 basta il servizio base per testarlo nel handler di Task 3.

- [ ] Funzioni: `closeArea(db, seed, areaId, reason?)`, `openArea(db, seed, areaId)`, `isAreaClosed(db, seed, areaId)`, `listClosedAreas(db, seed)`.
- [ ] TDD. 4 test.
- [ ] Commit.

```
git commit -m "feat: servizio area-access-bans base"
```

---

## Task 5 — Handler WS: player:joined / player:left

**Files:**
- Modify: `server/routes/ws/party.ts`
- Extend: `tests/integration/ws/move.test.ts` o nuovo file `tests/integration/ws/presence.test.ts`

**Logica:**
- Dentro `handleHello`, dopo `registry.register`, broadcast `player:joined` a tutti gli altri player della party (non al nuovo stesso).
- Nel `close` handler, recupera `info` dal registry prima di unregister; broadcast `player:left` al resto della party con `playerId`.

**Test:**
- 2 connessioni. La seconda che si apre → la prima riceve `player:joined`. La prima si chiude → la seconda riceve `player:left`.

- [ ] TDD, commit.

```
git commit -m "feat: broadcast player:joined e player:left"
```

---

## Task 6 — Componente `<GameMap />` base (viewBox, background, no aree)

**Files:**
- Create: `app/components/map/GameMap.vue`

Container SVG responsive:
- viewBox `0 0 1000 700`
- Background: rect full-size con `fill="url(#bg-gradient)"` (gradient radiale bg-900 → bg-700)
- `<filter id="grain">` con `feTurbulence` applicato a un rect overlay opacity 0.05
- Nessuna area ancora: placeholder `<text>` al centro "Mappa".

Stile: `width: 100%; height: 55vh`.

- [ ] Smoke test manuale in browser (`pnpm dev`).
- [ ] Typecheck + commit.

```
git commit -m "feat: componente gamemap svg base"
```

---

## Task 7 — Componente `<MapArea />`

**Files:**
- Create: `app/components/map/MapArea.vue`

Props: `{ area: Area, state: AreaStateSnapshot, isCurrent: boolean, isAdjacent: boolean }`. Emit: `click`.

Rendering:
- `<g>` con translate(x, y), children `<rect w, h, rx=6>` + `<text>` con nome (o customName).
- Bordo: `stroke-width=1.5`, `stroke` varia su hover/isCurrent/isAdjacent.
  - Default: `var(--z-green-700)`
  - Hover / adjacent: `var(--z-green-300)`, con filter glow
  - Current: `stroke=var(--z-green-100)`, stroke-width=2.5
- Se `state.status === 'infested'`: sovrapponi `<rect>` con `fill="url(#pattern-infested)"` (da definire in GameMap defs).
- `ruined`: filter desaturate + cracks path.
- `closed`: overlay dark + lock icon.

Integration in GameMap: `v-for` su `AREAS`, iterare; calcola `state` da Pinia `partyStore.areasState`.

- [ ] Render test via smoke (`pnpm dev`).
- [ ] Commit.

```
git commit -m "feat: componente maparea con stati visivi"
```

---

## Task 8 — Componente `<MapAvatar />`

**Files:**
- Create: `app/components/map/MapAvatar.vue`

Props: `{ player: PlayerSnapshot, area: Area, isSelf: boolean }`.

Rendering:
- Calcolo posizione: area.svg.x + 20 + (hash mod 80), area.svg.y + 20 + (floor(hash/80) mod 40). Disposizione a griglia dentro l'area per evitare overlap.
- `<circle r=7 fill=hashColor stroke="#0b0d0c">` + border `stroke=var(--z-green-300) stroke-width=2` se isSelf, `stroke=var(--z-blood-300)` se role='master'.
- Tooltip via `<title>` con nickname + role.
- Piccola corona SVG (`<path>` triangolo) sopra se master.

Integrazione: in GameMap, `v-for` players filtrando per area corrente del player.

**Funzione hashColor(nickname)**: deterministica, usa `seedFromString` dallo shared prng, mapped in palette ~8 colori (es. rotazione di verdi, ambre, blu desaturati — NO rosa o gialli accesi).

- [ ] Smoke test.
- [ ] Commit.

```
git commit -m "feat: avatar giocatori sulla mappa con colori deterministici"
```

---

## Task 9 — Interazione: click area adiacente invia move:request

**Files:**
- Modify: `app/components/map/GameMap.vue`
- Modify: `app/composables/usePartyConnection.ts` (se serve un metodo `move`)

**Logica:**
- Calcola `adjacentSet = new Set(ADJACENCY[partyStore.me.currentAreaId])`.
- Passa `isCurrent` e `isAdjacent` a `<MapArea>`.
- On click: se master → sempre; se user → se adjacent. Altrimenti toast "non raggiungibile".
- Invia `{ type: 'move:request', toAreaId }` via `connection.send()`.

**Gestione `player:moved` nel composable**:
- Aggiornare `partyStore.players` (mutare `currentAreaId` del player coinvolto).
- Se `playerId === partyStore.me.id`: aggiornare anche `partyStore.me.currentAreaId`.
- Chat store: eventualmente fetch dei messaggi della nuova area (ora il server li invia come snapshot in `state:init` SOLO all'ingresso — per un refresh dopo move, aggiungere batch `messagesByArea[newArea]` nel broadcast di `player:moved` al solo player che si muove). Documentato come sub-step.

**Sub-step server:** in `handleMoveRequest`, dopo il broadcast `player:moved`, invia SOLO al conn del player appena mosso un evento `state:init`-like ridotto con `messagesByArea[toAreaId] = listAreaMessages(...)`. Nuovo evento `state:area-switched` OPZIONALE, oppure semplicemente `player:moved` con extra field `messagesSnapshot`. Scegliere campo extra nel broadcast indirizzato al player: più pulito un nuovo evento `area:entered` indirizzato solo a lui.

- [ ] Design dettaglio: usare `area:entered { messages }` inviato solo al player che si è mosso.
- [ ] Aggiungi event schema Zod e extend handler.
- [ ] Smoke test manuale: 2 browser, muoversi, chat nuova area popolata.
- [ ] Commit.

```
git commit -m "feat: click mappa invia move:request con aggiornamento chat"
```

---

## Task 10 — Overlay meteo sulla mappa

**Files:**
- Modify: `app/components/map/GameMap.vue`
- Create: `app/components/map/MapWeatherOverlay.vue`

Per Plan 3 mostriamo solo il meteo dell'area corrente, come overlay globale sulla mappa (visivamente: layer particellare per `fog`/`rain`/`ashfall`, tint per `redSky`/`night`/`storm`).

- Composable `useAreaWeather(areaId)` che chiama `computeWeather(seed, areaId, serverTime)` reattivamente.
- Overlay: `<rect>` fullsize con fill/pattern/filter in base al `code`. Animazione CSS `@keyframes` per moto particelle.
- Ricalcolo ogni 60s o su `time:tick`.

- [ ] Componente + composable.
- [ ] Smoke test: verificare che di notte l'overlay sia più scuro.
- [ ] Commit.

```
git commit -m "feat: overlay meteo dinamico sulla mappa"
```

---

## Task 11 — Sidebar: weather badge

**Files:**
- Create: `app/components/layout/WeatherBadge.vue`
- Modify: `app/pages/party/[seed].vue` per includere

Plan 3 introduce una sidebar leggera (preview del layout definitivo del Plan 5). Per ora contiene solo orario + meteo + elenco players in area corrente (sintesi). Layout 3 colonne del spec completo arriva in Plan 5.

In Plan 3 la sidebar è opzionale — per semplicità inserisco il WeatherBadge dentro il PartyHeader come già fatto per l'orologio. Il layout "sidebar sinistra completa" è tema Plan 5.

- [ ] WeatherBadge con icona (lucide) + label.
- [ ] Integra nel PartyHeader a destra, accanto all'orologio.
- [ ] Commit.

```
git commit -m "feat: badge meteo area corrente nell header"
```

---

## Task 12 — Kind shout: fanout esteso ad aree adiacenti

**Files:**
- Modify: `server/ws/fanout.ts` (logica `shout`)
- Modify: `server/routes/ws/party.ts` (accettare `shout` nell'allowed list)
- Extend: `tests/integration/ws/chat.test.ts` con test shout

**Logica fanout shout** (ora completa):
- Per non-master: se conn è nell'area del mittente O in un'area adiacente.
- Importa `ADJACENCY` da `shared/map/areas`.

**Test:**
- 3 connessioni: A in piazza, B in chiesa (adiacente), C in rifugio (non adiacente).
- A invia `shout`. A, B ricevono. C non riceve (e nemmeno messaggi di tipo error).

- [ ] TDD. Commit.

```
git commit -m "feat: shout propaga alle aree adiacenti"
```

---

## Task 13 — Reconnect UX: banner e pending queue

**Files:**
- Modify: `app/composables/usePartyConnection.ts` — aggiungi coda messaggi pending durante `reconnecting`.
- Modify: `app/components/layout/PartyHeader.vue` o crea `ConnectionBanner.vue`.

**Logica:**
- Se `status === 'reconnecting'`: mostra banner fisso "Riconnessione in corso…" color rust-500.
- Messaggi inviati durante reconnecting finiscono in una coda `pendingMessages: ClientEvent[]`. Al riconnettere, prima di resumeare, flush della coda.
- UI chat: messaggi locali optimistic con flag `pending: true` (grigio + icona clock). Quando arriva message:new che matchano body+author, rimuovi optimistic. Per MVP: non implementare optimistic (troppo complesso) — mostrare solo il banner.

- [ ] Banner + coda base + flush.
- [ ] Smoke test: disabilitare WS dal devtools, inviare messaggi, riabilitare.
- [ ] Commit.

```
git commit -m "feat: banner reconnecting e coda messaggi pending"
```

---

## Task 14 — Gate finale Plan 3

- [ ] `pnpm lint && pnpm typecheck && pnpm build && pnpm test` verdi.
- [ ] Smoke E2E manuale: 2 browser, master + user, movimento fra aree, shout visibile in area adiacente, non in area remota.
- [ ] Commit chiusura:

```
git commit --allow-empty -m "chore: chiude plan 3 mappa e movimento"
```

---

## Checklist

- [ ] Task 1 — updatePlayerArea
- [ ] Task 2 — schemi zod move/player/area/weather
- [ ] Task 3 — handler move:request
- [ ] Task 4 — servizio area-access
- [ ] Task 5 — player:joined/left broadcast
- [ ] Task 6 — GameMap base
- [ ] Task 7 — MapArea
- [ ] Task 8 — MapAvatar
- [ ] Task 9 — interazione click + area:entered
- [ ] Task 10 — overlay meteo
- [ ] Task 11 — WeatherBadge
- [ ] Task 12 — shout con adiacenza
- [ ] Task 13 — reconnect banner + coda
- [ ] Task 14 — gate finale
