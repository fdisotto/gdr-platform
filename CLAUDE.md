# GDR Zombie — Direttive per Claude

Questo file definisce le regole di collaborazione fra utente e assistente su
questo progetto. Leggilo all'inizio di ogni sessione.

## Lingua

- Comunicazione con l'utente: **italiano**.
- Nomi di file, variabili, funzioni, tipi, identificatori di codice: **inglese**.
- Copy UI rivolta all'utente finale: **italiano** (tono asciutto, post-apocalittico,
  mai ironico ai limiti del meme).
- Commenti nel codice: solo quando spiegano un *perché* non ovvio; in italiano
  o inglese, coerenti con il file.

## Scope attuale

È l'**MVP** di una piattaforma per gestire GDR a tema zombi / post-apocalittico.
Leggi sempre `docs/superpowers/specs/2026-04-23-gdr-zombie-mvp-design.md` per
i dettagli autoritativi.

### Fuori scope (non anticipare, non astrarre preventivamente):

- Registrazione / login / OAuth / password reset.
- Dashboard amministrative, analytics, report.
- Multi-party **attiva** in contemporanea per utente.
- Multi-mappa, multi-city, mappa generata proceduralmente.
- Character sheet, inventario, sistema regole.
- Voice / video chat.
- Mobile-first redesign.

Evita astrazioni non giustificate dallo scope attuale (YAGNI). Tre righe simili
sono meglio di una classe base speculativa.

## Workflow

Segui i workflow delle skill `superpowers`:

- `superpowers:brainstorming` per nuove feature / modifiche di design.
- `superpowers:writing-plans` per produrre un piano prima di implementare.
- `superpowers:executing-plans` o `superpowers:subagent-driven-development`
  per eseguire il piano.
- `superpowers:test-driven-development`: test prima, codice dopo, per la
  logica pura (`shared/`) e i servizi.
- `superpowers:verification-before-completion`: prima di dichiarare un task
  completo, esegui i check verdi elencati sotto.

## Git

- **Un commit per task** implementativo completato. Niente commit giganti,
  niente WIP a metà.
- Subject in **italiano**, imperativo, minuscolo, ≤72 caratteri.
- Body opzionale con bullet che spiegano il **perché**, non il cosa.
- **Mai trailer AI**: niente `Co-Authored-By: Claude ...`, niente
  `Generated with Claude Code`, niente riferimenti a modelli o assistenti.
  I commit devono apparire scritti dall'utente.
- Config git da usare: `fdisotto <fabio.disotto@gmail.com>` (già global).
- Staging **selettivo**: `git add <path>` mirato, mai `git add -A` cieco.
  Verifica `git status` prima.
- Mai `--no-verify`, mai bypass di hook o firma.
- Azioni distruttive (reset --hard, force push, delete branch) solo se
  l'utente lo chiede esplicitamente.

## Stack e scelte architetturali

- **Nuxt 4** (SSR + API + WebSocket nello stesso processo Nitro).
- **Nuxt UI 4** + **TailwindCSS 4**, dark-only.
- **TypeScript** ovunque; `strict: true`.
- **Drizzle ORM** su **SQLite** (`better-sqlite3`), DB in `./data/gdr.sqlite`
  (gitignored).
- **Zod** ai confini (HTTP request + WS event in entrambe le direzioni),
  tipi condivisi in `shared/`.
- **Pinia** per lo stato client.
- **Vitest** per unit/integration; **Playwright** (opzionale, 1 scenario
  E2E happy path).
- Realtime via **WebSocket Nitro** (`defineWebSocketHandler`), un handler
  unico per party con dispatch per kind evento.
- **Nessun auth provider**: nickname + masterToken + sessionToken in
  `localStorage`. `masterToken` hashato bcrypt (factor 8) in DB.
- Rendering mappa: **SVG inline** (migrazione a Leaflet prevista solo se
  la mappa evolve verso multi-city/zoom di dettaglio).

## Convenzioni codice

- File Vue: `<script setup lang="ts">` + `<template>` + `<style scoped>`
  (se necessario). Composition API sempre.
- Componenti: PascalCase. Composables: `useCamelCase`. Stores Pinia:
  kebab nel filename, `useCamelCaseStore` come export.
- Server handlers: un file per endpoint HTTP. WS handler diviso per
  dominio in `server/ws/handlers/`.
- Errori: codici tassonomizzati in `shared/errors.ts`. Mai stringhe
  libere nei fail path.
- Niente try/catch "swallow". Se catch, log o rethrow con contesto.
- Nessun `any`. Se davvero necessario, `unknown` + narrowing.

## Palette e tema

Definita in `app/assets/css/main.css` come custom properties `--z-*`.
Mappata ai token Nuxt UI in `app/app.config.ts`. Dark-only: non aggiungere
light mode senza richiesta esplicita.

## Verifica prima di completare un task

Prima di dichiarare un task "done" e prima di committare, esegui e verifica
tutti verdi:

```
pnpm lint
pnpm typecheck
pnpm test           # vitest run (unit + integration)
```

Se un test fallisce: **non committare**, diagnostica la causa prima.
Non usare `--no-verify` per saltare hook.

Prima di dichiarare feature UI complete, testa manualmente il flusso in
browser con `pnpm dev` almeno per il golden path. Se non puoi testare
l'UI, dichiaralo esplicitamente invece di rivendicare il successo.

## File autoritativi

- `docs/superpowers/specs/2026-04-23-gdr-zombie-mvp-design.md` — spec MVP.
- Questo `CLAUDE.md` — direttive di collaborazione.
- I piani implementativi in `docs/superpowers/plans/` (quando esistono)
  sono autoritativi per la sessione corrente di implementazione.
