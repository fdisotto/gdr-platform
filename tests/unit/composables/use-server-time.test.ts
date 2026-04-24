// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useServerTime, _resetServerTimeForTests } from '~/composables/useServerTime'

describe('useServerTime', () => {
  beforeEach(() => {
    _resetServerTimeForTests()
  })
  it('calcola offset da serverTime e Date.now()', () => {
    const realNow = 1_000_000
    vi.spyOn(Date, 'now').mockReturnValue(realNow)
    const t = useServerTime()
    t.sync(realNow + 5000)
    expect(t.offset.value).toBe(5000)
    vi.restoreAllMocks()
  })

  it('currentTime torna Date.now + offset', () => {
    const realNow = 2_000_000
    vi.spyOn(Date, 'now').mockReturnValue(realNow)
    const t = useServerTime()
    t.sync(realNow - 2000)
    expect(t.currentTime()).toBe(realNow - 2000)
    vi.restoreAllMocks()
  })

  it('synced è false fino alla prima sync', () => {
    const t = useServerTime()
    expect(t.synced.value).toBe(false)
    t.sync(Date.now())
    expect(t.synced.value).toBe(true)
  })
})
