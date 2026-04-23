# GDR Zombie — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porre le fondamenta del progetto GDR zombi: dipendenze, palette dark-only, shared logic pura (seed, mappa, meteo, dadi, slash, protocolli Zod, errori), schema DB Drizzle + prima migration, servizi minimi (parties, players, areas) e 4 endpoint HTTP (`create` / `join` / `reclaim-master` / `resume`) coperti da test integration.

**Architettura:** Nuxt 4 monolite (Nitro + Vue), TypeScript strict. Logica pura in `shared/` (importabile da client/server/test). Persistenza SQLite via Drizzle ORM. Validazione Zod ai confini. Nessuna UI applicativa in questo plan — solo scaffolding, palette e API HTTP.

**Tech Stack:** Nuxt 4 · Nuxt UI 4 · TailwindCSS 4 · TypeScript · Pinia · Drizzle ORM · better-sqlite3 · Zod · bcryptjs · Vitest · @nuxt/test-utils.

**Riferimenti:**
- Spec: `docs/superpowers/specs/2026-04-23-gdr-zombie-mvp-design.md`
- Direttive collaborazione: `CLAUDE.md`

**Convenzioni git:** un commit per task, subject italiano imperativo minuscolo ≤72 char, mai trailer AI. Staging mirato. Prima di committare un task: `pnpm lint && pnpm typecheck && pnpm test` verdi.

**Convenzione import:** per codice in `shared/` usiamo path alias `~~/shared/...` (Nuxt 4 risolve `~~` alla root del progetto e condivide le paths tra app/server).

---

## Task 1 — Installare dipendenze runtime e dev

**Files:**
- Modify: `/Users/mashfrog/Work/gdr-zombie/package.json`
- Modify: `/Users/mashfrog/Work/gdr-zombie/pnpm-lock.yaml` (auto)

- [ ] **Step 1: Installare deps runtime**

Run:
```bash
pnpm add pinia @pinia/nuxt drizzle-orm better-sqlite3 zod bcryptjs
```

- [ ] **Step 2: Installare deps dev**

Run:
```bash
pnpm add -D drizzle-kit vitest @vitest/coverage-v8 @nuxt/test-utils @types/better-sqlite3 @types/bcryptjs
```

- [ ] **Step 3: Aggiungere script npm**

Edit `package.json` → in `"scripts"`:

```json
{
  "scripts": {
    "build": "nuxt build",
    "dev": "nuxt dev",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare",
    "lint": "eslint .",
    "typecheck": "nuxt typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

- [ ] **Step 4: Verificare installazione**

Run:
```bash
pnpm typecheck
```
Expected: exit 0 (nessun errore TS; le nuove deps compilano).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: aggiungi dipendenze pinia, drizzle, vitest"
```

---

## Task 2 — Configurare Vitest, tsconfig paths, data/ dir, .gitignore

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/vitest.config.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/.gitkeep`
- Create: `/Users/mashfrog/Work/gdr-zombie/data/.gitkeep`
- Modify: `/Users/mashfrog/Work/gdr-zombie/.gitignore`
- Modify: `/Users/mashfrog/Work/gdr-zombie/tsconfig.json`
- Modify: `/Users/mashfrog/Work/gdr-zombie/nuxt.config.ts`

- [ ] **Step 1: Creare vitest.config.ts**

Create `vitest.config.ts`:

```ts
import { defineVitestConfig } from '@nuxt/test-utils/config'
import { fileURLToPath } from 'node:url'

export default defineVitestConfig({
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('./', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['shared/**/*.ts', 'server/**/*.ts'],
      exclude: ['**/*.test.ts', 'server/db/migrations/**']
    }
  }
})
```

- [ ] **Step 1b: Aggiungere alias `~~` in nuxt.config.ts per Nitro**

Edit `nuxt.config.ts` aggiungendo la sezione `alias` e `nitro.alias` (serve perché Nitro bundla i file server e gli `import ... from '~~/...'` dentro API routes devono risolvere):

```ts
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  alias: {
    '~~': fileURLToPath(new URL('./', import.meta.url))
  },

  nitro: {
    alias: {
      '~~': fileURLToPath(new URL('./', import.meta.url))
    }
  },

  routeRules: {
    '/': { prerender: false }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
```

(La Task 3 riapplicherà altre modifiche a questo file, preservando le alias.)

- [ ] **Step 2: Aggiornare .gitignore**

Append to `.gitignore`:

```
# App data (sqlite)
data/*
!data/.gitkeep

# Vitest
coverage
```

- [ ] **Step 3: Creare placeholder**

Run:
```bash
mkdir -p tests/unit tests/integration data
touch tests/.gitkeep data/.gitkeep
```

- [ ] **Step 4: Aggiornare tsconfig.json per path alias**

Replace `tsconfig.json` full content:

```json
{
  "extends": "./.nuxt/tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "~~/*": ["./*"],
      "~/*": ["./app/*"]
    },
    "types": ["vitest/globals"]
  },
  "include": [
    "shared/**/*",
    "tests/**/*"
  ]
}
```

- [ ] **Step 5: Smoke test Vitest**

Create temporary `tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run:
```bash
pnpm test
```
Expected: `1 passed`. Then delete the smoke file:

```bash
rm tests/unit/smoke.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tsconfig.json .gitignore tests data
git commit -m "chore: configura vitest e path alias per test"
```

---

## Task 3 — Palette zombi e dark-only

**Files:**
- Modify: `/Users/mashfrog/Work/gdr-zombie/app/assets/css/main.css`
- Modify: `/Users/mashfrog/Work/gdr-zombie/app/app.config.ts`
- Modify: `/Users/mashfrog/Work/gdr-zombie/nuxt.config.ts`
- Modify: `/Users/mashfrog/Work/gdr-zombie/app/app.vue`

- [ ] **Step 1: Palette CSS custom properties**

Replace `app/assets/css/main.css` full content:

```css
@import "tailwindcss";
@import "@nuxt/ui";

:root {
  color-scheme: dark;

  /* Neutri — cemento, cenere, notte */
  --z-bg-900: #0b0d0c;
  --z-bg-800: #121513;
  --z-bg-700: #1a1e1b;
  --z-bg-600: #252a26;
  --z-border:  #2f3630;
  --z-text-hi: #d4d9d1;
  --z-text-md: #9aa199;
  --z-text-lo: #656a63;

  /* Verdi malaticci — accent primario */
  --z-green-900: #0f2a1a;
  --z-green-700: #1f5a33;
  --z-green-500: #3a8a4c;
  --z-green-300: #7cbe79;
  --z-green-100: #c9e3b0;

  /* Ruggine / ambra — warning, emote */
  --z-rust-700: #5a3018;
  --z-rust-500: #a8572a;
  --z-rust-300: #d4965b;

  /* Sangue desaturato — danger, announce */
  --z-blood-700: #5a1a1a;
  --z-blood-500: #8e2c2c;
  --z-blood-300: #b96565;

  /* Viola fumoso — whisper, dm */
  --z-whisper-500: #6a4e7a;
  --z-whisper-300: #9b81a8;

  /* Tossico — ooc */
  --z-toxic-500: #9aa13a;
}

html,
body {
  background: var(--z-bg-900);
  color: var(--z-text-hi);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

.font-mono-z {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

- [ ] **Step 2: Override token Nuxt UI**

Replace `app/app.config.ts` full content:

```ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'zinc',
      error: 'red'
    }
  }
})
```

Edit `nuxt.config.ts` per aggiungere `@pinia/nuxt` e forzare dark mode (preservando gli alias di Task 2):

```ts
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@pinia/nuxt'
  ],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },

  alias: {
    '~~': fileURLToPath(new URL('./', import.meta.url))
  },

  nitro: {
    alias: {
      '~~': fileURLToPath(new URL('./', import.meta.url))
    }
  },

  routeRules: {
    '/': { prerender: false }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
```

- [ ] **Step 3: Pulire app.vue del starter**

Replace `app/app.vue` full content:

```vue
<script setup lang="ts">
useHead({
  htmlAttrs: {
    lang: 'it',
    class: 'dark'
  },
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ]
})

useSeoMeta({
  title: 'GDR Zombi',
  description: 'Piattaforma per giocare di ruolo in un mondo infestato dai morti.'
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
```

- [ ] **Step 4: Rimuovere componenti starter**

Run:
```bash
rm app/components/AppLogo.vue app/components/TemplateMenu.vue
```

Replace `app/pages/index.vue` full content (placeholder minimale):

```vue
<script setup lang="ts">
useSeoMeta({ title: 'GDR Zombi — Benvenuto' })
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-8">
    <div class="text-center space-y-4">
      <h1 class="text-4xl font-bold tracking-tight" style="color: var(--z-green-300)">
        GDR Zombi
      </h1>
      <p class="text-sm" style="color: var(--z-text-md)">
        La città non è più quella che ricordi.
      </p>
    </div>
  </main>
</template>
```

- [ ] **Step 5: Verificare**

Run:
```bash
pnpm lint
pnpm typecheck
```
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app nuxt.config.ts
git commit -m "feat: palette zombi dark-only e shell app minimale"
```

---

## Task 4 — `shared/errors.ts` (codici errore tassonomizzati)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/shared/errors.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/errors.test.ts`

- [ ] **Step 1: Scrivere il test**

Create `tests/unit/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ERROR_CODES, isErrorCode, type ErrorCode } from '~~/shared/errors'

describe('ERROR_CODES', () => {
  it('contiene tutti i codici attesi', () => {
    const expected = [
      'invalid_payload', 'not_found', 'forbidden', 'rate_limited',
      'conflict', 'muted', 'banned', 'area_closed', 'not_adjacent',
      'master_only', 'session_invalid', 'session_superseded', 'bad_roll_expr'
    ]
    for (const code of expected) {
      expect(ERROR_CODES).toContain(code)
    }
  })

  it('isErrorCode riconosce codici validi', () => {
    expect(isErrorCode('not_found')).toBe(true)
    expect(isErrorCode('conflict')).toBe(true)
  })

  it('isErrorCode rifiuta stringhe non valide', () => {
    expect(isErrorCode('pippo')).toBe(false)
    expect(isErrorCode('')).toBe(false)
  })

  it('ErrorCode è un union literal', () => {
    const x: ErrorCode = 'not_found'
    expect(x).toBe('not_found')
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/unit/errors.test.ts
```
Expected: FAIL — `Cannot find module '~~/shared/errors'`.

- [ ] **Step 3: Implementare**

Create `shared/errors.ts`:

```ts
export const ERROR_CODES = [
  'invalid_payload',
  'not_found',
  'forbidden',
  'rate_limited',
  'conflict',
  'muted',
  'banned',
  'area_closed',
  'not_adjacent',
  'master_only',
  'session_invalid',
  'session_superseded',
  'bad_roll_expr'
] as const

export type ErrorCode = typeof ERROR_CODES[number]

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value)
}

export class DomainError extends Error {
  constructor(public readonly code: ErrorCode, public readonly detail?: string) {
    super(`${code}${detail ? `: ${detail}` : ''}`)
    this.name = 'DomainError'
  }
}
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/unit/errors.test.ts
```
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add shared/errors.ts tests/unit/errors.test.ts
git commit -m "feat: aggiungi codici errore tassonomizzati"
```

---

## Task 5 — `shared/map/areas.ts` (catalogo + adiacenza)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/shared/map/areas.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/map/areas.test.ts`

- [ ] **Step 1: Scrivere il test**

Create `tests/unit/map/areas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  AREAS, AREA_IDS, ADJACENCY, isAreaId, areAdjacent, reachableFrom
} from '~~/shared/map/areas'

describe('AREAS catalog', () => {
  it('contiene esattamente 14 aree', () => {
    expect(AREAS).toHaveLength(14)
  })

  it('ogni area ha id, name e svg metadata', () => {
    for (const a of AREAS) {
      expect(a.id).toMatch(/^[a-z_]+$/)
      expect(a.name.length).toBeGreaterThan(0)
      expect(a.svg).toMatchObject({
        x: expect.any(Number),
        y: expect.any(Number),
        w: expect.any(Number),
        h: expect.any(Number)
      })
    }
  })

  it('id univoci', () => {
    const ids = AREAS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('isAreaId discrimina', () => {
    expect(isAreaId('piazza')).toBe(true)
    expect(isAreaId('nonexiste')).toBe(false)
  })
})

describe('ADJACENCY', () => {
  it('copre tutte le aree', () => {
    for (const id of AREA_IDS) {
      expect(ADJACENCY[id]).toBeDefined()
    }
  })

  it('è simmetrica', () => {
    for (const a of AREA_IDS) {
      for (const b of ADJACENCY[a]) {
        expect(ADJACENCY[b]).toContain(a)
      }
    }
  })

  it('nessuna area adiacente a se stessa', () => {
    for (const id of AREA_IDS) {
      expect(ADJACENCY[id]).not.toContain(id)
    }
  })

  it('areAdjacent funziona in entrambe le direzioni', () => {
    expect(areAdjacent('piazza', 'chiesa')).toBe(true)
    expect(areAdjacent('chiesa', 'piazza')).toBe(true)
    expect(areAdjacent('piazza', 'rifugio')).toBe(false)
  })
})

describe('connettività', () => {
  it('ogni area è raggiungibile da piazza entro 6 hop', () => {
    const reachable = reachableFrom('piazza', 6)
    for (const id of AREA_IDS) {
      expect(reachable).toContain(id)
    }
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/unit/map/areas.test.ts
```
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Create `shared/map/areas.ts`:

```ts
export const AREA_IDS = [
  'piazza', 'giardino', 'supermercato', 'ospedale', 'chiesa',
  'polizia', 'scuola', 'rifugio', 'benzinaio', 'case',
  'fogne', 'porto', 'radio', 'ponte'
] as const

export type AreaId = typeof AREA_IDS[number]

export interface AreaSvg {
  x: number
  y: number
  w: number
  h: number
  shape: 'rect' | 'polygon'
  points?: string
}

export interface Area {
  id: AreaId
  name: string
  svg: AreaSvg
}

// Layout logico su viewBox 1000x700; coordinate approssimative per MVP, rifinite
// quando il componente GameMap verrà disegnato nel Plan 3.
export const AREAS: readonly Area[] = [
  { id: 'piazza',       name: 'Piazza Centrale',    svg: { x: 440, y: 300, w: 120, h: 100, shape: 'rect' } },
  { id: 'giardino',     name: 'Giardino',           svg: { x: 280, y: 310, w: 140, h: 90,  shape: 'rect' } },
  { id: 'supermercato', name: 'Supermercato',       svg: { x: 580, y: 310, w: 140, h: 90,  shape: 'rect' } },
  { id: 'ospedale',     name: 'Ospedale',           svg: { x: 740, y: 120, w: 160, h: 110, shape: 'rect' } },
  { id: 'chiesa',       name: 'Chiesa',             svg: { x: 360, y: 140, w: 150, h: 110, shape: 'rect' } },
  { id: 'polizia',      name: 'Stazione Polizia',   svg: { x: 540, y: 140, w: 160, h: 110, shape: 'rect' } },
  { id: 'scuola',       name: 'Scuola',             svg: { x: 580, y: 10,  w: 180, h: 100, shape: 'rect' } },
  { id: 'rifugio',      name: 'Rifugio Sotterraneo', svg: { x: 40,  y: 500, w: 160, h: 100, shape: 'rect' } },
  { id: 'benzinaio',    name: 'Stazione Servizio',  svg: { x: 780, y: 420, w: 160, h: 90,  shape: 'rect' } },
  { id: 'case',         name: 'Quartiere Residenziale', svg: { x: 370, y: 430, w: 260, h: 100, shape: 'rect' } },
  { id: 'fogne',        name: 'Fogne',              svg: { x: 210, y: 560, w: 300, h: 90,  shape: 'rect' } },
  { id: 'porto',        name: 'Porto',              svg: { x: 230, y: 440, w: 120, h: 90,  shape: 'rect' } },
  { id: 'radio',        name: 'Radio-Torre',        svg: { x: 70,  y: 280, w: 150, h: 110, shape: 'rect' } },
  { id: 'ponte',        name: 'Ponte',              svg: { x: 860, y: 560, w: 120, h: 90,  shape: 'rect' } }
]

export const ADJACENCY: Record<AreaId, AreaId[]> = {
  piazza:       ['chiesa', 'polizia', 'supermercato', 'giardino', 'case'],
  giardino:     ['piazza', 'scuola', 'case'],
  supermercato: ['piazza', 'benzinaio', 'case'],
  ospedale:     ['scuola', 'fogne', 'case'],
  chiesa:       ['piazza', 'scuola', 'fogne'],
  polizia:      ['piazza', 'benzinaio', 'case'],
  scuola:       ['giardino', 'ospedale', 'chiesa'],
  rifugio:      ['fogne', 'porto'],
  benzinaio:    ['supermercato', 'polizia', 'ponte'],
  case:         ['piazza', 'giardino', 'supermercato', 'ospedale', 'polizia'],
  fogne:        ['piazza', 'ospedale', 'chiesa', 'rifugio'],
  porto:        ['rifugio', 'ponte', 'radio'],
  radio:        ['porto', 'ponte'],
  ponte:        ['benzinaio', 'porto', 'radio']
}

export function isAreaId(value: unknown): value is AreaId {
  return typeof value === 'string' && (AREA_IDS as readonly string[]).includes(value)
}

export function areAdjacent(a: AreaId, b: AreaId): boolean {
  return ADJACENCY[a].includes(b)
}

export function reachableFrom(start: AreaId, maxHops: number): Set<AreaId> {
  const visited = new Set<AreaId>([start])
  let frontier: AreaId[] = [start]
  for (let hop = 0; hop < maxHops; hop++) {
    const next: AreaId[] = []
    for (const node of frontier) {
      for (const neigh of ADJACENCY[node]) {
        if (!visited.has(neigh)) {
          visited.add(neigh)
          next.push(neigh)
        }
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return visited
}
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/unit/map/areas.test.ts
```
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add shared/map/areas.ts tests/unit/map/areas.test.ts
git commit -m "feat: aggiungi catalogo aree mappa e grafo adiacenza"
```

---

## Task 6 — `shared/seed/prng.ts` (Mulberry32)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/shared/seed/prng.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/seed/prng.test.ts`

- [ ] **Step 1: Scrivere il test**

Create `tests/unit/seed/prng.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mulberry32, seedFromString } from '~~/shared/seed/prng'

describe('mulberry32', () => {
  it('produce stessa sequenza con stesso seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b())
    }
  })

  it('produce sequenze diverse con seed diversi', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const seqA = Array.from({ length: 5 }, () => a())
    const seqB = Array.from({ length: 5 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('output in [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('seedFromString', () => {
  it('è deterministico', () => {
    expect(seedFromString('hello')).toBe(seedFromString('hello'))
  })

  it('differenzia stringhe diverse', () => {
    expect(seedFromString('a')).not.toBe(seedFromString('b'))
  })

  it('produce un intero 32-bit', () => {
    const v = seedFromString('some-uuid-here')
    expect(Number.isInteger(v)).toBe(true)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(2 ** 32)
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/unit/seed/prng.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `shared/seed/prng.ts`:

```ts
/**
 * Mulberry32 PRNG — algoritmo leggero, deterministico, adeguato per
 * generare stato di gioco non-crittografico.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Hash stringa → uint32 deterministico (cyrb53 troncato).
 * Usato per trasformare un UUID-seed in seme numerico per mulberry32.
 */
export function seedFromString(input: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  return (h1 ^ h2) >>> 0
}
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/unit/seed/prng.test.ts
```
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add shared/seed/prng.ts tests/unit/seed/prng.test.ts
git commit -m "feat: aggiungi prng mulberry32 e hash seed"
```

---

## Task 7 — `shared/seed/derive-city.ts` (stato iniziale aree + nome città)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/shared/seed/derive-city.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/seed/derive-city.test.ts`

- [ ] **Step 1: Scrivere il test**

Create `tests/unit/seed/derive-city.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveCityState, type AreaStatus } from '~~/shared/seed/derive-city'
import { AREA_IDS } from '~~/shared/map/areas'

describe('deriveCityState', () => {
  it('è deterministico', () => {
    const a = deriveCityState('550e8400-e29b-41d4-a716-446655440000')
    const b = deriveCityState('550e8400-e29b-41d4-a716-446655440000')
    expect(a).toEqual(b)
  })

  it('cityName non vuoto', () => {
    const s = deriveCityState('abc-123')
    expect(s.cityName.length).toBeGreaterThan(0)
  })

  it('copre tutte le aree', () => {
    const s = deriveCityState('seed-x')
    for (const id of AREA_IDS) {
      expect(s.areas[id]).toBeDefined()
      expect(['intact', 'infested', 'ruined', 'closed']).toContain(s.areas[id].status)
    }
  })

  it('piazza è sempre intact', () => {
    for (let i = 0; i < 20; i++) {
      const s = deriveCityState(`seed-${i}`)
      expect(s.areas.piazza.status).toBe<AreaStatus>('intact')
    }
  })

  it('su 1000 seed la distribuzione degli status rispetta circa 40/35/20/5', () => {
    const counts: Record<string, number> = { intact: 0, infested: 0, ruined: 0, closed: 0 }
    let total = 0
    for (let i = 0; i < 1000; i++) {
      const s = deriveCityState(`seed-${i}`)
      for (const id of AREA_IDS) {
        if (id === 'piazza') continue
        counts[s.areas[id].status]++
        total++
      }
    }
    expect(counts.intact / total).toBeGreaterThan(0.33)
    expect(counts.intact / total).toBeLessThan(0.47)
    expect(counts.infested / total).toBeGreaterThan(0.28)
    expect(counts.infested / total).toBeLessThan(0.42)
    expect(counts.ruined / total).toBeGreaterThan(0.14)
    expect(counts.ruined / total).toBeLessThan(0.26)
    expect(counts.closed / total).toBeGreaterThan(0.02)
    expect(counts.closed / total).toBeLessThan(0.08)
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/unit/seed/derive-city.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `shared/seed/derive-city.ts`:

```ts
import { AREAS, AREA_IDS, type AreaId } from '~~/shared/map/areas'
import { mulberry32, seedFromString } from '~~/shared/seed/prng'

export type AreaStatus = 'intact' | 'infested' | 'ruined' | 'closed'

export interface AreaInitialState {
  status: AreaStatus
  customName: string | null
}

export interface CityState {
  cityName: string
  areas: Record<AreaId, AreaInitialState>
}

const CITY_NAMES = [
  'Valmorta', 'Nuova Dolore', 'San Tetro', 'Corpolario', 'Grigiovento',
  'Polvergrigia', 'Cenerfossa', 'Mortebassa', 'Rocca Muta', 'Fondoscuro',
  'Ossalba', 'Ferrofreddo', 'Bramavia', 'Pievescordata', 'Cinabria',
  'Tenebroso', 'Ferroruggine', 'Ultimocampo', 'Sanguegiallo', 'Sepolcra',
  'Strangiovine', 'Fossalaica', 'Muralastra', 'Campovuoto', 'Terramenta',
  'Sottovento', 'Velarosa', 'Duecolline', 'Crepalta', 'Piombella',
  'Nebbiaviva', 'Cerognate', 'Ferratora', 'Amaralba', 'Ossiduro',
  'Stradacorta', 'Valgravida', 'Rivasinistra', 'Pioggiasecca', 'Nerapietra'
]

const CITY_SUFFIXES = ['— Quarantena', '— Zona 3', '— Settore C', '— Focolaio 7', '']

const AREA_NAME_VARIANTS: Partial<Record<AreaId, string[]>> = {
  piazza:       ['Piazza del Mercato', 'Piazza dei Martiri', 'Piazza Grande'],
  giardino:     ['Parco dei Caduti', 'Orto Abbandonato', 'Giardino delle Statue'],
  supermercato: ['Alimentari Lucia', 'Discount Stella', 'Centro Spesa'],
  ospedale:     ['Clinica San Giuda', 'Ambulatorio Nord', 'Pronto Soccorso'],
  chiesa:       ['Chiesa di Santa Morte', 'Duomo Vecchio', 'Cappella del Sangue'],
  polizia:      ['Caserma Alfa', 'Posto di Blocco', 'Comando Locale'],
  scuola:       ['Liceo Dante', 'Elementari Manzoni', 'Istituto Tecnico'],
  rifugio:      ['Bunker 47', 'Rifugio Militare', 'Sotterraneo'],
  benzinaio:    ['Esso Abbandonato', 'Stazione Q8', 'Pompa Rossa'],
  case:         ['Quartiere Est', 'Vicolo dei Gatti', 'Condominio Alto'],
  fogne:        ['Galleria Pluviale', 'Collettore Sud', 'Condotto Nero'],
  porto:        ['Darsena', 'Molo Vecchio', 'Scali Est'],
  radio:        ['Stazione Radio 104', 'Antenna Mastodonte', 'Ripetitore'],
  ponte:        ['Ponte della Morte', 'Viadotto Crollato', 'Passerella']
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)]
}

function pickStatus(rng: () => number): AreaStatus {
  const r = rng()
  if (r < 0.40) return 'intact'
  if (r < 0.75) return 'infested'
  if (r < 0.95) return 'ruined'
  return 'closed'
}

export function deriveCityState(seed: string): CityState {
  const baseSeed = seedFromString(seed)
  const rng = mulberry32(baseSeed)

  const name = pick(rng, CITY_NAMES)
  const suffix = pick(rng, CITY_SUFFIXES)
  const cityName = suffix ? `${name} ${suffix}` : name

  const areas = {} as Record<AreaId, AreaInitialState>
  for (const area of AREAS) {
    const status: AreaStatus = area.id === 'piazza' ? 'intact' : pickStatus(rng)
    const variants = AREA_NAME_VARIANTS[area.id]
    const customName = variants && rng() < 0.30 ? pick(rng, variants) : null
    areas[area.id] = { status, customName }
  }

  return { cityName, areas }
}
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/unit/seed/derive-city.test.ts
```
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add shared/seed/derive-city.ts tests/unit/seed/derive-city.test.ts
git commit -m "feat: deriva stato iniziale città e aree dal seed"
```

---

## Task 8 — `shared/map/weather.ts` (computeWeather dinamico)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/shared/map/weather.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/map/weather.test.ts`

- [ ] **Step 1: Scrivere il test**

Create `tests/unit/map/weather.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeWeather, WEATHER_CODES } from '~~/shared/map/weather'

const SEED = 'test-seed-uuid'

// 2026-04-15 12:00 UTC, giorno
const DAY = new Date('2026-04-15T12:00:00Z').getTime()
// 2026-04-15 23:00 UTC, notte
const NIGHT = new Date('2026-04-15T23:00:00Z').getTime()

describe('computeWeather', () => {
  it('è deterministica (stesso seed+area+tempo → stesso risultato)', () => {
    const a = computeWeather(SEED, 'piazza', DAY)
    const b = computeWeather(SEED, 'piazza', DAY)
    expect(a).toEqual(b)
  })

  it('produce code valido e intensity in [0,1]', () => {
    for (const areaId of ['piazza', 'fogne', 'radio', 'porto'] as const) {
      const w = computeWeather(SEED, areaId, DAY)
      expect(WEATHER_CODES).toContain(w.code)
      expect(w.intensity).toBeGreaterThanOrEqual(0)
      expect(w.intensity).toBeLessThanOrEqual(1)
      expect(w.label.length).toBeGreaterThan(0)
    }
  })

  it('di notte tende a night/fog più che di giorno', () => {
    let nightOrFogNight = 0
    let nightOrFogDay = 0
    for (let i = 0; i < 200; i++) {
      const seed = `s-${i}`
      if (['night', 'fog'].includes(computeWeather(seed, 'piazza', NIGHT).code)) nightOrFogNight++
      if (['night', 'fog'].includes(computeWeather(seed, 'piazza', DAY).code)) nightOrFogDay++
    }
    expect(nightOrFogNight).toBeGreaterThan(nightOrFogDay)
  })

  it('aree diverse producono risultati diversi (almeno in media)', () => {
    let diffs = 0
    for (let i = 0; i < 50; i++) {
      const a = computeWeather(`s-${i}`, 'fogne', DAY)
      const b = computeWeather(`s-${i}`, 'radio', DAY)
      if (a.code !== b.code) diffs++
    }
    expect(diffs).toBeGreaterThan(5)
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/unit/map/weather.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `shared/map/weather.ts`:

```ts
import type { AreaId } from '~~/shared/map/areas'
import { mulberry32, seedFromString } from '~~/shared/seed/prng'

export const WEATHER_CODES = [
  'clear', 'overcast', 'fog', 'rain', 'ashfall', 'redSky', 'storm', 'night'
] as const

export type WeatherCode = typeof WEATHER_CODES[number]

export interface WeatherState {
  code: WeatherCode
  intensity: number
  label: string
}

const LABELS: Record<WeatherCode, string> = {
  clear:   'Cielo limpido',
  overcast:'Cielo coperto',
  fog:     'Nebbia persistente',
  rain:    'Pioggia sottile',
  ashfall: 'Pioggia di cenere',
  redSky:  'Cielo rosso',
  storm:   'Tempesta',
  night:   'Notte fonda'
}

type Season = 'winter' | 'spring' | 'summer' | 'autumn'
type DayPart = 'day' | 'dusk' | 'night'

function seasonOf(date: Date): Season {
  const m = date.getUTCMonth()
  if (m === 11 || m <= 1) return 'winter'
  if (m <= 4) return 'spring'
  if (m <= 7) return 'summer'
  return 'autumn'
}

function dayPartOf(date: Date): DayPart {
  const h = date.getUTCHours()
  if (h >= 6 && h < 18) return 'day'
  if (h >= 18 && h < 22) return 'dusk'
  return 'night'
}

// Peso base per combinazione stagione+dayPart. Valori più alti = più probabile.
const BASE_WEIGHTS: Record<Season, Record<DayPart, Record<WeatherCode, number>>> = {
  winter: {
    day:   { clear: 2, overcast: 4, fog: 4, rain: 1, ashfall: 0, redSky: 0, storm: 0, night: 0 },
    dusk:  { clear: 1, overcast: 3, fog: 5, rain: 1, ashfall: 0, redSky: 1, storm: 0, night: 2 },
    night: { clear: 0, overcast: 2, fog: 5, rain: 0, ashfall: 0, redSky: 0, storm: 0, night: 6 }
  },
  spring: {
    day:   { clear: 5, overcast: 3, fog: 1, rain: 2, ashfall: 0, redSky: 0, storm: 1, night: 0 },
    dusk:  { clear: 3, overcast: 3, fog: 2, rain: 2, ashfall: 0, redSky: 2, storm: 1, night: 1 },
    night: { clear: 1, overcast: 2, fog: 2, rain: 1, ashfall: 0, redSky: 0, storm: 1, night: 5 }
  },
  summer: {
    day:   { clear: 4, overcast: 2, fog: 0, rain: 1, ashfall: 2, redSky: 3, storm: 2, night: 0 },
    dusk:  { clear: 2, overcast: 2, fog: 0, rain: 1, ashfall: 2, redSky: 4, storm: 2, night: 1 },
    night: { clear: 1, overcast: 1, fog: 1, rain: 1, ashfall: 1, redSky: 1, storm: 1, night: 5 }
  },
  autumn: {
    day:   { clear: 2, overcast: 4, fog: 3, rain: 4, ashfall: 1, redSky: 0, storm: 1, night: 0 },
    dusk:  { clear: 1, overcast: 3, fog: 4, rain: 3, ashfall: 1, redSky: 1, storm: 1, night: 1 },
    night: { clear: 0, overcast: 2, fog: 4, rain: 2, ashfall: 0, redSky: 0, storm: 0, night: 6 }
  }
}

// Bias moltiplicativi per area.
const AREA_BIAS: Partial<Record<AreaId, Partial<Record<WeatherCode, number>>>> = {
  fogne:   { fog: 2.0, overcast: 1.3, clear: 0.5 },
  radio:   { clear: 1.5, storm: 1.4, fog: 0.7 },
  porto:   { fog: 1.6, rain: 1.3, storm: 1.2 },
  ospedale:{ overcast: 1.3 },
  chiesa:  { fog: 1.3, redSky: 1.2 },
  rifugio: { night: 1.5, fog: 1.2, clear: 0.5 },
  ponte:   { storm: 1.3 }
}

function weightedPick(rng: () => number, weights: Record<string, number>): string {
  const entries = Object.entries(weights).filter(([, w]) => w > 0)
  const total = entries.reduce((acc, [, w]) => acc + w, 0)
  let r = rng() * total
  for (const [k, w] of entries) {
    if ((r -= w) <= 0) return k
  }
  return entries[entries.length - 1][0]
}

export function computeWeather(seed: string, areaId: AreaId, serverTimeMs: number): WeatherState {
  const date = new Date(serverTimeMs)
  const season = seasonOf(date)
  const part = dayPartOf(date)

  // Slot temporale: cambia ogni 2 ore perché il meteo non "balli" al minuto.
  const slot = Math.floor(date.getTime() / (1000 * 60 * 60 * 2))

  const rng = mulberry32(
    seedFromString(`${seed}|${areaId}|${slot}`)
  )

  const base = { ...BASE_WEIGHTS[season][part] } as Record<string, number>
  const bias = AREA_BIAS[areaId]
  if (bias) {
    for (const [k, mul] of Object.entries(bias)) {
      base[k] = (base[k] ?? 0) * (mul as number)
    }
  }

  const code = weightedPick(rng, base) as WeatherCode
  const intensity = 0.3 + rng() * 0.7
  return { code, intensity: Math.round(intensity * 100) / 100, label: LABELS[code] }
}
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/unit/map/weather.test.ts
```
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add shared/map/weather.ts tests/unit/map/weather.test.ts
git commit -m "feat: aggiungi computazione meteo dinamica seed-based"
```

---

## Task 9 — `shared/dice` (parse + roll)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/shared/dice/parse.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/shared/dice/roll.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/dice/parse.test.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/dice/roll.test.ts`

- [ ] **Step 1: Test parser**

Create `tests/unit/dice/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseRoll } from '~~/shared/dice/parse'

describe('parseRoll', () => {
  it('accetta NdM', () => {
    expect(parseRoll('2d6')).toEqual({
      ok: true,
      expr: { terms: [{ count: 2, sides: 6 }], modifier: 0 }
    })
  })

  it('accetta NdM+K', () => {
    expect(parseRoll('1d20+3')).toEqual({
      ok: true,
      expr: { terms: [{ count: 1, sides: 20 }], modifier: 3 }
    })
  })

  it('accetta NdM-K', () => {
    expect(parseRoll('1d20-5')).toEqual({
      ok: true,
      expr: { terms: [{ count: 1, sides: 20 }], modifier: -5 }
    })
  })

  it('accetta NdM+NdM', () => {
    expect(parseRoll('2d6+1d8')).toEqual({
      ok: true,
      expr: { terms: [{ count: 2, sides: 6 }, { count: 1, sides: 8 }], modifier: 0 }
    })
  })

  it('ignora spazi', () => {
    expect(parseRoll(' 2d6 + 3 ')).toMatchObject({ ok: true })
  })

  it('rifiuta stringhe malformate', () => {
    expect(parseRoll('')).toMatchObject({ ok: false })
    expect(parseRoll('d6')).toMatchObject({ ok: false })
    expect(parseRoll('2d')).toMatchObject({ ok: false })
    expect(parseRoll('2x6')).toMatchObject({ ok: false })
    expect(parseRoll('2d6+')).toMatchObject({ ok: false })
  })

  it('rifiuta numeri fuori range', () => {
    expect(parseRoll('0d6')).toMatchObject({ ok: false })
    expect(parseRoll('101d6')).toMatchObject({ ok: false })
    expect(parseRoll('2d1')).toMatchObject({ ok: false })
    expect(parseRoll('2d1001')).toMatchObject({ ok: false })
  })
})
```

- [ ] **Step 2: Test roller**

Create `tests/unit/dice/roll.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rollDice } from '~~/shared/dice/roll'
import { parseRoll } from '~~/shared/dice/parse'
import { mulberry32 } from '~~/shared/seed/prng'

function mustParse(expr: string) {
  const r = parseRoll(expr)
  if (!r.ok) throw new Error('parse failed')
  return r.expr
}

describe('rollDice', () => {
  it('rispetta i range per singolo dado', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 200; i++) {
      const r = rollDice(mustParse('1d6'), rng)
      expect(r.total).toBeGreaterThanOrEqual(1)
      expect(r.total).toBeLessThanOrEqual(6)
      expect(r.rolls).toHaveLength(1)
    }
  })

  it('applica il modifier', () => {
    const rng = mulberry32(2)
    const r = rollDice(mustParse('1d6+10'), rng)
    expect(r.total).toBe(r.rolls[0].values[0] + 10)
    expect(r.modifier).toBe(10)
  })

  it('somma più termini', () => {
    const rng = mulberry32(3)
    const r = rollDice(mustParse('2d6+1d8'), rng)
    const sum = r.rolls.flatMap(x => x.values).reduce((a, b) => a + b, 0)
    expect(r.total).toBe(sum)
  })

  it('è deterministico con stessa RNG', () => {
    const a = rollDice(mustParse('3d6+2'), mulberry32(99))
    const b = rollDice(mustParse('3d6+2'), mulberry32(99))
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 3: Eseguire — devono fallire**

Run:
```bash
pnpm test tests/unit/dice
```
Expected: FAIL — moduli non trovati.

- [ ] **Step 4: Implementare parser**

Create `shared/dice/parse.ts`:

```ts
export interface DiceTerm {
  count: number
  sides: number
}

export interface DiceExpr {
  terms: DiceTerm[]
  modifier: number
}

export type ParseResult =
  | { ok: true, expr: DiceExpr }
  | { ok: false, error: string }

const TERM_RE = /^(\d+)d(\d+)$/

export function parseRoll(input: string): ParseResult {
  const raw = input.replace(/\s+/g, '')
  if (raw.length === 0) return { ok: false, error: 'empty' }

  const tokens = raw.split(/(?=[+-])/)
  const terms: DiceTerm[] = []
  let modifier = 0

  for (const token of tokens) {
    if (token === '') return { ok: false, error: 'malformed' }
    const sign = token.startsWith('-') ? -1 : 1
    const body = token.replace(/^[+-]/, '')
    if (body === '') return { ok: false, error: 'malformed' }

    const mDice = TERM_RE.exec(body)
    if (mDice) {
      const count = parseInt(mDice[1]!, 10)
      const sides = parseInt(mDice[2]!, 10)
      if (count < 1 || count > 100) return { ok: false, error: 'count_out_of_range' }
      if (sides < 2 || sides > 1000) return { ok: false, error: 'sides_out_of_range' }
      if (sign === -1) return { ok: false, error: 'negative_dice_unsupported' }
      terms.push({ count, sides })
      continue
    }

    if (/^\d+$/.test(body)) {
      modifier += sign * parseInt(body, 10)
      continue
    }

    return { ok: false, error: 'malformed' }
  }

  if (terms.length === 0) return { ok: false, error: 'no_dice' }
  return { ok: true, expr: { terms, modifier } }
}
```

- [ ] **Step 5: Implementare roller**

Create `shared/dice/roll.ts`:

```ts
import type { DiceExpr } from '~~/shared/dice/parse'

export interface TermRollResult {
  count: number
  sides: number
  values: number[]
}

export interface RollResult {
  rolls: TermRollResult[]
  modifier: number
  total: number
}

export function rollDice(expr: DiceExpr, rng: () => number): RollResult {
  const rolls: TermRollResult[] = []
  let total = expr.modifier
  for (const t of expr.terms) {
    const values: number[] = []
    for (let i = 0; i < t.count; i++) {
      const v = Math.floor(rng() * t.sides) + 1
      values.push(v)
      total += v
    }
    rolls.push({ count: t.count, sides: t.sides, values })
  }
  return { rolls, modifier: expr.modifier, total }
}
```

- [ ] **Step 6: Eseguire — devono passare**

Run:
```bash
pnpm test tests/unit/dice
```
Expected: `11 passed`.

- [ ] **Step 7: Commit**

```bash
git add shared/dice tests/unit/dice
git commit -m "feat: aggiungi parser e roller per tiri di dado"
```

---

## Task 10 — `shared/slash/parse.ts` (parser comandi chat)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/shared/slash/parse.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/slash/parse.test.ts`

- [ ] **Step 1: Scrivere il test**

Create `tests/unit/slash/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseSlash } from '~~/shared/slash/parse'

describe('parseSlash', () => {
  it('senza slash iniziale torna say', () => {
    expect(parseSlash('ciao a tutti')).toEqual({
      ok: true, command: { kind: 'say', body: 'ciao a tutti' }
    })
  })

  it('/w target body → whisper', () => {
    expect(parseSlash('/w Anna ciao')).toEqual({
      ok: true, command: { kind: 'whisper', target: 'Anna', body: 'ciao' }
    })
  })

  it('/me body → emote', () => {
    expect(parseSlash('/me apre la porta')).toEqual({
      ok: true, command: { kind: 'emote', body: 'apre la porta' }
    })
  })

  it('/ooc body → ooc', () => {
    expect(parseSlash('/ooc chi è di turno?')).toEqual({
      ok: true, command: { kind: 'ooc', body: 'chi è di turno?' }
    })
  })

  it('/shout body → shout', () => {
    expect(parseSlash('/shout aiuto!')).toEqual({
      ok: true, command: { kind: 'shout', body: 'aiuto!' }
    })
  })

  it('/roll expr → roll', () => {
    expect(parseSlash('/roll 2d6+3')).toEqual({
      ok: true, command: { kind: 'roll', expr: '2d6+3', hidden: false }
    })
  })

  it('/roll! expr → hidden roll master', () => {
    expect(parseSlash('/roll! 1d20')).toEqual({
      ok: true, command: { kind: 'roll', expr: '1d20', hidden: true }
    })
  })

  it('/dm target body', () => {
    expect(parseSlash('/dm Luca arrivo presto')).toEqual({
      ok: true, command: { kind: 'dm', target: 'Luca', body: 'arrivo presto' }
    })
  })

  it('/npc Nome body (master)', () => {
    expect(parseSlash('/npc "Sceriffo Cole" avvicinatevi')).toEqual({
      ok: true, command: { kind: 'npc', npcName: 'Sceriffo Cole', body: 'avvicinatevi' }
    })
  })

  it('/npc senza virgolette accetta una parola singola', () => {
    expect(parseSlash('/npc Cole avvicinatevi')).toEqual({
      ok: true, command: { kind: 'npc', npcName: 'Cole', body: 'avvicinatevi' }
    })
  })

  it('/announce body', () => {
    expect(parseSlash('/announce trivella in arrivo')).toEqual({
      ok: true, command: { kind: 'announce', body: 'trivella in arrivo' }
    })
  })

  it('/mute nick 30 → mute con minuti', () => {
    expect(parseSlash('/mute Anna 30')).toEqual({
      ok: true, command: { kind: 'mute', target: 'Anna', minutes: 30 }
    })
  })

  it('/mute nick → permanente', () => {
    expect(parseSlash('/mute Anna')).toEqual({
      ok: true, command: { kind: 'mute', target: 'Anna', minutes: null }
    })
  })

  it('/unmute nick', () => {
    expect(parseSlash('/unmute Anna')).toEqual({
      ok: true, command: { kind: 'unmute', target: 'Anna' }
    })
  })

  it('/kick nick motivo', () => {
    expect(parseSlash('/kick Luca spam')).toEqual({
      ok: true, command: { kind: 'kick', target: 'Luca', reason: 'spam' }
    })
  })

  it('/ban nick motivo', () => {
    expect(parseSlash('/ban Luca flame')).toEqual({
      ok: true, command: { kind: 'ban', target: 'Luca', reason: 'flame' }
    })
  })

  it('/unban nick', () => {
    expect(parseSlash('/unban Luca')).toEqual({
      ok: true, command: { kind: 'unban', target: 'Luca' }
    })
  })

  it('/move nick area', () => {
    expect(parseSlash('/move Anna fogne')).toEqual({
      ok: true, command: { kind: 'move', target: 'Anna', areaId: 'fogne' }
    })
  })

  it('/close area', () => {
    expect(parseSlash('/close ospedale')).toEqual({
      ok: true, command: { kind: 'close', areaId: 'ospedale' }
    })
  })

  it('/open area', () => {
    expect(parseSlash('/open ospedale')).toEqual({
      ok: true, command: { kind: 'open', areaId: 'ospedale' }
    })
  })

  it('/weather area code intensity', () => {
    expect(parseSlash('/weather fogne fog 0.8')).toEqual({
      ok: true, command: { kind: 'weather', areaId: 'fogne', code: 'fog', intensity: 0.8 }
    })
  })

  it('/weather * code — globale', () => {
    expect(parseSlash('/weather * storm')).toEqual({
      ok: true, command: { kind: 'weather', areaId: null, code: 'storm', intensity: null }
    })
  })

  it('/weather area off → clear', () => {
    expect(parseSlash('/weather fogne off')).toEqual({
      ok: true, command: { kind: 'weather', areaId: 'fogne', clear: true }
    })
  })

  it('/setname area "nome"', () => {
    expect(parseSlash('/setname chiesa "Duomo Vecchio"')).toEqual({
      ok: true, command: { kind: 'setname', areaId: 'chiesa', newName: 'Duomo Vecchio' }
    })
  })

  it('/status area ruined', () => {
    expect(parseSlash('/status benzinaio ruined')).toEqual({
      ok: true, command: { kind: 'status', areaId: 'benzinaio', status: 'ruined' }
    })
  })

  it('comando sconosciuto → errore', () => {
    expect(parseSlash('/pippo ciao')).toMatchObject({ ok: false, error: expect.any(String) })
  })

  it('comando incompleto → errore', () => {
    expect(parseSlash('/w')).toMatchObject({ ok: false })
    expect(parseSlash('/roll')).toMatchObject({ ok: false })
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/unit/slash
```
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `shared/slash/parse.ts`:

```ts
export type SlashCommand =
  | { kind: 'say', body: string }
  | { kind: 'whisper', target: string, body: string }
  | { kind: 'emote', body: string }
  | { kind: 'ooc', body: string }
  | { kind: 'shout', body: string }
  | { kind: 'roll', expr: string, hidden: boolean }
  | { kind: 'dm', target: string, body: string }
  | { kind: 'npc', npcName: string, body: string }
  | { kind: 'announce', body: string }
  | { kind: 'mute', target: string, minutes: number | null }
  | { kind: 'unmute', target: string }
  | { kind: 'kick', target: string, reason: string | null }
  | { kind: 'ban', target: string, reason: string | null }
  | { kind: 'unban', target: string }
  | { kind: 'move', target: string, areaId: string }
  | { kind: 'close', areaId: string }
  | { kind: 'open', areaId: string }
  | { kind: 'weather', areaId: string | null, code: string, intensity: number | null }
  | { kind: 'weather', areaId: string | null, clear: true }
  | { kind: 'setname', areaId: string, newName: string }
  | { kind: 'status', areaId: string, status: string }

export type ParseResult =
  | { ok: true, command: SlashCommand }
  | { ok: false, error: string }

function err(error: string): ParseResult {
  return { ok: false, error }
}

// Parse token con virgolette: `"foo bar"` → `foo bar`, `foo` → `foo`.
function nextToken(input: string, from: number): { token: string, next: number } | null {
  let i = from
  while (i < input.length && input[i] === ' ') i++
  if (i >= input.length) return null

  if (input[i] === '"') {
    const end = input.indexOf('"', i + 1)
    if (end === -1) return null
    return { token: input.slice(i + 1, end), next: end + 1 }
  }

  let j = i
  while (j < input.length && input[j] !== ' ') j++
  return { token: input.slice(i, j), next: j }
}

function rest(input: string, from: number): string {
  return input.slice(from).trim()
}

export function parseSlash(input: string): ParseResult {
  const trimmed = input.trimStart()
  if (!trimmed.startsWith('/')) {
    return { ok: true, command: { kind: 'say', body: input.trim() } }
  }

  const spaceIdx = trimmed.indexOf(' ')
  const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase()
  const after = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1)

  switch (cmd) {
    case '/w':
    case '/whisper': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      const body = rest(after, first.next)
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'whisper', target: first.token, body } }
    }
    case '/me': {
      const body = after.trim()
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'emote', body } }
    }
    case '/ooc': {
      const body = after.trim()
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'ooc', body } }
    }
    case '/shout': {
      const body = after.trim()
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'shout', body } }
    }
    case '/roll': {
      const expr = after.trim()
      if (!expr) return err('missing_expr')
      return { ok: true, command: { kind: 'roll', expr, hidden: false } }
    }
    case '/roll!': {
      const expr = after.trim()
      if (!expr) return err('missing_expr')
      return { ok: true, command: { kind: 'roll', expr, hidden: true } }
    }
    case '/dm': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      const body = rest(after, first.next)
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'dm', target: first.token, body } }
    }
    case '/npc': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_npc')
      const body = rest(after, first.next)
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'npc', npcName: first.token, body } }
    }
    case '/announce': {
      const body = after.trim()
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'announce', body } }
    }
    case '/mute': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      const tail = rest(after, first.next)
      const minutes = tail ? parseInt(tail, 10) : NaN
      const m = Number.isFinite(minutes) ? minutes : null
      return { ok: true, command: { kind: 'mute', target: first.token, minutes: m } }
    }
    case '/unmute': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      return { ok: true, command: { kind: 'unmute', target: first.token } }
    }
    case '/kick':
    case '/ban': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      const reason = rest(after, first.next) || null
      const kind = cmd === '/kick' ? 'kick' : 'ban'
      return { ok: true, command: { kind, target: first.token, reason } }
    }
    case '/unban': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      return { ok: true, command: { kind: 'unban', target: first.token } }
    }
    case '/move': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      const second = nextToken(after, first.next)
      if (!second) return err('missing_area')
      return { ok: true, command: { kind: 'move', target: first.token, areaId: second.token } }
    }
    case '/close':
    case '/open': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_area')
      const kind = cmd === '/close' ? 'close' : 'open'
      return { ok: true, command: { kind, areaId: first.token } }
    }
    case '/weather': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_area')
      const second = nextToken(after, first.next)
      if (!second) return err('missing_code')
      const areaId = first.token === '*' ? null : first.token
      if (second.token.toLowerCase() === 'off') {
        return { ok: true, command: { kind: 'weather', areaId, clear: true } }
      }
      const third = nextToken(after, second.next)
      const intensity = third ? parseFloat(third.token) : NaN
      const intVal = Number.isFinite(intensity) ? intensity : null
      return { ok: true, command: { kind: 'weather', areaId, code: second.token, intensity: intVal } }
    }
    case '/setname': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_area')
      const second = nextToken(after, first.next)
      if (!second) return err('missing_name')
      return { ok: true, command: { kind: 'setname', areaId: first.token, newName: second.token } }
    }
    case '/status': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_area')
      const second = nextToken(after, first.next)
      if (!second) return err('missing_status')
      return { ok: true, command: { kind: 'status', areaId: first.token, status: second.token } }
    }
    default:
      return err('unknown_command')
  }
}
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/unit/slash
```
Expected: `26 passed`.

- [ ] **Step 5: Commit**

```bash
git add shared/slash tests/unit/slash
git commit -m "feat: aggiungi parser dei comandi slash chat"
```

---

## Task 11 — `shared/protocol/http.ts` (schemi Zod HTTP)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/shared/protocol/http.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/protocol/http.test.ts`

- [ ] **Step 1: Test**

Create `tests/unit/protocol/http.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  CreatePartyBody, JoinPartyBody, ReclaimMasterBody, ResumeBody
} from '~~/shared/protocol/http'

describe('CreatePartyBody', () => {
  it('accetta nickname valido', () => {
    expect(CreatePartyBody.safeParse({ masterNickname: 'Nick' }).success).toBe(true)
  })
  it('rifiuta nickname troppo corto', () => {
    expect(CreatePartyBody.safeParse({ masterNickname: 'a' }).success).toBe(false)
  })
  it('rifiuta nickname troppo lungo', () => {
    expect(CreatePartyBody.safeParse({ masterNickname: 'x'.repeat(25) }).success).toBe(false)
  })
  it('rifiuta caratteri non permessi', () => {
    expect(CreatePartyBody.safeParse({ masterNickname: 'Nick!' }).success).toBe(false)
  })
})

describe('JoinPartyBody', () => {
  it('accetta nickname valido', () => {
    expect(JoinPartyBody.safeParse({ nickname: 'Anna' }).success).toBe(true)
  })
})

describe('ReclaimMasterBody', () => {
  it('accetta token non vuoto', () => {
    expect(ReclaimMasterBody.safeParse({ masterToken: 'abcd1234' }).success).toBe(true)
  })
  it('rifiuta token vuoto', () => {
    expect(ReclaimMasterBody.safeParse({ masterToken: '' }).success).toBe(false)
  })
})

describe('ResumeBody', () => {
  it('accetta token', () => {
    expect(ResumeBody.safeParse({ sessionToken: 'xyz' }).success).toBe(true)
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/unit/protocol/http.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `shared/protocol/http.ts`:

```ts
import { z } from 'zod'

export const NICKNAME_REGEX = /^[a-zA-Z0-9 _-]+$/

const Nickname = z.string().min(2).max(24).regex(NICKNAME_REGEX).trim()

export const CreatePartyBody = z.object({
  masterNickname: Nickname
})
export type CreatePartyBody = z.infer<typeof CreatePartyBody>

export const JoinPartyBody = z.object({
  nickname: Nickname
})
export type JoinPartyBody = z.infer<typeof JoinPartyBody>

export const ReclaimMasterBody = z.object({
  masterToken: z.string().min(1).max(256)
})
export type ReclaimMasterBody = z.infer<typeof ReclaimMasterBody>

export const ResumeBody = z.object({
  sessionToken: z.string().min(1).max(256)
})
export type ResumeBody = z.infer<typeof ResumeBody>
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/unit/protocol/http.test.ts
```
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add shared/protocol/http.ts tests/unit/protocol/http.test.ts
git commit -m "feat: aggiungi schemi zod per endpoint http"
```

---

## Task 12 — `shared/protocol/ws.ts` (schemi Zod WebSocket, scheletro)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/shared/protocol/ws.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/protocol/ws.test.ts`

Nota: in questo plan abbiamo bisogno solo di alcuni eventi (`hello` e forme di base). Il resto sarà esteso nei plan successivi. Definiamo comunque l'enum dei kind messaggi e l'evento `hello` per completezza e per evitare drift.

- [ ] **Step 1: Test**

Create `tests/unit/protocol/ws.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { HelloEvent, MESSAGE_KINDS, ServerErrorEvent } from '~~/shared/protocol/ws'

describe('HelloEvent', () => {
  it('accetta seed uuid e sessionToken', () => {
    const ok = HelloEvent.safeParse({
      type: 'hello',
      seed: '550e8400-e29b-41d4-a716-446655440000',
      sessionToken: 'abc'
    })
    expect(ok.success).toBe(true)
  })

  it('rifiuta seed non-uuid', () => {
    expect(HelloEvent.safeParse({
      type: 'hello',
      seed: 'not-a-uuid',
      sessionToken: 'abc'
    }).success).toBe(false)
  })
})

describe('MESSAGE_KINDS', () => {
  it('contiene tutti i 10 kind', () => {
    const expected = ['say','whisper','emote','ooc','roll','shout','dm','npc','announce','system']
    for (const k of expected) expect(MESSAGE_KINDS).toContain(k)
  })
})

describe('ServerErrorEvent', () => {
  it('accetta code e detail', () => {
    expect(ServerErrorEvent.safeParse({
      type: 'error', code: 'not_found', detail: 'party X'
    }).success).toBe(true)
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/unit/protocol/ws.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `shared/protocol/ws.ts`:

```ts
import { z } from 'zod'
import { ERROR_CODES } from '~~/shared/errors'

export const MESSAGE_KINDS = [
  'say', 'whisper', 'emote', 'ooc', 'roll', 'shout', 'dm', 'npc', 'announce', 'system'
] as const
export type MessageKind = typeof MESSAGE_KINDS[number]

const UuidSeed = z.string().uuid()

export const HelloEvent = z.object({
  type: z.literal('hello'),
  seed: UuidSeed,
  sessionToken: z.string().min(1).max(256)
})
export type HelloEvent = z.infer<typeof HelloEvent>

export const ServerErrorEvent = z.object({
  type: z.literal('error'),
  code: z.enum(ERROR_CODES as unknown as [string, ...string[]]),
  detail: z.string().optional()
})
export type ServerErrorEvent = z.infer<typeof ServerErrorEvent>
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/unit/protocol/ws.test.ts
```
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add shared/protocol/ws.ts tests/unit/protocol/ws.test.ts
git commit -m "feat: scheletro schemi zod eventi websocket"
```

---

## Task 13 — Schema Drizzle + drizzle config + prima migration

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/drizzle.config.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/server/db/schema.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/server/db/migrations/0000_initial.sql` (generato)

- [ ] **Step 1: Drizzle config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './data/gdr.sqlite'
  }
})
```

- [ ] **Step 2: Schema TS**

Create `server/db/schema.ts`:

```ts
import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const parties = sqliteTable('parties', {
  seed:            text('seed').primaryKey(),
  masterTokenHash: text('master_token_hash').notNull(),
  cityName:        text('city_name').notNull(),
  createdAt:       integer('created_at').notNull(),
  lastActivityAt:  integer('last_activity_at').notNull()
})

export const players = sqliteTable('players', {
  id:             text('id').primaryKey(),
  partySeed:      text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  nickname:       text('nickname').notNull(),
  role:           text('role', { enum: ['user', 'master'] }).notNull(),
  currentAreaId:  text('current_area_id').notNull(),
  isMuted:        integer('is_muted', { mode: 'boolean' }).notNull().default(false),
  mutedUntil:     integer('muted_until'),
  isKicked:       integer('is_kicked', { mode: 'boolean' }).notNull().default(false),
  joinedAt:       integer('joined_at').notNull(),
  lastSeenAt:     integer('last_seen_at').notNull(),
  sessionToken:   text('session_token').notNull()
}, (t) => ({
  uniqNickname: uniqueIndex('players_party_nickname_unique').on(t.partySeed, t.nickname),
  bySession:    index('players_session_idx').on(t.sessionToken)
}))

export const areasState = sqliteTable('areas_state', {
  partySeed:   text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  areaId:      text('area_id').notNull(),
  status:      text('status', { enum: ['intact', 'infested', 'ruined', 'closed'] }).notNull(),
  customName:  text('custom_name'),
  notes:       text('notes')
}, (t) => ({
  pk: primaryKey({ columns: [t.partySeed, t.areaId] })
}))

export const messages = sqliteTable('messages', {
  id:             text('id').primaryKey(),
  partySeed:      text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  kind:           text('kind').notNull(),
  authorPlayerId: text('author_player_id'),
  authorDisplay:  text('author_display').notNull(),
  areaId:         text('area_id'),
  targetPlayerId: text('target_player_id'),
  body:           text('body').notNull(),
  rollPayload:    text('roll_payload'),
  createdAt:      integer('created_at').notNull(),
  deletedAt:      integer('deleted_at'),
  deletedBy:      text('deleted_by'),
  editedAt:       integer('edited_at')
}, (t) => ({
  byAreaTime:   index('messages_area_time_idx').on(t.partySeed, t.areaId, t.createdAt),
  byTargetTime: index('messages_target_time_idx').on(t.partySeed, t.targetPlayerId, t.createdAt)
}))

export const areaAccessBans = sqliteTable('area_access_bans', {
  partySeed: text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  areaId:    text('area_id').notNull(),
  reason:    text('reason')
}, (t) => ({
  pk: primaryKey({ columns: [t.partySeed, t.areaId] })
}))

export const weatherOverrides = sqliteTable('weather_overrides', {
  partySeed:  text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  areaId:     text('area_id'),
  code:       text('code').notNull(),
  intensity:  real('intensity').notNull(),
  setAt:      integer('set_at').notNull(),
  expiresAt:  integer('expires_at')
}, (t) => ({
  pk: primaryKey({ columns: [t.partySeed, t.areaId] })
}))

export const masterActions = sqliteTable('master_actions', {
  id:         text('id').primaryKey(),
  partySeed:  text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  masterId:   text('master_id').notNull(),
  action:     text('action').notNull(),
  target:     text('target'),
  payload:    text('payload'),
  createdAt:  integer('created_at').notNull()
}, (t) => ({
  byTime: index('master_actions_time_idx').on(t.partySeed, t.createdAt)
}))

export const bans = sqliteTable('bans', {
  partySeed:     text('party_seed').notNull().references(() => parties.seed, { onDelete: 'cascade' }),
  nicknameLower: text('nickname_lower').notNull(),
  reason:        text('reason'),
  bannedAt:      integer('banned_at').notNull()
}, (t) => ({
  pk: primaryKey({ columns: [t.partySeed, t.nicknameLower] })
}))
```

- [ ] **Step 3: Generare la prima migration**

Run:
```bash
pnpm db:generate
```
Expected: crea `server/db/migrations/0000_xxx.sql` e `meta/_journal.json`.

- [ ] **Step 4: Verificare typecheck**

Run:
```bash
pnpm typecheck
```
Expected: 0 errori.

- [ ] **Step 5: Commit**

```bash
git add drizzle.config.ts server/db/schema.ts server/db/migrations
git commit -m "feat: schema drizzle sqlite e prima migration"
```

---

## Task 14 — DB client + test round-trip

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/db/client.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/integration/db-roundtrip.test.ts`

- [ ] **Step 1: Test**

Create `tests/integration/db-roundtrip.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { parties } from '~~/server/db/schema'

describe('DB round-trip', () => {
  let db: Db

  beforeEach(() => {
    db = createTestDb()
  })

  it('inserisce e legge una party', () => {
    const now = Date.now()
    db.insert(parties).values({
      seed: '11111111-1111-1111-1111-111111111111',
      masterTokenHash: 'hash',
      cityName: 'Valmorta',
      createdAt: now,
      lastActivityAt: now
    }).run()

    const rows = db.select().from(parties).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.cityName).toBe('Valmorta')
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/integration/db-roundtrip.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementare il client**

Create `server/db/client.ts`:

```ts
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as schema from '~~/server/db/schema'

export type Db = BetterSQLite3Database<typeof schema>

let cached: Db | null = null

export function getDb(): Db {
  if (cached) return cached
  const url = process.env.DATABASE_URL ?? './data/gdr.sqlite'
  const sqlite = new Database(url)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  applyMigrations(db)
  cached = db
  return db
}

export function createTestDb(): Db {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  applyMigrations(db)
  return db
}

function applyMigrations(db: Db) {
  const here = dirname(fileURLToPath(import.meta.url))
  const migrationsFolder = resolve(here, './migrations')
  migrate(db, { migrationsFolder })
}

export function resetCache() {
  cached = null
}
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/integration/db-roundtrip.test.ts
```
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/db/client.ts tests/integration/db-roundtrip.test.ts
git commit -m "feat: client sqlite drizzle con migration auto"
```

---

## Task 15 — `server/utils/crypto.ts` (token + hash)

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/utils/crypto.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/unit/server/crypto.test.ts`

- [ ] **Step 1: Test**

Create `tests/unit/server/crypto.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  generateToken, generateUuid, hashMasterToken, verifyMasterToken
} from '~~/server/utils/crypto'

describe('generateToken', () => {
  it('genera una stringa url-safe non vuota', () => {
    const t = generateToken(32)
    expect(t.length).toBeGreaterThan(20)
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('due generazioni sono diverse', () => {
    expect(generateToken(32)).not.toBe(generateToken(32))
  })
})

describe('generateUuid', () => {
  it('è un uuid v4', () => {
    const u = generateUuid()
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('master token hashing', () => {
  it('hash + verify round-trip', async () => {
    const raw = generateToken(32)
    const h = await hashMasterToken(raw)
    expect(h).not.toBe(raw)
    expect(await verifyMasterToken(raw, h)).toBe(true)
    expect(await verifyMasterToken('altro', h)).toBe(false)
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/unit/server/crypto.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `server/utils/crypto.ts`:

```ts
import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'

const BCRYPT_COST = 8

export function generateToken(bytes = 32): string {
  return randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function generateUuid(): string {
  return randomUUID()
}

export async function hashMasterToken(token: string): Promise<string> {
  return bcrypt.hash(token, BCRYPT_COST)
}

export async function verifyMasterToken(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash)
}
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/unit/server/crypto.test.ts
```
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/crypto.ts tests/unit/server/crypto.test.ts
git commit -m "feat: utilità crypto per token e hash master"
```

---

## Task 16 — `server/services/parties.ts`

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/services/parties.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/integration/services/parties.test.ts`

- [ ] **Step 1: Test**

Create `tests/integration/services/parties.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty, findParty, verifyMaster } from '~~/server/services/parties'

let db: Db
beforeEach(() => { db = createTestDb() })

describe('parties service', () => {
  it('createParty genera seed uuid, cityName, masterToken in chiaro e master player', async () => {
    const r = await createParty(db, { masterNickname: 'Nick' })
    expect(r.seed).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/)
    expect(r.masterToken.length).toBeGreaterThan(20)
    expect(r.masterPlayer.role).toBe('master')
    expect(r.masterPlayer.nickname).toBe('Nick')
    expect(r.masterPlayer.currentAreaId).toBe('piazza')
    expect(r.cityState.areas.piazza.status).toBe('intact')
  })

  it('findParty ritrova la party per seed', async () => {
    const r = await createParty(db, { masterNickname: 'Nick' })
    const found = findParty(db, r.seed)
    expect(found?.cityName).toBe(r.cityState.cityName)
  })

  it('verifyMaster accetta solo il token corretto', async () => {
    const r = await createParty(db, { masterNickname: 'Nick' })
    expect(await verifyMaster(db, r.seed, r.masterToken)).toBe(true)
    expect(await verifyMaster(db, r.seed, 'wrong')).toBe(false)
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/integration/services/parties.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `server/services/parties.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { parties, players, areasState } from '~~/server/db/schema'
import { deriveCityState, type CityState } from '~~/shared/seed/derive-city'
import {
  generateToken, generateUuid, hashMasterToken, verifyMasterToken
} from '~~/server/utils/crypto'
import { DomainError } from '~~/shared/errors'

export interface CreatePartyInput {
  masterNickname: string
}

export interface CreatePartyResult {
  seed: string
  masterToken: string
  sessionToken: string
  masterPlayer: {
    id: string
    nickname: string
    role: 'master'
    currentAreaId: string
  }
  cityState: CityState
}

export async function createParty(db: Db, input: CreatePartyInput): Promise<CreatePartyResult> {
  const seed = generateUuid()
  const masterToken = generateToken(32)
  const hash = await hashMasterToken(masterToken)
  const now = Date.now()

  const cityState = deriveCityState(seed)

  db.insert(parties).values({
    seed,
    masterTokenHash: hash,
    cityName: cityState.cityName,
    createdAt: now,
    lastActivityAt: now
  }).run()

  const areaRows = Object.entries(cityState.areas).map(([areaId, s]) => ({
    partySeed: seed,
    areaId,
    status: s.status,
    customName: s.customName,
    notes: null
  }))
  db.insert(areasState).values(areaRows).run()

  const masterId = generateUuid()
  const sessionToken = generateToken(32)
  db.insert(players).values({
    id: masterId,
    partySeed: seed,
    nickname: input.masterNickname.trim(),
    role: 'master',
    currentAreaId: 'piazza',
    isMuted: false,
    mutedUntil: null,
    isKicked: false,
    joinedAt: now,
    lastSeenAt: now,
    sessionToken
  }).run()

  return {
    seed,
    masterToken,
    sessionToken,
    masterPlayer: {
      id: masterId,
      nickname: input.masterNickname.trim(),
      role: 'master',
      currentAreaId: 'piazza'
    },
    cityState
  }
}

export function findParty(db: Db, seed: string) {
  const rows = db.select().from(parties).where(eq(parties.seed, seed)).all()
  return rows[0] ?? null
}

export async function verifyMaster(db: Db, seed: string, masterToken: string): Promise<boolean> {
  const p = findParty(db, seed)
  if (!p) return false
  return verifyMasterToken(masterToken, p.masterTokenHash)
}

export function touchParty(db: Db, seed: string) {
  db.update(parties)
    .set({ lastActivityAt: Date.now() })
    .where(eq(parties.seed, seed))
    .run()
}

export function partyMustExist(db: Db, seed: string) {
  const p = findParty(db, seed)
  if (!p) throw new DomainError('not_found', `party ${seed}`)
  return p
}
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/integration/services/parties.test.ts
```
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/services/parties.ts tests/integration/services/parties.test.ts
git commit -m "feat: servizio parties con create/find/verify-master"
```

---

## Task 17 — `server/services/players.ts`

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/services/players.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/integration/services/players.test.ts`

- [ ] **Step 1: Test**

Create `tests/integration/services/players.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import {
  joinParty, findPlayerBySession, findPlayerByNickname,
  isBanned, listOnlinePlayers, touchPlayer
} from '~~/server/services/players'
import { DomainError } from '~~/shared/errors'
import { bans } from '~~/server/db/schema'

let db: Db
let seed: string

beforeEach(async () => {
  db = createTestDb()
  const r = await createParty(db, { masterNickname: 'Master' })
  seed = r.seed
})

describe('players service', () => {
  it('joinParty crea player nell area piazza', () => {
    const p = joinParty(db, seed, 'Anna')
    expect(p.role).toBe('user')
    expect(p.currentAreaId).toBe('piazza')
    expect(p.sessionToken.length).toBeGreaterThan(10)
  })

  it('joinParty rifiuta nickname già usato (conflict)', () => {
    joinParty(db, seed, 'Anna')
    expect(() => joinParty(db, seed, 'Anna')).toThrowError(/conflict/)
  })

  it('joinParty rifiuta se party inesistente', () => {
    expect(() => joinParty(db, 'not-exist', 'Anna')).toThrowError(/not_found/)
  })

  it('joinParty rifiuta nickname bannato', () => {
    db.insert(bans).values({
      partySeed: seed, nicknameLower: 'anna', reason: null, bannedAt: Date.now()
    }).run()
    expect(() => joinParty(db, seed, 'Anna')).toThrowError(/banned/)
  })

  it('findPlayerBySession trova il player', () => {
    const p = joinParty(db, seed, 'Anna')
    const f = findPlayerBySession(db, seed, p.sessionToken)
    expect(f?.id).toBe(p.id)
  })

  it('findPlayerByNickname case-insensitive', () => {
    joinParty(db, seed, 'Anna')
    expect(findPlayerByNickname(db, seed, 'anna')?.nickname).toBe('Anna')
    expect(findPlayerByNickname(db, seed, 'ANNA')?.nickname).toBe('Anna')
  })

  it('listOnlinePlayers include il master iniziale e i nuovi', () => {
    joinParty(db, seed, 'Anna')
    joinParty(db, seed, 'Luca')
    const all = listOnlinePlayers(db, seed)
    expect(all.map(p => p.nickname).sort()).toEqual(['Anna', 'Luca', 'Master'])
  })

  it('isBanned rileva ban', () => {
    expect(isBanned(db, seed, 'Anna')).toBe(false)
    db.insert(bans).values({
      partySeed: seed, nicknameLower: 'anna', reason: null, bannedAt: Date.now()
    }).run()
    expect(isBanned(db, seed, 'ANNA')).toBe(true)
  })

  it('touchPlayer aggiorna lastSeenAt', () => {
    const p = joinParty(db, seed, 'Anna')
    const before = p.lastSeenAt
    // Simula passaggio temporale senza sleep
    const later = before + 1000
    touchPlayer(db, p.id, later)
    const again = findPlayerBySession(db, seed, p.sessionToken)
    expect(again?.lastSeenAt).toBe(later)
  })
})

// Inietta DomainError awareness
export {}
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/integration/services/players.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `server/services/players.ts`:

```ts
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { players, bans } from '~~/server/db/schema'
import { generateToken, generateUuid } from '~~/server/utils/crypto'
import { DomainError } from '~~/shared/errors'
import { partyMustExist } from '~~/server/services/parties'

export interface PlayerRow {
  id: string
  partySeed: string
  nickname: string
  role: 'user' | 'master'
  currentAreaId: string
  isMuted: boolean
  mutedUntil: number | null
  isKicked: boolean
  joinedAt: number
  lastSeenAt: number
  sessionToken: string
}

export function joinParty(db: Db, seed: string, nickname: string): PlayerRow {
  partyMustExist(db, seed)
  const nick = nickname.trim()

  if (isBanned(db, seed, nick)) {
    throw new DomainError('banned', nick)
  }

  const existing = findPlayerByNickname(db, seed, nick)
  if (existing) throw new DomainError('conflict', `nickname ${nick}`)

  const id = generateUuid()
  const sessionToken = generateToken(32)
  const now = Date.now()

  db.insert(players).values({
    id,
    partySeed: seed,
    nickname: nick,
    role: 'user',
    currentAreaId: 'piazza',
    isMuted: false,
    mutedUntil: null,
    isKicked: false,
    joinedAt: now,
    lastSeenAt: now,
    sessionToken
  }).run()

  return {
    id, partySeed: seed, nickname: nick, role: 'user',
    currentAreaId: 'piazza', isMuted: false, mutedUntil: null,
    isKicked: false, joinedAt: now, lastSeenAt: now, sessionToken
  }
}

export function findPlayerBySession(db: Db, seed: string, sessionToken: string): PlayerRow | null {
  const rows = db.select().from(players)
    .where(and(eq(players.partySeed, seed), eq(players.sessionToken, sessionToken)))
    .all()
  return (rows[0] as PlayerRow | undefined) ?? null
}

export function findPlayerByNickname(db: Db, seed: string, nickname: string): PlayerRow | null {
  const rows = db.select().from(players)
    .where(and(
      eq(players.partySeed, seed),
      sql`LOWER(${players.nickname}) = ${nickname.toLowerCase()}`
    ))
    .all()
  return (rows[0] as PlayerRow | undefined) ?? null
}

export function listOnlinePlayers(db: Db, seed: string): PlayerRow[] {
  return db.select().from(players)
    .where(and(eq(players.partySeed, seed), eq(players.isKicked, false)))
    .all() as PlayerRow[]
}

export function isBanned(db: Db, seed: string, nickname: string): boolean {
  const rows = db.select().from(bans)
    .where(and(eq(bans.partySeed, seed), eq(bans.nicknameLower, nickname.toLowerCase())))
    .all()
  return rows.length > 0
}

export function touchPlayer(db: Db, playerId: string, now: number = Date.now()) {
  db.update(players).set({ lastSeenAt: now }).where(eq(players.id, playerId)).run()
}

export function rotateSessionToken(db: Db, playerId: string): string {
  const token = generateToken(32)
  db.update(players).set({ sessionToken: token }).where(eq(players.id, playerId)).run()
  return token
}
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/integration/services/players.test.ts
```
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/services/players.ts tests/integration/services/players.test.ts
git commit -m "feat: servizio players con join, lookup, ban check"
```

---

## Task 18 — `server/services/areas.ts`

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/services/areas.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/integration/services/areas.test.ts`

- [ ] **Step 1: Test**

Create `tests/integration/services/areas.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import { AREA_IDS } from '~~/shared/map/areas'

let db: Db
let seed: string

beforeEach(async () => {
  db = createTestDb()
  const r = await createParty(db, { masterNickname: 'Master' })
  seed = r.seed
})

describe('areas service', () => {
  it('listAreasState restituisce tutte le 14 aree', () => {
    const rows = listAreasState(db, seed)
    expect(rows).toHaveLength(14)
    const ids = rows.map(r => r.areaId).sort()
    expect(ids).toEqual([...AREA_IDS].sort())
  })

  it('piazza è sempre intact', () => {
    const rows = listAreasState(db, seed)
    const piazza = rows.find(r => r.areaId === 'piazza')!
    expect(piazza.status).toBe('intact')
  })
})
```

- [ ] **Step 2: Eseguire — deve fallire**

Run:
```bash
pnpm test tests/integration/services/areas.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementare**

Create `server/services/areas.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { areasState } from '~~/server/db/schema'

export interface AreaStateRow {
  partySeed: string
  areaId: string
  status: 'intact' | 'infested' | 'ruined' | 'closed'
  customName: string | null
  notes: string | null
}

export function listAreasState(db: Db, seed: string): AreaStateRow[] {
  return db.select().from(areasState)
    .where(eq(areasState.partySeed, seed))
    .all() as AreaStateRow[]
}
```

- [ ] **Step 4: Eseguire — deve passare**

Run:
```bash
pnpm test tests/integration/services/areas.test.ts
```
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/services/areas.ts tests/integration/services/areas.test.ts
git commit -m "feat: servizio areas con listing stato per party"
```

---

## Task 19 — `POST /api/parties` (create) + integration test

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/utils/db.ts` (wrapper per richiesta)
- Create: `/Users/mashfrog/Work/gdr-zombie/server/utils/http.ts` (error handler)
- Create: `/Users/mashfrog/Work/gdr-zombie/server/api/parties/index.post.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/integration/api/parties-create.test.ts`

- [ ] **Step 1: Util db wrapper per Nitro**

Create `server/utils/db.ts`:

```ts
import { getDb } from '~~/server/db/client'
export function useDb() {
  return getDb()
}
```

- [ ] **Step 2: Util http error handler**

Create `server/utils/http.ts`:

```ts
import { createError } from 'h3'
import { DomainError } from '~~/shared/errors'
import type { ZodError } from 'zod'

export function toH3Error(e: unknown): never {
  if (e instanceof DomainError) {
    const statusByCode: Record<string, number> = {
      invalid_payload: 400,
      not_found: 404,
      forbidden: 403,
      master_only: 403,
      rate_limited: 429,
      conflict: 409,
      muted: 403,
      banned: 403,
      area_closed: 409,
      not_adjacent: 409,
      session_invalid: 401,
      session_superseded: 401,
      bad_roll_expr: 400
    }
    throw createError({
      statusCode: statusByCode[e.code] ?? 400,
      statusMessage: e.code,
      data: { code: e.code, detail: e.detail ?? null }
    })
  }
  if (isZodError(e)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'invalid_payload',
      data: { code: 'invalid_payload', detail: e.issues.map(i => i.message).join('; ') }
    })
  }
  throw e
}

function isZodError(e: unknown): e is ZodError {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'ZodError'
}
```

- [ ] **Step 3: Endpoint**

Create `server/api/parties/index.post.ts`:

```ts
import { CreatePartyBody } from '~~/shared/protocol/http'
import { createParty } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import { listOnlinePlayers } from '~~/server/services/players'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    const raw = await readBody(event)
    const body = CreatePartyBody.parse(raw)
    const db = useDb()
    const result = await createParty(db, body)
    const areasState = listAreasState(db, result.seed)
    const players = listOnlinePlayers(db, result.seed)
    return {
      seed: result.seed,
      masterToken: result.masterToken,
      sessionToken: result.sessionToken,
      playerId: result.masterPlayer.id,
      initialState: {
        party: {
          seed: result.seed,
          cityName: result.cityState.cityName,
          createdAt: Date.now(),
          lastActivityAt: Date.now()
        },
        me: result.masterPlayer,
        players,
        areasState,
        messagesByArea: {},
        dms: [],
        serverTime: Date.now()
      }
    }
  } catch (e) {
    toH3Error(e)
  }
})
```

- [ ] **Step 4: Test integration**

Create `tests/integration/api/parties-create.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'

await setup({
  rootDir: fileURLToPath(new URL('../../..', import.meta.url)),
  dev: false,
  server: true,
  env: { DATABASE_URL: ':memory:' }
})

describe('POST /api/parties', () => {
  it('crea una party e torna seed, masterToken, initialState', async () => {
    const r = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'Fab' }
    }) as Record<string, unknown>
    expect(typeof r.seed).toBe('string')
    expect(typeof r.masterToken).toBe('string')
    expect(typeof r.sessionToken).toBe('string')
    const initial = r.initialState as { areasState: unknown[], players: unknown[] }
    expect(initial.areasState).toHaveLength(14)
    expect(initial.players).toHaveLength(1)
  })

  it('rifiuta body invalido con 400 invalid_payload', async () => {
    await expect($fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'a' } // troppo corto
    })).rejects.toMatchObject({ statusCode: 400, statusMessage: 'invalid_payload' })
  })
})
```

- [ ] **Step 5: Eseguire**

Run:
```bash
pnpm test tests/integration/api/parties-create.test.ts
```
Expected: `2 passed`.

Se i test integration richiedono un tempo più lungo per avviare Nuxt, è normale (~10-30s al primo run).

- [ ] **Step 6: Commit**

```bash
git add server/utils server/api/parties/index.post.ts tests/integration/api/parties-create.test.ts
git commit -m "feat: endpoint post /api/parties per creare party"
```

---

## Task 20 — `POST /api/parties/:seed/join` + test

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/api/parties/[seed]/join.post.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/integration/api/parties-join.test.ts`

- [ ] **Step 1: Endpoint**

Create `server/api/parties/[seed]/join.post.ts`:

```ts
import { JoinPartyBody } from '~~/shared/protocol/http'
import { joinParty } from '~~/server/services/players'
import { partyMustExist, touchParty } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import { listOnlinePlayers } from '~~/server/services/players'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    const seed = getRouterParam(event, 'seed')!
    const raw = await readBody(event)
    const body = JoinPartyBody.parse(raw)
    const db = useDb()
    const party = partyMustExist(db, seed)
    const player = joinParty(db, seed, body.nickname)
    touchParty(db, seed)
    const areasState = listAreasState(db, seed)
    const players = listOnlinePlayers(db, seed)
    return {
      sessionToken: player.sessionToken,
      playerId: player.id,
      initialState: {
        party: {
          seed: party.seed,
          cityName: party.cityName,
          createdAt: party.createdAt,
          lastActivityAt: party.lastActivityAt
        },
        me: {
          id: player.id,
          nickname: player.nickname,
          role: player.role,
          currentAreaId: player.currentAreaId
        },
        players,
        areasState,
        messagesByArea: {},
        dms: [],
        serverTime: Date.now()
      }
    }
  } catch (e) {
    toH3Error(e)
  }
})
```

- [ ] **Step 2: Test**

Create `tests/integration/api/parties-join.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'

await setup({
  rootDir: fileURLToPath(new URL('../../..', import.meta.url)),
  dev: false,
  server: true,
  env: { DATABASE_URL: ':memory:' }
})

async function createParty() {
  return $fetch('/api/parties', {
    method: 'POST',
    body: { masterNickname: 'Master' }
  }) as Promise<{ seed: string }>
}

describe('POST /api/parties/:seed/join', () => {
  it('unisce un nuovo player', async () => {
    const { seed } = await createParty()
    const r = await $fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      body: { nickname: 'Anna' }
    }) as Record<string, unknown>
    expect(typeof r.sessionToken).toBe('string')
    const me = (r.initialState as { me: { nickname: string, role: string } }).me
    expect(me.nickname).toBe('Anna')
    expect(me.role).toBe('user')
  })

  it('rifiuta party inesistente con 404', async () => {
    await expect($fetch('/api/parties/00000000-0000-0000-0000-000000000000/join', {
      method: 'POST',
      body: { nickname: 'Anna' }
    })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rifiuta nickname conflittuale con 409', async () => {
    const { seed } = await createParty()
    await $fetch(`/api/parties/${seed}/join`, { method: 'POST', body: { nickname: 'Anna' } })
    await expect($fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      body: { nickname: 'Anna' }
    })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'conflict' })
  })
})
```

- [ ] **Step 3: Eseguire**

Run:
```bash
pnpm test tests/integration/api/parties-join.test.ts
```
Expected: `3 passed`.

- [ ] **Step 4: Commit**

```bash
git add server/api/parties tests/integration/api/parties-join.test.ts
git commit -m "feat: endpoint post /api/parties/:seed/join"
```

---

## Task 21 — `POST /api/parties/:seed/reclaim-master` + test

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/api/parties/[seed]/reclaim-master.post.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/integration/api/parties-reclaim.test.ts`
- Modify: `/Users/mashfrog/Work/gdr-zombie/server/services/players.ts` (aggiungere `findMaster`)

- [ ] **Step 1: Aggiungere findMaster al servizio players**

Edit `server/services/players.ts` — aggiungere funzione:

```ts
// alla fine del file
export function findMaster(db: Db, seed: string): PlayerRow | null {
  const rows = db.select().from(players)
    .where(and(eq(players.partySeed, seed), eq(players.role, 'master')))
    .all()
  return (rows[0] as PlayerRow | undefined) ?? null
}
```

- [ ] **Step 2: Endpoint**

Create `server/api/parties/[seed]/reclaim-master.post.ts`:

```ts
import { ReclaimMasterBody } from '~~/shared/protocol/http'
import { verifyMaster, partyMustExist, touchParty } from '~~/server/services/parties'
import { findMaster, rotateSessionToken, touchPlayer, listOnlinePlayers } from '~~/server/services/players'
import { listAreasState } from '~~/server/services/areas'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { DomainError } from '~~/shared/errors'

export default defineEventHandler(async (event) => {
  try {
    const seed = getRouterParam(event, 'seed')!
    const raw = await readBody(event)
    const body = ReclaimMasterBody.parse(raw)
    const db = useDb()
    const party = partyMustExist(db, seed)
    const ok = await verifyMaster(db, seed, body.masterToken)
    if (!ok) throw new DomainError('forbidden', 'invalid_master_token')

    const master = findMaster(db, seed)
    if (!master) throw new DomainError('not_found', 'master_player_missing')

    const sessionToken = rotateSessionToken(db, master.id)
    touchPlayer(db, master.id)
    touchParty(db, seed)

    const areasState = listAreasState(db, seed)
    const players = listOnlinePlayers(db, seed)

    return {
      sessionToken,
      playerId: master.id,
      initialState: {
        party: {
          seed: party.seed,
          cityName: party.cityName,
          createdAt: party.createdAt,
          lastActivityAt: party.lastActivityAt
        },
        me: {
          id: master.id,
          nickname: master.nickname,
          role: master.role,
          currentAreaId: master.currentAreaId
        },
        players,
        areasState,
        messagesByArea: {},
        dms: [],
        serverTime: Date.now()
      }
    }
  } catch (e) {
    toH3Error(e)
  }
})
```

- [ ] **Step 3: Test**

Create `tests/integration/api/parties-reclaim.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'

await setup({
  rootDir: fileURLToPath(new URL('../../..', import.meta.url)),
  dev: false,
  server: true,
  env: { DATABASE_URL: ':memory:' }
})

describe('POST /api/parties/:seed/reclaim-master', () => {
  it('con token corretto rilascia una nuova session', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'Master' }
    }) as { seed: string, masterToken: string, sessionToken: string }

    const r = await $fetch(`/api/parties/${create.seed}/reclaim-master`, {
      method: 'POST',
      body: { masterToken: create.masterToken }
    }) as { sessionToken: string }

    expect(r.sessionToken.length).toBeGreaterThan(10)
    expect(r.sessionToken).not.toBe(create.sessionToken)
  })

  it('con token sbagliato → 403', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'Master' }
    }) as { seed: string }

    await expect($fetch(`/api/parties/${create.seed}/reclaim-master`, {
      method: 'POST',
      body: { masterToken: 'wrong' }
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('party inesistente → 404', async () => {
    await expect($fetch('/api/parties/00000000-0000-0000-0000-000000000000/reclaim-master', {
      method: 'POST',
      body: { masterToken: 'wrong' }
    })).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

- [ ] **Step 4: Eseguire**

Run:
```bash
pnpm test tests/integration/api/parties-reclaim.test.ts
```
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/services/players.ts server/api/parties/[seed]/reclaim-master.post.ts tests/integration/api/parties-reclaim.test.ts
git commit -m "feat: endpoint reclaim-master con verifica token"
```

---

## Task 22 — `POST /api/parties/:seed/resume` + test

**Files:**
- Create: `/Users/mashfrog/Work/gdr-zombie/server/api/parties/[seed]/resume.post.ts`
- Create: `/Users/mashfrog/Work/gdr-zombie/tests/integration/api/parties-resume.test.ts`

- [ ] **Step 1: Endpoint**

Create `server/api/parties/[seed]/resume.post.ts`:

```ts
import { ResumeBody } from '~~/shared/protocol/http'
import { partyMustExist, touchParty } from '~~/server/services/parties'
import { findPlayerBySession, touchPlayer, listOnlinePlayers } from '~~/server/services/players'
import { listAreasState } from '~~/server/services/areas'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { DomainError } from '~~/shared/errors'

export default defineEventHandler(async (event) => {
  try {
    const seed = getRouterParam(event, 'seed')!
    const raw = await readBody(event)
    const body = ResumeBody.parse(raw)
    const db = useDb()
    const party = partyMustExist(db, seed)

    const player = findPlayerBySession(db, seed, body.sessionToken)
    if (!player || player.isKicked) {
      throw new DomainError('session_invalid')
    }

    touchPlayer(db, player.id)
    touchParty(db, seed)
    const areasState = listAreasState(db, seed)
    const players = listOnlinePlayers(db, seed)

    return {
      sessionToken: player.sessionToken,
      playerId: player.id,
      initialState: {
        party: {
          seed: party.seed,
          cityName: party.cityName,
          createdAt: party.createdAt,
          lastActivityAt: party.lastActivityAt
        },
        me: {
          id: player.id,
          nickname: player.nickname,
          role: player.role,
          currentAreaId: player.currentAreaId
        },
        players,
        areasState,
        messagesByArea: {},
        dms: [],
        serverTime: Date.now()
      }
    }
  } catch (e) {
    toH3Error(e)
  }
})
```

- [ ] **Step 2: Test**

Create `tests/integration/api/parties-resume.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'

await setup({
  rootDir: fileURLToPath(new URL('../../..', import.meta.url)),
  dev: false,
  server: true,
  env: { DATABASE_URL: ':memory:' }
})

describe('POST /api/parties/:seed/resume', () => {
  it('riprende una sessione valida', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'M' }
    }) as { seed: string, sessionToken: string, playerId: string }

    const r = await $fetch(`/api/parties/${create.seed}/resume`, {
      method: 'POST',
      body: { sessionToken: create.sessionToken }
    }) as { playerId: string }

    expect(r.playerId).toBe(create.playerId)
  })

  it('sessione invalida → 401', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'M' }
    }) as { seed: string }

    await expect($fetch(`/api/parties/${create.seed}/resume`, {
      method: 'POST',
      body: { sessionToken: 'bad-token' }
    })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('party inesistente → 404', async () => {
    await expect($fetch('/api/parties/00000000-0000-0000-0000-000000000000/resume', {
      method: 'POST',
      body: { sessionToken: 'any' }
    })).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

- [ ] **Step 3: Eseguire**

Run:
```bash
pnpm test tests/integration/api/parties-resume.test.ts
```
Expected: `3 passed`.

- [ ] **Step 4: Commit**

```bash
git add server/api/parties/[seed]/resume.post.ts tests/integration/api/parties-resume.test.ts
git commit -m "feat: endpoint resume session via sessionToken"
```

---

## Task 23 — Gate finale: lint + typecheck + test verdi

- [ ] **Step 1: Esecuzione completa**

Run:
```bash
pnpm lint
```
Expected: 0 errori.

Run:
```bash
pnpm typecheck
```
Expected: 0 errori.

Run:
```bash
pnpm test
```
Expected: tutti i test passano (unit + integration).

- [ ] **Step 2: Verifica manuale che l'app parte**

Run:
```bash
pnpm dev
```
Aprire `http://localhost:3000/`: deve apparire la pagina "GDR Zombi / La città non è più quella che ricordi." con palette scura. Chiudere con `Ctrl+C`.

- [ ] **Step 3: Commit di chiusura plan**

```bash
git commit --allow-empty -m "chore: chiude plan 1 foundation"
```

---

## Checklist completamento

- [ ] Task 1 — deps
- [ ] Task 2 — vitest + path alias
- [ ] Task 3 — palette zombi dark-only
- [ ] Task 4 — `shared/errors.ts`
- [ ] Task 5 — `shared/map/areas.ts`
- [ ] Task 6 — `shared/seed/prng.ts`
- [ ] Task 7 — `shared/seed/derive-city.ts`
- [ ] Task 8 — `shared/map/weather.ts`
- [ ] Task 9 — `shared/dice/{parse,roll}.ts`
- [ ] Task 10 — `shared/slash/parse.ts`
- [ ] Task 11 — `shared/protocol/http.ts`
- [ ] Task 12 — `shared/protocol/ws.ts`
- [ ] Task 13 — Drizzle schema + migration
- [ ] Task 14 — DB client
- [ ] Task 15 — crypto utils
- [ ] Task 16 — service parties
- [ ] Task 17 — service players
- [ ] Task 18 — service areas
- [ ] Task 19 — `POST /api/parties`
- [ ] Task 20 — `POST /api/parties/:seed/join`
- [ ] Task 21 — `POST /api/parties/:seed/reclaim-master`
- [ ] Task 22 — `POST /api/parties/:seed/resume`
- [ ] Task 23 — gate finale verde

Al termine, il progetto è pronto per **Plan 2 — Realtime e chat minimale** (WebSocket, chat `say`, stores Pinia, home/party UI base).
