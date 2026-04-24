export interface RateLimiter {
  tryHit(key: string, now?: number): boolean
  clear(key: string): void
}

export function createRateLimiter(opts: { windowMs: number, maxHits: number }): RateLimiter {
  const store = new Map<string, number[]>()

  function prune(timestamps: number[], now: number): number[] {
    const cutoff = now - opts.windowMs
    return timestamps.filter(t => t > cutoff)
  }

  return {
    tryHit(key, now = Date.now()) {
      const existing = store.get(key) ?? []
      const pruned = prune(existing, now)
      if (pruned.length >= opts.maxHits) {
        store.set(key, pruned)
        return false
      }
      pruned.push(now)
      store.set(key, pruned)
      return true
    },
    clear(key) {
      store.delete(key)
    }
  }
}
