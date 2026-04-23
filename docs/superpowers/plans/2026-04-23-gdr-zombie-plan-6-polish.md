# GDR Zombie — Plan 6: Polish

> Prerequisito: Plan 5 completato. L'MVP è funzionalmente completo.

**Goal:** Irrobustire l'esperienza: toast errori + modali bloccanti, reconnect UX pulita, E2E Playwright (1 scenario happy path), coverage config, smoke test con 30 player simulati, README aggiornato con istruzioni run + deploy, cleanup finale.

**Architettura:** Nessun cambiamento architetturale. Si aggiungono componenti UI di feedback, uno scenario Playwright, documentazione, e si misura performance.

---

## Task 1 — Toast errori e modali bloccanti

**Files:**
- Modify: `app/composables/usePartyConnection.ts` (gestire `error` event con callback)
- Create: `app/composables/useErrorFeedback.ts`
- Modify: `app/app.vue` per includere contenitore toast (Nuxt UI `UToaster` o custom).

**Logica:**
- Map codice errore → presentazione:
  - Normali (`rate_limited`, `invalid_payload`, `forbidden`, `conflict`, `bad_roll_expr`, `muted`, `not_adjacent`, `area_closed`, `not_found`): toast in basso a destra con colore coerente (rust per warn, blood per danger).
  - Bloccanti (`session_invalid`, `session_superseded`, `banned`, `master_only` da flusso admin): modale fullscreen con CTA "Torna alla home" + clear session locale.
  - `kicked`: modale con reason.
- Messaggi i18n-ready (stringhe in italiano per MVP, oggetto map).

- [ ] TDD composable (gestione map + tipo union).
- [ ] Smoke visual test.
- [ ] Commit.

---

## Task 2 — Reconnection UX raffinata

**Files:**
- Modify: `app/composables/usePartyConnection.ts`
- Modify: `app/components/layout/ConnectionBanner.vue` (da Plan 3)

**Miglioramenti:**
- Countdown al prossimo tentativo ("Riconnessione in 5s…").
- Bottone "Riprova ora" per forzare il reconnect bypass backoff.
- Pulsante "Esci" se più di N tentativi fallito.
- Pending queue: mostra numero messaggi in coda ("3 messaggi in attesa").
- Al riconnettere, flush della coda con delay 200ms (evita thunder).

- [ ] Commit.

---

## Task 3 — Messaggi pending con indicatore UI

**Files:**
- Modify: `app/components/chat/ChatMessages.vue`
- Modify: `app/composables/usePartyConnection.ts`

**Logica:**
- Quando utente invia durante `reconnecting`, append in chat store come messaggio optimistic con `pending: true` (clientTempId).
- Server echo `message:new` in entrata: se il messaggio ha authorPlayerId+body+createdAt matching → replace optimistic, remove pending flag.
- UI: pending rendering con icona clock `text-lo`.

- [ ] Sottile da testare; commit.

---

## Task 4 — Lista players in sidebar / views

**Files:**
- Create: `app/components/players/PlayersList.vue`

Mostra elenco players online raggruppati per area, con:
- Indicatore muted (icona mute).
- Indicatore master (corona).
- Self evidenziato.
- Click → context menu (master) o nuovo DM (user).

Usata come `mainView === 'players'`.

- [ ] Commit.

---

## Task 5 — E2E Playwright (1 scenario happy path)

**Files:**
- `pnpm add -D @playwright/test && npx playwright install chromium`
- Create: `playwright.config.ts`
- Create: `e2e/happy-path.spec.ts`

**Scenario:**
1. Browser A: home → set nickname "Master" → Crea party → screenshot modale seed+token.
2. Estrai seed dalla DOM.
3. Browser B (nuova context): home → set nickname "Anna" → unisciti con seed come user → entra.
4. B invia "ciao" → A vede.
5. A digita `/roll 2d6` → B vede il box roll.
6. A (master) cancella ultimo messaggio di B → B vede `[messaggio rimosso]`.
7. A scrive `/move Anna fogne` → B si ritrova in fogne nella mappa.

- [ ] Config Playwright con `webServer: 'pnpm dev'`.
- [ ] Eseguire `pnpm playwright test` verde.
- [ ] Commit.

---

## Task 6 — Coverage config + CI script

**Files:**
- Modify: `vitest.config.ts` (thresholds)
- Modify: `package.json` (script `test:ci = lint + typecheck + test + playwright`)

**Soglie coverage ragionevoli MVP:**
- shared/: 90% line, 90% branch
- server/services + server/ws: 70% line
- overall: 60%

(Permissive ma difensivo contro regressioni totali.)

- [ ] Commit.

---

## Task 7 — Smoke performance con 30 player simulati

**Files:**
- Create: `scripts/smoke-load.ts`

Node script che apre 30 WebSocket connection, ognuna invia 1 messaggio ogni 2s per 60s, misura tempo medio di ricezione echo.

Soglia soft: latenza < 200ms sul localhost, error rate < 1%.

- [ ] Eseguire manualmente; risultato in un README-only report (no CI ancora).
- [ ] Commit.

---

## Task 8 — README aggiornato

**Files:**
- Modify: `README.md`

Sostituisci il contenuto Nuxt starter con:
- Descrizione progetto (2-3 righe).
- Stack.
- Setup (`pnpm install && pnpm dev`).
- Come giocare: crea party → condividi seed → gli amici entrano → chat + mappa.
- Scripts utili (`pnpm test`, `pnpm test:ci`, `pnpm db:generate`, `pnpm db:bundle`).
- Deploy basilare: `pnpm build` → `node .output/server/index.mjs`, variabili env (`DATABASE_URL`, `PORT`), reverse proxy con WS upgrade abilitato (nota su nginx: `proxy_http_version 1.1`, `proxy_set_header Upgrade`, `Connection`).
- Roadmap (riferimenti ai plan 1-5 già chiusi, e sezione 14 dello spec per future extensions).

- [ ] Commit.

---

## Task 9 — Cleanup finale

**Files:** vari.

- [ ] Rimuovere `console.log` dimenticati.
- [ ] Verificare che tutti i TODO nel codice abbiano un riferimento al Plan futuro (es. `// TODO(Plan 6)` → dovrebbero essere 0).
- [ ] `pnpm audit` check dipendenze (note security note se trovate).
- [ ] Git status pulito.
- [ ] Commit (o nessun cambio).

---

## Task 10 — Gate finale Plan 6 e chiusura MVP

- [ ] `pnpm test:ci` verde (include Playwright).
- [ ] Manuale: tour completo di ogni feature (create/join/map/chat/whisper/dm/roll/shout/move/master tools).
- [ ] Commit chiusura:

```
git commit --allow-empty -m "chore: chiude plan 6 e mvp gdr zombi v1"
```

Tag ottimale: `git tag v0.1.0 -m "MVP GDR Zombi"` (opzionale, se si vuole un release marker).

---

## Checklist

- [ ] Task 1 — toast + modali errori
- [ ] Task 2 — reconnect UX raffinata
- [ ] Task 3 — pending optimistic
- [ ] Task 4 — PlayersList
- [ ] Task 5 — E2E Playwright
- [ ] Task 6 — coverage + ci script
- [ ] Task 7 — smoke load 30 player
- [ ] Task 8 — README
- [ ] Task 9 — cleanup
- [ ] Task 10 — gate + tag
