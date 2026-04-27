import { defineStore } from 'pinia'

/**
 * Wrapper che produce uno store Pinia "keyed-by-seed": una singola
 * `defineStore(...)` per ogni `seed` distinto, con id `${prefix}-${seed}`.
 *
 * I tipi del valore tornato seguono il `factory()` originale: questo
 * permette ai call site di mantenere autocomplete sui campi e sulle
 * azioni del setup-store senza wrappers manuali.
 *
 * Cache delle istanze a livello modulo: due chiamate consecutive con la
 * stessa seed ritornano la stessa istanza. Pinia internamente memoizza
 * sulla id, ma evitiamo di ricreare la `defineStore` a ogni call.
 */
export function makeKeyed<R>(prefix: string, factory: (seed: string) => R): (seed: string) => R {
  const defs = new Map<string, () => R>()
  return (seed: string): R => {
    const id = `${prefix}-${seed}`
    let useStore = defs.get(id)
    if (!useStore) {
      useStore = defineStore(id, () => factory(seed)) as unknown as () => R
      defs.set(id, useStore)
    }
    return useStore()
  }
}
