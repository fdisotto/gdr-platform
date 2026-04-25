# GDR Zombie v2d — Mappe procedurali multi-tipologia + render Pixi

**Goal:** Sostituire la mappa unica fissa (`shared/map/areas.ts`, 14 aree) con
un sistema procedurale: ogni party ha una **collezione** di mappe, ognuna
identificata da `mapType` + `mapSeed`. Generator deterministici producono
aree, adiacenze interne e edge candidate per le transitions. Tre tipologie
iniziali: `city`, `country`, `wasteland`. Le mappe sono collegate da
`map_transitions` create manualmente dal master ("ponte sul fiume di country
porta a porto di city"). Render principale via PixiJS; switch admin globale
a SVG come fallback. Detail view per area anch'esso procedurale.

## Scope

Incluso:
- Schema: `map_types`, `party_maps`, `map_transitions` + estensione di
  `players`, `areas_state`, `zombies`, `messages`, `player_positions`,
  `weather_overrides`, `area_access_bans` con `mapId`.
- Generator deterministici TS per i 3 tipi (`shared/map/generators/`),
  cache in-memory keyed `(type, seed, params hash)`.
- API admin: CRUD `map_types` (toggle enabled, edit defaultParams).
- API party master: CRUD `party_maps` (create/list/setSpawn/delete) e
  `map_transitions` (create/list/delete). Vincolo: max 10 mappe per party,
  hard-delete solo se mappa vuota.
- Render engine pluggable: `<MapView />` carica componenti `MapViewSvg`
  o `MapViewPixi` in base a `system_settings.features.renderEngine`.
- Setting nuova `features.renderEngine` (`'pixi' | 'svg'`, default `'pixi'`).
- Modifica `move:request` WS event per accettare anche `toMapId` quando si
  attraversa una transition.
- Clean break party-side migration 0005 (vedi Q8 = A).

Fuori scope (rimandato):
- Mobile-first redesign (v2e)
- Editor visuale di aree e decor (resta procedurale, niente UI per
  ridisegnare manualmente)
- Audio/lighting per-mappa
- Tipologie aggiuntive oltre le 3 iniziali (estendibili dal codice in
  futuri minor)

## Decisioni chiave (dal brainstorming)

| Q | Decisione |
|---|---|
| Q1-rev | Catalogo DB `map_types` con `defaultParams` editabili dall'admin; **generator code è TS hardcoded** per ogni tipologia |
| Q2 | 3 tipologie iniziali: `city`, `country`, `wasteland` |
| Q3-rev | PixiJS engine principale; switch admin globale a SVG via `system_settings` |
| Q4-rev | Party multi-mappa (max 10), master aggiunge nel tempo; transitions linkano mappe diverse |
| Q5 | Transitions **manuali** via master panel (`fromMap.areaX → toMap.areaY`); ritorno opposto creato in automatico |
| Q6 | Max 10 mappe/party (config), naming libero master 1–32 char, una mappa è `isSpawn=true` (entry point), detail procedurale, hard-delete solo se mappa vuota |
| Q7 | Switch SVG/Pixi **globale** via `system_settings.features.renderEngine` |
| Q8 | Clean break party-side: migration 0005 azzera tutte le tabelle party-scoped; preserva users/superadmins/sessions/auth_events/system_settings |

## Architettura

```
shared/map/
  ├── generators/
  │   ├── types.ts           — interfacce GeneratedMap, GeneratedArea, GenParams
  │   ├── city.ts            — generate(seed, params) → GeneratedMap
  │   ├── country.ts
  │   ├── wasteland.ts
  │   └── index.ts           — registry: { city, country, wasteland }
  ├── render/
  │   ├── engine.ts          — type Engine = 'svg' | 'pixi'
  │   └── transitions.ts     — utility per resolve transition al click

server/
  ├── services/
  │   ├── map-types.ts       — CRUD admin del catalogo
  │   ├── party-maps.ts      — CRUD master delle mappe della party
  │   └── map-transitions.ts — CRUD delle porte
  ├── api/
  │   ├── admin/map-types/   — admin endpoints
  │   └── parties/[seed]/maps/      — master endpoints
  │       ├── index.{get,post}.ts
  │       ├── [mapId]/
  │       │   ├── index.{get,delete}.ts
  │       │   ├── set-spawn.post.ts
  │       │   └── transitions/
  │       │       ├── index.{get,post}.ts
  │       │       └── [transitionId]/index.delete.ts

app/
  ├── components/map/
  │   ├── MapView.vue        — switch fra MapViewSvg/MapViewPixi
  │   ├── MapViewSvg.vue     — refactor del GameMap.vue esistente
  │   └── MapViewPixi.vue    — nuovo, PIXI.Application montata in canvas
  ├── composables/
  │   ├── usePartyMaps.ts    — fetch/cache party_maps + active mapId
  │   └── useGeneratedMap.ts — chiama generator client-side, cache
  └── pages/party/[seed]/
      └── (MapView consuma activeMapId dallo store/route)
```

## Modello dati

### Nuove tabelle

```ts
// Catalogo tipologie. Generator code è TS-side (vedi shared/map/generators/);
// l'admin tara solo i defaultParams (densità, area count, ecc).
mapTypes = sqliteTable('map_types', {
  id: text('id').primaryKey(),                            // 'city' | 'country' | 'wasteland'
  name: text('name').notNull(),                           // display
  description: text('description').notNull(),
  defaultParams: text('default_params').notNull(),        // JSON serializzato
  areaCountMin: integer('area_count_min').notNull(),      // hard floor del generator
  areaCountMax: integer('area_count_max').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

// Mappe associate a una party. Tutte le tabelle area-scoped si estendono
// con mapId (FK qui).
partyMaps = sqliteTable('party_maps', {
  id: text('id').primaryKey(),                            // uuid
  partySeed: text('party_seed').notNull()
    .references(() => parties.seed, { onDelete: 'cascade' }),
  mapTypeId: text('map_type_id').notNull()
    .references(() => mapTypes.id),
  mapSeed: text('map_seed').notNull(),                    // qualunque stringa
  name: text('name').notNull(),                           // 1..32 char
  isSpawn: integer('is_spawn', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull()
}, t => [
  index('party_maps_party_idx').on(t.partySeed),
  // Una sola mappa con isSpawn=true per party — applicato lato app per
  // semplicità (SQLite non supporta partial unique). Service garantisce.
])

// Porte tra mappe. fromAreaId riferisce un'area generata (id deterministico
// dal generator). Il "ritorno opposto" creato come riga separata speculare,
// così la query è semplice.
mapTransitions = sqliteTable('map_transitions', {
  id: text('id').primaryKey(),                            // uuid
  partySeed: text('party_seed').notNull()
    .references(() => parties.seed, { onDelete: 'cascade' }),
  fromMapId: text('from_map_id').notNull()
    .references(() => partyMaps.id, { onDelete: 'cascade' }),
  fromAreaId: text('from_area_id').notNull(),
  toMapId: text('to_map_id').notNull()
    .references(() => partyMaps.id, { onDelete: 'cascade' }),
  toAreaId: text('to_area_id').notNull(),
  label: text('label'),                                   // opzionale "Ponte"
  createdAt: integer('created_at').notNull()
}, t => [
  index('map_transitions_from_idx').on(t.fromMapId, t.fromAreaId),
  index('map_transitions_party_idx').on(t.partySeed)
])
```

### Estensioni schema esistente (tutte aggiunta `mapId`)

- `players.currentMapId TEXT NOT NULL` — FK a `party_maps.id` o NULL
  finché la party non ha mappe (transitorio post-create). Per coerenza
  forziamo NOT NULL: la party non si può davvero usare senza mappa, e il
  flow di create party include sempre la generazione di una mappa default.
- `areas_state.mapId TEXT NOT NULL` — PK estesa a `(partySeed, mapId, areaId)`.
- `zombies.mapId TEXT NOT NULL`.
- `messages.mapId TEXT` (nullable: messaggi DM/announce non hanno area).
- `player_positions.mapId TEXT NOT NULL` — PK estesa a `(partySeed, mapId, playerId, areaId)`.
- `weather_overrides.mapId TEXT NOT NULL` — PK estesa a `(partySeed, mapId, areaId)`.
- `area_access_bans.mapId TEXT NOT NULL` — PK estesa.

Tutte le query esistenti vengono adeguate per filtrare/insertare `mapId`.

### Default seed `map_types`

Migration 0005 popola con:
- `city`: areaCountMin=10, areaCountMax=15, defaultParams `{"density":0.5,"roadStyle":"grid"}`
- `country`: areaCountMin=6, areaCountMax=10, defaultParams `{"forestRatio":0.4,"riverChance":0.6}`
- `wasteland`: areaCountMin=6, areaCountMax=12, defaultParams `{"ruinRatio":0.5,"craterCount":2}`

Tutti `enabled=true`.

### `system_settings` nuove

- `limits.maxMapsPerParty` = `10`
- `features.renderEngine` = `"pixi"` (string)
- `features.mapTransitionsEnabled` = `true` (toggle se servono problemi)

## Generator: contratto

```ts
// shared/map/generators/types.ts
export interface GeneratedArea {
  id: string                    // slug stabile dato (type, seed, params)
  name: string                  // display name (es. "Piazza Centrale", "Fattoria Rossi")
  shape: { x: number, y: number, w: number, h: number, kind: 'rect' | 'polygon', points?: string }
  edge: boolean                 // true se l'area è candidata per transitions verso altre mappe
  spawn: boolean                // true se è la spawn area di questa mappa (almeno 1 per mappa)
  decor: GeneratedDecor[]
  detail: { /* layout interno per detail view */ }
}

export interface GeneratedMap {
  areas: GeneratedArea[]
  adjacency: Record<string, string[]>     // areaId → vicini interni alla mappa
  spawnAreaId: string                      // shortcut a area.spawn === true
  edgeAreaIds: string[]                    // shortcut a area.edge === true
  background: { kind: 'gradient' | 'noise', /* params */ }
}

export interface GeneratorFn {
  (seed: string, params: Record<string, unknown>): GeneratedMap
}
```

I generator sono **deterministici puri**: stesso input → stesso output.
Cache in-memory keyed `(type, seed, params hash)` per evitare ricalcolo
ad ogni render.

City: griglia + isolato + piazza centrale + edifici a tema (chiesa,
ospedale, supermercato, polizia, scuola, ponte). Country: zone aperte
con strade sterrate, fattoria, fiume, bosco. Wasteland: rovine sparse,
cratere centrale, accampamento.

## API HTTP

### Admin: gestione `map_types`

**GET `/api/admin/map-types`** — list.

**POST `/api/admin/map-types/[id]`** — body `{ defaultParams?, enabled?, areaCountMin?, areaCountMax?, name?, description? }`. **Niente create da UI**: i tipi sono hardcoded, l'admin cambia solo metadati e default params.

### Master: gestione `party_maps`

**GET `/api/parties/[seed]/maps`** — lista mappe della party + count membri per mappa, count zombies, isSpawn.

**POST `/api/parties/[seed]/maps`** — body `{ mapTypeId, mapSeed?, name, params? }`. Se `mapSeed` mancante, generato random. Limit `MAX_MAPS_PER_PARTY` da settings.

**GET `/api/parties/[seed]/maps/[mapId]`** — dettaglio + GeneratedMap (chiamando il generator client-side oppure server-side caching).

**POST `/api/parties/[seed]/maps/[mapId]/set-spawn`** — sposta il flag `isSpawn` qui (toglie da quella che ce l'aveva).

**DELETE `/api/parties/[seed]/maps/[mapId]`** — hard delete con cascade. 409 `map_not_empty` se ci sono player/zombies/transitions in entrata. 409 `cannot_delete_spawn` se è la spawn (devi prima cambiarla).

### Master: gestione `map_transitions`

**GET `/api/parties/[seed]/maps/[mapId]/transitions`** — list (entrambe direzioni se applicabile).

**POST `/api/parties/[seed]/maps/[mapId]/transitions`** — body `{ fromAreaId, toMapId, toAreaId, label?, bidirectional?: boolean (default true) }`. Se bidirectional, crea anche la riga speculare. Valida che fromArea e toArea esistano nei generated map (chiama il generator e verifica id).

**DELETE `/api/parties/[seed]/maps/[mapId]/transitions/[transitionId]`** — hard delete. Se la transition speculare esiste, la cancella anche.

### Move WS event esteso

Lo schema `MoveRequestEvent` resta compatibile: aggiunge campo opzionale `toMapId`. Logica server:
- Se `toMapId` mancante o uguale al currentMapId del player: move interno alla mappa, validazione adiacenze come oggi (ma sulla `GeneratedMap.adjacency` calcolata)
- Se `toMapId` diverso: il server valida che esista una `map_transition` `(fromMapId=current, fromAreaId=area corrente, toMapId, toAreaId)`. Se sì, esegue il move cross-map (aggiorna `currentMapId` + `currentAreaId`).
- Master può attraversare transitions liberamente; può anche fare cross-map move senza transition (admin teleport).

## Render engine

`shared/map/render/engine.ts`:
```ts
export type Engine = 'svg' | 'pixi'
export function getEngineFromSettings(settings: SettingsSnapshot): Engine
```

Il client al boot legge `/api/system/status` (esteso per includere `renderEngine`) o lo deriva dal proprio `useSettingsStore`. Il componente `<MapView />` switcha sui due children.

`MapViewPixi.vue`: monta una `PIXI.Application` (canvas WebGL) dentro un wrapper Vue. Disegna aree come `Graphics`, avatar come `Sprite` (cerchi colorati), zombie/NPC come sprite con icone procedurali. Eventi: pointerdown/move/up sul canvas → coordinate svg-equivalenti. Lib: `pixi.js` v8 (~150kb gz).

`MapViewSvg.vue`: porting del `GameMap.vue` attuale, leggermente generalizzato per consumare `GeneratedMap` invece del set fisso di aree.

`AreaDetailView` analogo: due implementazioni `AreaDetailSvg` / `AreaDetailPixi`. Il detail layout viene da `area.detail` del generator.

## UI: master panel — gestione mappe

Nuovo tab "Mondo" nel master panel:
- Lista `party_maps` (badge isSpawn, count membri/zombi)
- Bottone "Crea nuova mappa" → modal con select `mapTypeId` (solo enabled), input `name`, opzionale `mapSeed` (default random visualizzato)
- Per ogni mappa: bottoni "Imposta come spawn", "Elimina" (con confirm + checks), "Gestisci porte"
- Modal "Gestisci porte" per una mappa: lista transitions; bottone "Aggiungi porta" con select mappa target, select area in mappa target, select area in mappa corrente, label, checkbox bidirectional

## Migration 0005

Sequenza:
1. Crea nuove tabelle `map_types`, `party_maps`, `map_transitions`
2. Insert seed `map_types` (city, country, wasteland)
3. Insert system_settings `limits.maxMapsPerParty=10`, `features.renderEngine='pixi'`, `features.mapTransitionsEnabled=true` (`INSERT OR IGNORE`)
4. **Clean break**: `DELETE FROM` su tutte le tabelle party-scoped esistenti:
   `parties, players, areas_state, messages, area_access_bans, weather_overrides, master_actions, bans, zombies, player_positions, party_invites, party_join_requests`
5. ALTER TABLE per aggiungere `mapId` ai relativi (NOT NULL dove sensato dopo wipe)
6. Update PK composte dove l'aggiunta di mapId richiede ricostruzione tabella

I campi `revokedAt`/`revokedBy` di superadmins, settings, daily_metrics, admin_actions, auth_events, users, sessions restano intatti.

## Codici errore aggiunti

- `map_not_found` — riferimento a mapId/areaId inesistente
- `map_not_empty` — delete bloccato
- `cannot_delete_spawn` — delete della mappa spawn (cambia spawn prima)
- `transition_invalid` — fromArea/toArea non esistono nei generated map
- `map_limit` — superato `limits.maxMapsPerParty`
- `not_a_transition` — move:request cross-map senza transition esistente

Toast IT in `useErrorFeedback`.

## Testing

Unit:
- generator deterministic: stesso (type, seed, params) → output uguale (snapshot test)
- generator output rispetta `areaCountMin/Max`, ha almeno 1 spawn area, almeno 1 edge area
- map_types service crud
- party_maps service crud + max enforcement + spawn unique
- map_transitions service create con bidirectional, delete cascade

Integration:
- `/api/parties/[seed]/maps`: list, create, set-spawn, delete (varie casistiche conflict)
- `/api/parties/[seed]/maps/[mapId]/transitions`: create con valide aree, reject con aree inesistenti
- WS `move:request` cross-map: con transition valida → ok, senza → 403 not_a_transition

Smoke manuale:
- Crea party → mappa default `city`
- Aggiungi mappa `country` → master panel → crea transition city.area_X ↔ country.area_Y
- Player muove cross-map → vede mappa nuova
- Switch admin engine svg → pixi → recheck

## File toccati

Nuovi:
- `shared/map/generators/{types,city,country,wasteland,index}.ts`
- `shared/map/render/{engine,transitions}.ts`
- `server/services/{map-types,party-maps,map-transitions}.ts`
- `server/api/admin/map-types/{index.get.ts,[id].post.ts}`
- `server/api/parties/[seed]/maps/index.{get,post}.ts`
- `server/api/parties/[seed]/maps/[mapId]/{index.get,index.delete,set-spawn.post}.ts`
- `server/api/parties/[seed]/maps/[mapId]/transitions/{index.get,index.post}.ts`
- `server/api/parties/[seed]/maps/[mapId]/transitions/[transitionId]/index.delete.ts`
- `server/db/migrations/0005_*.sql`
- `app/components/map/{MapView,MapViewSvg,MapViewPixi}.vue`
- `app/components/map/{AreaDetailSvg,AreaDetailPixi}.vue`
- `app/composables/{usePartyMaps,useGeneratedMap}.ts`
- `app/components/master/MapManagementTab.vue`
- `tests/unit/map/generators/*.test.ts`
- `tests/integration/services/{map-types,party-maps,map-transitions}.test.ts`
- `tests/integration/api/{admin/map-types,parties/maps}.test.ts`
- `tests/integration/ws/cross-map-move.test.ts`

Modificati:
- `server/db/schema.ts` (nuove tabelle + mapId su 7 esistenti)
- `server/services/players.ts` (currentMapId, joinParty richiede mapId)
- `server/services/parties.ts` (createParty crea anche default map)
- `server/routes/ws/party.ts` (move:request cross-map, hello hydrate include maps + activeMap)
- `shared/protocol/ws.ts` (HelloEvent state:init estesi con `maps[]`, `currentMapId`)
- `app/components/map/{GameMap,AreaDetailView}.vue` → diventano alias di MapView
- `app/components/master/MasterPanel.vue` (aggiunta tab "Mondo")
- `app/composables/usePartyConnections.ts` (handleEvent dispatcha state:init nuovo shape)
- `app/stores/party.ts` (esteso con `maps`, `currentMapId`)
- `shared/errors.ts` (nuovi codici)
- `app/composables/useErrorFeedback.ts` (toast IT)
- `package.json` (`pnpm add pixi.js`)
- `README.md` (sezione multi-mappa + render engine)

## Rischi noti

- **PixiJS bundle size**: ~150kb gz. Lazy import nel componente `MapViewPixi`
  per non penalizzare chi usa SVG.
- **Generator drift**: cambi al codice generator post-deploy potrebbero
  cambiare l'output per gli stessi (type, seed). Mitigazione: i generator
  sono versionati e non modificati una volta in prod (semver: bump major
  se l'output cambia). Nota in CHANGELOG.
- **Multi-mappa cross-references**: i `messages.mapId` puntano a una mappa
  che potrebbe essere stata cancellata. Soft fallback: se mapId non esiste,
  rendering "[zona dimenticata]". Non blocchiamo delete su questo.
- **Detail view procedurale**: deve produrre layout coerenti tra zoom
  e detail. Ben testare deterministic.
- **Pixi e Vue lifecycle**: la PIXI.Application va destroyed in
  `onBeforeUnmount` per evitare memory leak. Patterns chiari nel composable.

## Self-review

**Coverage Q1-Q8**: tutte ✓.

**Placeholder**: nessuno.

**Ambiguità**: gli "edge" del generator (aree candidate per transitions) —
il modello accetta che il master decida quali specifici (fromAreaId,
toAreaId) collegare; il generator marca solo i candidati come hint UI.

**Scope check**: questo è un release sostanzioso, ma chiuso e testabile
da solo. Il rendering Pixi è incrementale (fallback SVG) e i generator
sono code TS puro. Nessuna integrazione AI/ML. Mobile-first (v2e) viene
dopo come livello UX, non architettura.

**Out of scope ribadito**: editor UI mappe (admin sceglie tipologia +
seed; non disegna), nuove tipologie oltre le 3, audio per-mappa,
mobile-first.
