// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '~/stores/auth'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('parte con identity null, loaded false', () => {
    const s = useAuthStore()
    expect(s.identity).toBeNull()
    expect(s.loaded).toBe(false)
    expect(s.isAuthenticated).toBe(false)
    expect(s.isUser).toBe(false)
    expect(s.isSuperadmin).toBe(false)
  })

  it('fetchMe su 200 popola identity', async () => {
    const s = useAuthStore()
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      kind: 'user', id: 'u1', username: 'Mash', mustReset: false
    }))
    await s.fetchMe()
    expect(s.identity?.username).toBe('Mash')
    expect(s.isUser).toBe(true)
    expect(s.loaded).toBe(true)
  })

  it('fetchMe su errore lascia identity null ma marca loaded', async () => {
    const s = useAuthStore()
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('401')))
    await s.fetchMe()
    expect(s.identity).toBeNull()
    expect(s.loaded).toBe(true)
  })

  it('isSuperadmin true quando kind=superadmin', () => {
    const s = useAuthStore()
    s.setIdentity({ kind: 'superadmin', id: 's1', username: 'admin', mustReset: true })
    expect(s.isSuperadmin).toBe(true)
    expect(s.isUser).toBe(false)
  })

  it('reset azzera identity e loaded', () => {
    const s = useAuthStore()
    s.setIdentity({ kind: 'user', id: 'u', username: 'x', mustReset: false })
    s.reset()
    expect(s.identity).toBeNull()
    expect(s.loaded).toBe(false)
  })
})
