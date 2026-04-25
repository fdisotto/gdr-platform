# GDR Zombie — Plan 10: Multi-mappa procedurale + render Pixi (v2d)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare la spec v2d — sostituire la mappa fissa 14-aree con un sistema multi-mappa procedurale per party. Tre generator TS deterministici (`city`, `country`, `wasteland`). Catalogo `map_types` editabile dall'admin. Master crea mappe via UI, le linka con `map_transitions` manuali. WS `move:request` cross-map. Render engine pluggable: PixiJS principale, fallback SVG via setting admin. Clean break party-side via migration 0005.

**Architettura:** schema esteso (`map_types`, `party_maps`, `map_transitions` + `mapId` su 7 tabelle), generator puri in `shared/map/generators/`, services + endpoint admin/master, refactor `MapView` come switch SVG/Pixi, refactor party page e store per multi-mappa awareness. Mantiene backwards compat di `users/superadmins/sessions/auth_events/system_settings`.

**Tech Stack:** Nuxt 4 · Nitro · Drizzle · better-sqlite3 · Zod · Pinia · Vitest · `pixi.js@^8`.

**Riferimenti:**
- Spec: `docs/superpowers/specs/2026-04-25-gdr-zombie-v2d-multi-map-design.md`
- CLAUDE.md per regole

**Convenzioni git:** un commit per task, IT imperativo lowercase ≤72 char, no AI trailer, stage selettivo. Pre-commit lint+typecheck+test verdi.

**Approccio:** 6 fasi. Fase 1 (foundation) e 2 (API) sono backend puri; Fase 3 integra WS+state init; Fase 4 sostituisce il rendering; Fase 5 UI master; Fase 6 smoke+docs+gate.

---

## FASE 1 — Foundation (schema + generators + services)

### Task 1 — Schema estensioni + migration 0005

**Files:**
- Modify: `server/db/schema.ts`
- Create: `server/db/migrations/0005_*.sql`
- Modify: `server/db/migrations.generated.ts` (auto)

- [ ] Aggiungi tabelle `mapTypes`, `partyMaps`, `mapTransitions` (vedi spec)
- [ ] Aggiungi `mapId` su: `players` (currentMapId NOT NULL FK partyMaps con onDelete cascade), `areas_state`, `zombies`, `messages` (nullable per dm/announce), `player_positions`, `weather_overrides`, `area_access_bans`. Adegua PK composte dove serve (per SQLite richiede table-recreate, ma il clean break azzera tutto prima → si può fare DROP+CREATE)
- [ ] `pnpm db:generate`. Edita SQL per:
  1. Mettere DELETE FROM in cima a tutte le tabelle party-scoped (clean break)
  2. INSERT seed `map_types` (3 righe city/country/wasteland) con `INSERT OR IGNORE`
  3. INSERT seed `system_settings`: `limits.maxMapsPerParty=10`, `features.renderEngine="pixi"`, `features.mapTransitionsEnabled=true` con `INSERT OR IGNORE`
- [ ] `pnpm db:migrate`, verifica schema con `sqlite3`
- [ ] Test count baseline cambierà perché molte tabelle sono state azzerate (è atteso): typecheck+test → assicurati i test passino dopo wipe (createTestDb riapplica le migration in memoria, dovrebbe restare verde)

Commit: `chore: schema + migration 0005 multi-map clean break`

### Task 2 — Generator types e contratti

**Files:**
- Create: `shared/map/generators/types.ts`
- Test: `tests/unit/map/generators/types.test.ts` (smoke import + tipi)

API dalle spec: `GeneratedArea`, `GeneratedDecor`, `GeneratedMap`, `GeneratorFn`, `GenParams`. Includi `cacheKey(type, seed, params): string` helper.

Commit: `feat: tipi e contratti generator mappa`

### Task 3 — Generator `city`

**Files:**
- Create: `shared/map/generators/city.ts`
- Test: `tests/unit/map/generators/city.test.ts`

Logica:
- PRNG da `seedFromString(seed)` esistente per determinismo
- `params.density` (0..1) → numero di aree dentro `[areaCountMin, areaCountMax]` (default min=10, max=15)
- Layout: griglia regolare, piazza centrale, edifici a tema (chiesa, ospedale, supermercato, ecc — assegnati via PRNG)
- Adjacency: edge tra aree visivamente vicine (entro raggio threshold)
- Edge areas: 2-4 aree ai bordi (es. "porta nord", "porta est") marcate `edge=true`
- Spawn area: piazza centrale, marcata `spawn=true`
- Decor: `road`, `building`, `tree` semplici

Test:
- Stesso (seed, params) produce output bit-identico (snapshot test JSON)
- areaCount nel range
- Esattamente 1 spawn, ≥1 edge
- Adiacenze simmetriche

Commit: `feat: generator mappa city deterministico`

### Task 4 — Generator `country`

**Files:**
- Create: `shared/map/generators/country.ts`
- Test: `tests/unit/map/generators/country.test.ts`

Logica analoga a city, ma:
- `params.forestRatio` (0..1) → quante aree sono "bosco"
- `params.riverChance` (0..1) → presenza di un fiume che divide la mappa (con un'area "ponte")
- Aree a tema country: fattoria, stalla, silo, bosco, sentiero, fienile, fiume, ponte
- areaCountMin=6, areaCountMax=10
- Edge: 3-5 (sentieri esterni)

Commit: `feat: generator mappa country deterministico`

### Task 5 — Generator `wasteland`

**Files:**
- Create: `shared/map/generators/wasteland.ts`
- Test: `tests/unit/map/generators/wasteland.test.ts`

Logica:
- `params.ruinRatio` → percentuale aree "rovine"
- `params.craterCount` → numero crateri (centrali, marcati come pericolosi/closed?)
- Aree: cratere, rovine, accampamento, dune, cratere radiazioni, posto di blocco, ponte sgretolato
- areaCountMin=6, areaCountMax=12
- Edge: 4-6 (uscite verso il deserto)

Commit: `feat: generator mappa wasteland deterministico`

### Task 6 — Generator registry + cache

**Files:**
- Create: `shared/map/generators/index.ts`

```ts
export const GENERATORS: Record<string, GeneratorFn> = {
  city, country, wasteland
}
const cache = new Map<string, GeneratedMap>()
export function generate(typeId: string, seed: string, params: GenParams): GeneratedMap {
  const key = `${typeId}:${seed}:${stableHash(params)}`
  if (cache.has(key)) return cache.get(key)!
  const fn = GENERATORS[typeId]
  if (!fn) throw new Error(`unknown map type: ${typeId}`)
  const map = fn(seed, params)
  cache.set(key, map)
  return map
}
export function _resetGeneratorCache() { cache.clear() }
```

Commit: `feat: registry generator e cache deterministica`

### Task 7 — Service `map-types` + admin endpoints

**Files:**
- Create: `server/services/map-types.ts`
- Test: `tests/integration/services/map-types.test.ts`
- Create: `server/api/admin/map-types/index.get.ts`
- Create: `server/api/admin/map-types/[id].post.ts`
- Test: `tests/integration/api/admin/map-types.test.ts`

Service API:
```ts
listMapTypes(db): MapTypeRow[]
listEnabledMapTypes(db): MapTypeRow[]
findMapType(db, id): MapTypeRow | null
updateMapType(db, id, patch: { enabled?, areaCountMin?, areaCountMax?, defaultParams?, name?, description? }): void
parseDefaultParams(row): Record<string, unknown>
```

Endpoint admin:
- GET list (tutte, anche disabled)
- POST `[id]` body `{ enabled?, defaultParams?, areaCountMin?, areaCountMax?, name?, description? }`. Audit `setting.update`-like (`map_type.update`).

Commit: `feat: service map-types + endpoint admin per catalogo`

### Task 8 — Service `party-maps`

**Files:**
- Create: `server/services/party-maps.ts`
- Test: `tests/integration/services/party-maps.test.ts`

API:
```ts
listPartyMaps(db, partySeed): PartyMapRow[]
findPartyMap(db, mapId): PartyMapRow | null
createPartyMap(db, { partySeed, mapTypeId, mapSeed?, name, isSpawn? }): PartyMapRow
                                                                        // mapSeed default = generateUuid
                                                                        // applica MAX_MAPS_PER_PARTY (settings)
                                                                        // se isSpawn=true e c'è già un'altra spawn → toggle
setSpawnMap(db, partySeed, mapId): void                                  // 1 sola spawn alla volta
deletePartyMap(db, mapId): void                                          // solo se vuota: no players, no zombies, no transitions ingresso, non è spawn
findSpawnMap(db, partySeed): PartyMapRow | null
countMapsForParty(db, partySeed): number
```

Test: limit, isSpawn unique, delete pre-checks (con set up dati di test che simulano player in mappa, transition in entrata).

Commit: `feat: service party-maps con limit e spawn unique`

### Task 9 — Service `map-transitions`

**Files:**
- Create: `server/services/map-transitions.ts`
- Test: `tests/integration/services/map-transitions.test.ts`

API:
```ts
listTransitionsForMap(db, mapId): TransitionRow[]                        // outgoing
listTransitionsToMap(db, mapId): TransitionRow[]                         // incoming
createTransition(db, { partySeed, fromMapId, fromAreaId, toMapId, toAreaId, label?, bidirectional? }): TransitionRow[]
                                                                          // ritorna array (1 o 2 righe)
deleteTransition(db, transitionId): void                                  // se esiste speculare, cancella anche
findTransition(db, fromMapId, fromAreaId, toMapId, toAreaId): TransitionRow | null
```

Validation che fromAreaId/toAreaId esistano nella `GeneratedMap` corrispondente al type+seed+params (chiama generator e verifica id).

Test: bidirezionale crea 2 righe, delete cascade speculare, validation aree inesistenti.

Commit: `feat: service map-transitions con bidirezionali e validation`

### Task 10 — Codici errore + estensione settings

**Files:**
- Modify: `shared/errors.ts` — `map_not_found`, `map_not_empty`, `cannot_delete_spawn`, `transition_invalid`, `map_limit`, `not_a_transition`
- Modify: `server/utils/http.ts` — mapping status codes
- Modify: `app/composables/useErrorFeedback.ts` — toast IT
- Modify: shared/limits.ts — `MAX_MAPS_PER_PARTY = 10` (default fallback)

Commit: `feat: codici errore v2d e default limit mappe`

---

## FASE 2 — API party master per mappe

### Task 11 — Endpoint `/api/parties/[seed]/maps` GET + POST

**Files:**
- Create: `server/api/parties/[seed]/maps/index.get.ts` (list per master)
- Create: `server/api/parties/[seed]/maps/index.post.ts` (create map)
- Test: `tests/integration/api/parties/maps.test.ts`

GET: requireUser + isMaster. List `partyMaps` + `memberCount`/`zombieCount` per ognuna.

POST: body `{ mapTypeId, mapSeed?, name (1..32), params?, isSpawn? }`. createPartyMap. Audit master_actions `map.create`.

Commit: `feat: endpoint master list/create mappe della party`

### Task 12 — Endpoint `/api/parties/[seed]/maps/[mapId]` GET + DELETE + set-spawn

**Files:**
- Create: `server/api/parties/[seed]/maps/[mapId]/index.get.ts`
- Create: `server/api/parties/[seed]/maps/[mapId]/index.delete.ts`
- Create: `server/api/parties/[seed]/maps/[mapId]/set-spawn.post.ts`

GET: dettaglio mappa + chiamata `generate()` per restituire `GeneratedMap` corrente.

DELETE: requireUser + isMaster. checks spec (vuota, non spawn). Audit `map.delete`.

set-spawn: Audit `map.set_spawn`.

Commit: `feat: endpoint master dettaglio/delete/set-spawn mappa`

### Task 13 — Endpoint transitions

**Files:**
- Create: `server/api/parties/[seed]/maps/[mapId]/transitions/index.get.ts`
- Create: `server/api/parties/[seed]/maps/[mapId]/transitions/index.post.ts`
- Create: `server/api/parties/[seed]/maps/[mapId]/transitions/[transitionId]/index.delete.ts`
- Test: `tests/integration/api/parties/transitions.test.ts`

POST body: `{ fromAreaId, toMapId, toAreaId, label?, bidirectional? (default true) }`. requireUser + isMaster. Audit.

Commit: `feat: endpoint master transitions crud`

---

## FASE 3 — WS + integration multi-mappa

### Task 14 — Estendi schemi protocol WS per multi-mappa

**Files:**
- Modify: `shared/protocol/ws.ts`

Cambi:
- `MoveRequestEvent` aggiunge `toMapId?: string` (opt)
- `PlayerMovedEvent` aggiunge `toMapId: string` (sempre presente, per coerenza con multi-mappa)
- `PlayerSnapshot` aggiunge `currentMapId: string`
- `StateInitEvent` aggiunge `maps: PartyMapPublic[]`, `transitions: TransitionPublic[]`, `me.currentMapId`
- Nuovi tipi `PartyMapPublic`, `TransitionPublic`
- `AreaStateSnapshot` aggiunge `mapId`

Commit: `chore: schemi ws multi-mappa con toMapId e maps in state-init`

### Task 15 — Server WS handler: state-init e move cross-map

**Files:**
- Modify: `server/routes/ws/party.ts`
- Modify: `server/services/players.ts` — `findPlayerByUserInParty` ritorna `currentMapId`
- Test: `tests/integration/ws/cross-map-move.test.ts`

Modifiche:
- `handleHello`: state init include lista mappe + transitions + currentMapId
- `handleMoveRequest`: parsing `toMapId`. Se omesso o uguale a currentMapId: validation adjacency interna (su `GeneratedMap.adjacency` calcolata per la mappa). Se diverso: cerca transition `(fromMapId=current, fromAreaId=current, toMapId, toAreaId)`. Se trovata, esegue cross-map move (update `currentMapId` + `currentAreaId`). Master può attraversare senza transition (admin teleport free). Errori: `not_a_transition` 403, `transition_invalid` 400.
- Aggiorna `joinParty` flow per impostare `currentMapId = spawnMapId` della party

Test integration: 2 mappe + transition; player muove cross-map ok; senza transition → 403; master può senza.

Commit: `feat: ws move cross-map e state-init multi-mappa`

### Task 16 — Service players esteso + adapter areas/zombies/messages

**Files:**
- Modify: `server/services/players.ts` — joinParty richiede `mapId`, query include mapId
- Modify: `server/services/areas.ts` — funzioni accettano (partySeed, mapId)
- Modify: `server/services/zombies.ts` — accetta mapId
- Modify: `server/services/messages.ts` — accetta mapId opzionale
- Modify: `server/services/player-positions.ts` — accetta mapId
- Modify: `server/services/weather-overrides.ts` — accetta mapId
- Modify: `server/services/area-access.ts` — accetta mapId
- Modify: `server/services/parties.ts` — `createParty` ora crea anche la prima `partyMap` (default `mapType=city` con seed = randomUuid) e ne usa lo spawn area come `currentAreaId` del master

Test: aggiorna i test esistenti che usano queste funzioni per passare mapId.

Commit: `refactor: services area-scoped accettano mapId`

### Task 17 — Endpoint join party esteso per multi-mappa

**Files:**
- Modify: `server/api/parties/[seed]/join.post.ts`
- Modify: `server/api/parties/[seed]/leave.post.ts`

Join: oltre a quello che già fa, imposta `currentMapId = spawnMap` della party + `currentAreaId = spawnArea` di quella mappa.

Leave: nessun cambio (soft delete via `leftAt`).

Test: aggiornare flow esistenti per riflettere lo spawn map.

Commit: `feat: join party imposta spawn map come currentMap`

---

## FASE 4 — Render engine pluggable (Pixi/SVG)

### Task 18 — Lazy install pixi.js + composable usePixi

**Files:**
- Modify: `package.json` — `pnpm add pixi.js@^8`
- Create: `app/composables/usePixiApp.ts`

Composable: monta `PIXI.Application`, gestisce lifecycle (init in onMounted, destroy in onBeforeUnmount). Pattern reusabile.

Test: smoke unit (instanziazione mock).

Commit: `chore: aggiunge dipendenza pixi.js v8 e composable lifecycle`

### Task 19 — `MapView.vue` switch SVG/Pixi + composable usePartyMaps

**Files:**
- Create: `app/components/map/MapView.vue` (router fra SVG/Pixi)
- Create: `app/composables/usePartyMaps.ts`
- Create: `app/composables/useGeneratedMap.ts`

`usePartyMaps(seed)`: legge `useChatStore(seed)... no` — la lista mappe arriva con state-init. Aggiungi `usePartyStore(seed).maps` (T16 estende store) + `currentMapId` reattivo + `activeMap` computed. Ritorna anche `transitions` filtrato per mappa attiva.

`useGeneratedMap(mapTypeId, seed, params)`: chiama generator e cache.

`MapView.vue`:
```vue
<script setup>
const seed = usePartySeed()
const { activeMap, transitions } = usePartyMaps(seed)
const settings = useSettingsStore() // o /api/system/status
const engine = computed(() => settings.renderEngine ?? 'pixi')
</script>
<template>
  <component :is="engine === 'pixi' ? MapViewPixi : MapViewSvg" :map="activeMap" :transitions="transitions" />
</template>
```

Commit: `feat: map view router pixi/svg con composables`

### Task 20 — Refactor `GameMap.vue` → `MapViewSvg.vue`

**Files:**
- Create: `app/components/map/MapViewSvg.vue` (porting di GameMap.vue)
- Modify: `app/components/map/GameMap.vue` → diventa wrapper su `<MapView />` (alias)

Il porting parte dal `GameMap.vue` esistente ma legge le aree dalla `GeneratedMap` invece di `AREAS` hardcoded. Il componente accetta props `{ map, transitions }`. Adjacency dalla `map.adjacency`. Decor renderizzato dal `area.decor`.

Tutto il resto (zoom/pan, MapPlayersBox, MapLegend, MapAvatar, ecc) resta.

Test: visivo (smoke); lint+typecheck verde.

Commit: `refactor: GameMap diventa wrapper MapView, MapViewSvg consuma generated map`

### Task 21 — `MapViewPixi.vue` minimal viable

**Files:**
- Create: `app/components/map/MapViewPixi.vue`

Render minimal:
- canvas con PIXI.Application
- aree disegnate come Graphics (rect/polygon dal `area.shape`)
- avatars come Sprite (cerchi colorati in base al nick)
- zombies come sprite (circolo verde + emoji)
- pan via drag, zoom via wheel
- click su area emette `area-click` (router al detail)

Lazy import di pixi.js per non penalizzare bundle quando engine='svg'.

Test: smoke component mount/unmount (verify destroy chiamato).

Commit: `feat: MapViewPixi rendering canvas con pixi v8`

### Task 22 — Refactor `AreaDetailView.vue` → MapView pattern

**Files:**
- Create: `app/components/map/AreaDetailViewSvg.vue` (refactor)
- Create: `app/components/map/AreaDetailViewPixi.vue` (parità minima)
- Modify: `app/components/map/AreaDetailView.vue` → router fra i due

Il detail layout consuma `area.detail` dal generator (ogni area ha un layout interno).

Commit: `feat: detail view refactor con engine pluggable`

---

## FASE 5 — UI master gestione mappe

### Task 23 — Tab "Mondo" in MasterPanel

**Files:**
- Modify: `app/components/master/MasterPanel.vue` — aggiunge tab "Mondo"
- Create: `app/components/master/MapManagementTab.vue`

UI:
- Lista mappe della party con badge isSpawn, count membri/zombi
- Per ogni mappa: bottoni "Spawn", "Elimina", "Gestisci porte"
- Bottone "Crea nuova mappa" → modal (vedi T24)

Commit: `feat: master panel tab mondo con lista mappe`

### Task 24 — Modal crea mappa

**Files:**
- Create: `app/components/master/CreateMapModal.vue`

Form: select `mapTypeId` (solo enabled, da `/api/admin/map-types` o lista pubblica), input `name`, opzionale `mapSeed` (default random visualizzato), checkbox "imposta come spawn".

Su submit POST `/api/parties/<seed>/maps`. Toast successo.

Commit: `feat: modal crea mappa party`

### Task 25 — Modal gestisci transitions

**Files:**
- Create: `app/components/master/TransitionsModal.vue`

Per una mappa specifica:
- lista transitions outgoing + incoming
- bottone "Aggiungi porta" → form con: select mappa target, select area in mappa target (lista da generated map), select area in mappa corrente, label opzionale, checkbox bidirectional
- bottone "Elimina" per ogni transition

Commit: `feat: modal gestione transitions tra mappe`

### Task 26 — Render-engine setting visibile

**Files:**
- Modify: `app/pages/admin/settings.vue` — aggiungi `features.renderEngine` come select 'pixi' | 'svg' nella sezione Features

Commit: `feat: setting render engine in admin settings`

---

## FASE 6 — Integration finale + smoke + docs + gate

### Task 27 — Hello state init nuovo shape lato client

**Files:**
- Modify: `app/composables/usePartyConnections.ts` — handleEvent case `state:init` legge anche `maps`, `transitions`, `me.currentMapId`
- Modify: `app/stores/party.ts` — aggiungi `maps: PartyMapPublic[]`, `transitions: TransitionPublic[]`, `currentMapId`

Commit: `refactor: client store party multi-mappa state init`

### Task 28 — Move click area → invio toMapId

**Files:**
- Modify: `app/components/map/MapView.vue` (o sotto-componenti) — quando il player clicca un'area:
  1. Se l'area è dentro la mappa corrente: send `move:request` senza toMapId
  2. Se l'area è una transition outgoing: send con `toMapId` + `toAreaId` come da transition
- Modify: `app/components/map/MapViewSvg.vue` per visualizzare badge "porta" sulle aree edge che hanno transitions outgoing

Commit: `feat: click cross-map invia toMapId via transitions`

### Task 29 — Test integration cross-map flow completo

**Files:**
- Create: `tests/integration/ws/cross-map-flow.test.ts`

E2E: master crea party → mappa default city → aggiunge mappa country → crea transition city.<edgeArea> ↔ country.<edgeArea> → player joina → muove a edgeArea → muove cross-map → verifica `currentMapId` cambiato + state init updates.

Commit: `test: cross-map flow end-to-end`

### Task 30 — Smoke manuale + README

**Files:**
- Modify: `README.md`

Sezione "Multi-mappa (v2d)": tipologie, generator, transitions, render engine.

Smoke checklist (no commit):
- [ ] `pnpm db:migrate` → 0005 applicata, dati v2c azzerati, default seedati
- [ ] Login user → crea party → vedi spawn map city default
- [ ] Master apre tab Mondo → crea mappa country
- [ ] Crea transition city.<area> ↔ country.<area>
- [ ] Player muove cross-map → vede mappa country
- [ ] Admin in /admin/settings cambia renderEngine='svg' → ricarica pagina party → vedi SVG
- [ ] Toggle back → 'pixi' → vedi canvas
- [ ] Master prova delete mappa con player → 409 map_not_empty

Commit: `docs: sezione multi-mappa v2d in readme`

### Task 31 — Gate finale

- [ ] `pnpm lint && pnpm typecheck && pnpm test` verdi
- [ ] Test count target: ~495 + ~50 nuovi (generators + party-maps + transitions + cross-map) = ~545
- [ ] Smoke task 30 ok
- [ ] Commit:

```
git commit --allow-empty -m "chore: chiude plan 10 multi-map v2d"
```

Optional tag: `v0.5.0-multi-map`

---

## Checklist riassuntiva

- [ ] T1 — schema + migration 0005 clean break
- [ ] T2 — generator types
- [ ] T3 — generator city
- [ ] T4 — generator country
- [ ] T5 — generator wasteland
- [ ] T6 — generator registry+cache
- [ ] T7 — service map-types + admin endpoints
- [ ] T8 — service party-maps
- [ ] T9 — service map-transitions
- [ ] T10 — errors + limits
- [ ] T11 — endpoint master list/create maps
- [ ] T12 — endpoint master detail/delete/set-spawn
- [ ] T13 — endpoint transitions crud
- [ ] T14 — schemi WS multi-mappa
- [ ] T15 — server WS state-init + cross-map move
- [ ] T16 — services area-scoped con mapId
- [ ] T17 — join party imposta spawn map
- [ ] T18 — pixi.js + composable usePixiApp
- [ ] T19 — MapView router engine + composables
- [ ] T20 — MapViewSvg da GameMap
- [ ] T21 — MapViewPixi minimal
- [ ] T22 — AreaDetailView pluggable
- [ ] T23 — master panel tab mondo
- [ ] T24 — modal crea mappa
- [ ] T25 — modal transitions
- [ ] T26 — setting render engine in admin
- [ ] T27 — client store party multi-mappa
- [ ] T28 — click cross-map con toMapId
- [ ] T29 — test integration cross-map flow
- [ ] T30 — smoke manuale + README
- [ ] T31 — gate
