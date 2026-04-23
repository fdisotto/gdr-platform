# GDR Zombie — Plan 4: Chat completa + DM + storia

> Prerequisito: Plan 3 completato. La mappa funziona, gli avatar si muovono, say/emote/ooc/shout già operativi.

**Goal:** Implementare i kind rimanenti (`whisper`, `roll`, `dm`), aggiungere il parser slash completo nella chat input, tab DM con thread list + thread view, paginazione storia messaggi on-demand, kind `npc`/`announce` gestibili (ma master actions in Plan 5).

**Architettura:** La chat diventa multi-tab: [Area] [Sussurri] [OOC] [+ DM dinamici]. Lo store `chat` gestisce storia per area + thread DM raggruppati per coppia (min(a,b)::max(a,b)). Il parser `parseSlash` (già in `shared/slash/parse.ts`) viene usato dal `ChatInput` per routare l'evento WS in base al kind. Nuovo evento client `chat:history-before` per paginare storia vecchia.

---

## Task 1 — Protocol: whisper/roll/dm event shape

**Files:**
- Modify: `shared/protocol/ws.ts`, `tests/unit/protocol/ws.test.ts`

Estendi `ChatSendEvent` (già ha i campi `targetPlayerId` e `rollExpr` opzionali — aggiungi test sulla presenza richiesta per whisper/dm/roll).

Aggiungi:
- `HistoryFetchEvent` (client→server): `{ type: 'chat:history-before', areaId?, threadKey?, before: number, limit: number }`
- `HistoryBatchEvent` (server→client): `{ type: 'chat:history-batch', areaId?, threadKey?, messages: MessageRow[], hasMore: boolean }`

- [ ] TDD + commit.

---

## Task 2 — Fan-out whisper, dm, roll

**Files:**
- Modify: `server/ws/fanout.ts` (già ha skeleton whisper/dm — completa e testa)
- Modify: `tests/unit/server/fanout.test.ts`

**Logica:**
- `whisper`: mittente + target + master. `target` è nell'area (deve essere nella stessa area). Se non lo è → server risponde `error forbidden not_in_area_whisper`.
- `dm`: mittente + target + master. Nessun vincolo di area.
- `roll` (visibile): come `say` (area + master).
- `roll` hidden: solo master stessi — gestito in Plan 5.

- [ ] TDD fan-out. Commit.

---

## Task 3 — Handler chat:send per whisper/roll/dm

**Files:**
- Modify: `server/routes/ws/party.ts`
- Create: `tests/integration/ws/chat-advanced.test.ts`

**Logica:**
- whisper: lookup targetPlayerId per nickname (client può passare sia playerId sia nickname; per MVP accetta nickname e risolvi server-side). Validazione: target deve esistere nella party, area uguale. Persist.
- dm: validazione target esistente. Persist con `areaId: null`, `targetPlayerId`.
- roll (non hidden): server parsa `rollExpr` con `parseRoll` + `rollDice` con `mulberry32(seedFromString(partySeed + createdAt))`. Persist con `rollPayload: JSON.stringify({expr, rolls, total})`.
- Aggiornare `handleChatSend` per rimuovere la whitelist `say/emote/ooc` e accettare anche `whisper/dm/roll/shout`. Continuare a rifiutare `npc/announce/system` in Plan 4 (saranno solo master in Plan 5).

**Test integration:**
- Whisper tra A e B nello stesso area: A invia, B e master ricevono, C (altra area) no.
- Whisper fra A (piazza) e B (fogne): error `forbidden not_in_area_whisper`.
- DM A→B (diverse aree): entrambi ricevono.
- Roll `/roll 2d6` parsato correttamente, `rollPayload` popolato.

- [ ] TDD, commit.

---

## Task 4 — Integrazione parseSlash nel ChatInput client

**Files:**
- Modify: `app/components/chat/PartyChat.vue` (rinomina il template + input in `ChatInput.vue` + `ChatMessages.vue` per separare)

**Logica input:**
- Chiama `parseSlash(input)` prima dell'invio.
- Se `{ ok: false, error }`: mostra errore inline sopra la textarea (es. "Comando sconosciuto: /foo").
- Se `{ ok: true, command }`: mappa il comando in `chat:send` o comandi master (Plan 5):
  - `say`, `emote`, `ooc`, `shout`: invia `chat:send` con kind.
  - `whisper`: invia `chat:send` kind=whisper, targetPlayerId risolto dal nickname (lookup in `partyStore.players`).
  - `dm`: invia kind=dm con target.
  - `roll`: invia kind=roll con `rollExpr`.
  - Altri (npc, announce, mute, kick, …): Plan 5 gestirà — per ora toast "comando master, non disponibile".

**Toggle modalità** (say/emote/ooc) del Plan 2 diventa un'interfaccia di *scorciatoia visuale*; l'utente può comunque scrivere `/w nick ciao` senza toccare i pulsanti.

- [ ] Refactor + manual smoke test con ogni kind.
- [ ] Commit.

---

## Task 5 — Rendering differenziato per kind

**Files:**
- Modify: `app/components/chat/ChatMessages.vue` (o PartyChat)

Implementare stili dal spec §9:

| kind | stile |
|---|---|
| say | normal, nickname verde |
| whisper | corsivo viola + icona lock |
| emote | corsivo ambra, prefisso `*` |
| ooc | testo più piccolo, tossico, prefisso `((OOC))` |
| roll | box mono con formula + risultato + dettaglio dadi |
| shout | bold + icona megafono |
| dm | sfondo whisper 15% + badge "DM" |
| npc | serif + badge NPC |
| announce | full-width box rosso |
| system | mini corsivo grigio |
| deleted | `[messaggio rimosso]` (master vede barrato) |

Componente `ChatMessage.vue` con switch su `kind`.

- [ ] Smoke test visuale, commit.

---

## Task 6 — Tabs chat: Area, Sussurri area, OOC area, DM dinamici

**Files:**
- Create: `app/components/chat/ChatTabs.vue`
- Modify: `app/components/chat/PartyChat.vue`

**Logica:**
- Tabs statici: "Area [nome]", "Sussurri", "OOC".
- Tab dinamico per ogni DM aperto (thread selezionato da PlayersList o DirectMessagesView — Task 7).
- Click tab → cambia stream visualizzato.
- Le tab "Sussurri"/"OOC" filtrano i messaggi dell'area corrente per kind corrispondente.

Store chat aggiunge computed `areaMessages`, `whispersInArea`, `oocInArea`, `dmThreads`.

- [ ] Commit.

---

## Task 7 — Vista Direct Messages

**Files:**
- Create: `app/components/dm/DirectMessagesView.vue`
- Create: `app/components/dm/DMThread.vue`

**Logica:**
- `DirectMessagesView`: a sinistra lista thread (pair mittente/destinatario), a destra thread aperto.
- Thread key: `[min(selfId, otherId), max(selfId, otherId)].join('::')`.
- Click thread → attiva nella chat un tab DM.
- Nuovo thread: dropdown giocatori + bottone "Nuova conversazione".

Store chat nuova funzione: `listDmThreads(): { otherId, otherNickname, lastMessage }[]`.

Integrazione sidebar: nav "Messaggi" (icona) apre la vista principale `DirectMessagesView` al posto della mappa. Plan 5 definirà il layout sidebar vero; per Plan 4 un semplice toggle top-bar va bene.

- [ ] Commit.

---

## Task 8 — Paginazione storia messaggi

**Files:**
- Modify: `server/routes/ws/party.ts` (handler history-fetch)
- Modify: `server/services/messages.ts` (`listAreaMessagesBefore`, `listThreadMessagesBefore`)
- Modify: `app/stores/chat.ts` (prepend batch + `hasMore`)
- Modify: `app/components/chat/ChatMessages.vue` (infinite scroll top)

**Logica server:**
- `HistoryFetchEvent` con `areaId` → listAreaMessagesBefore(db, seed, areaId, before, limit=50) → `HistoryBatchEvent` con messages ordinati ASC + `hasMore`.
- Con `threadKey`: parse in `(idA, idB)`, listThreadMessagesBefore.
- Restrizione: accessibile solo al player stesso se threadKey lo include; master sempre.

**Logica client:**
- Quando scroll top della chat, chiama `connection.send({ type: 'chat:history-before', ... })`.
- Al batch: prepend in store, mantenere offset scroll (anchor sul primo messaggio noto).

- [ ] Test integration basic (50 messaggi, fetch lotti di 20).
- [ ] Commit.

---

## Task 9 — Aggiornamento state:init per DM iniziali

**Files:**
- Modify: `server/routes/ws/party.ts`
- Modify: `shared/protocol/ws.ts` (`StateInitEvent.dms`)
- Modify: `app/stores/chat.ts`

Al `hello`, oltre ai messaggi per area corrente, inviare al player i **DM recenti** di cui è parte (ultimi 50 aggregati). Store li hydrata in `chat.dmsByThread`.

- [ ] Commit.

---

## Task 10 — Gate finale Plan 4

- [ ] `pnpm lint && pnpm typecheck && pnpm build && pnpm test` verde.
- [ ] Manual E2E:
  - 3 browser (A, B, C). A e B in piazza, C in fogne.
  - A digita `/w B ciao segreto` → B e master lo vedono, C no.
  - B digita `/dm A ti ho sentito` da fogne (si è spostato) → A e master.
  - A digita `/roll 2d6+3` → area vede il box roll.
  - Scroll up in chat → batch storia precedente.

- [ ] Commit chiusura:

```
git commit --allow-empty -m "chore: chiude plan 4 chat completa e dm"
```

---

## Checklist

- [ ] Task 1 — history event schemas
- [ ] Task 2 — fanout whisper/dm/roll
- [ ] Task 3 — handler whisper/roll/dm
- [ ] Task 4 — parseSlash integrato nell'input
- [ ] Task 5 — rendering per kind
- [ ] Task 6 — tabs area/sussurri/ooc/DM
- [ ] Task 7 — vista DM
- [ ] Task 8 — paginazione storia
- [ ] Task 9 — state:init con DM iniziali
- [ ] Task 10 — gate
