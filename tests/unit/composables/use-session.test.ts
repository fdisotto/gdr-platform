// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSession, _resetSessionForTests } from '~/composables/useSession'
import { flushPromises } from '@vue/test-utils'

describe('useSession', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetSessionForTests()
    vi.clearAllMocks()
  })

  it('nickname parte null se nulla salvato', () => {
    const s = useSession()
    expect(s.nickname.value).toBe(null)
  })

  it('setNickname persiste e riflette', async () => {
    const s = useSession()
    s.setNickname('Anna')
    expect(s.nickname.value).toBe('Anna')
    await flushPromises()
    expect(localStorage.getItem('gdr.nickname')).toBe('Anna')
    const s2 = useSession()
    expect(s2.nickname.value).toBe('Anna')
  })

  it('clearNickname rimuove', async () => {
    const s = useSession()
    s.setNickname('X')
    await flushPromises()
    s.clearNickname()
    await flushPromises()
    expect(s.nickname.value).toBe(null)
    expect(localStorage.getItem('gdr.nickname')).toBeNull()
  })

  it('addSession e listSessions', () => {
    const s = useSession()
    s.addSession({ seed: 'u1', sessionToken: 't1', role: 'user', joinedAt: 1 })
    s.addSession({ seed: 'u2', sessionToken: 't2', role: 'master', joinedAt: 2 })
    const list = s.listSessions()
    expect(list).toHaveLength(2)
    expect(list.find(x => x.seed === 'u1')?.role).toBe('user')
  })

  it('removeSession pulisce', () => {
    const s = useSession()
    s.addSession({ seed: 'u1', sessionToken: 't1', role: 'user', joinedAt: 1 })
    s.removeSession('u1')
    expect(s.listSessions()).toEqual([])
  })

  it('master token set/get/remove', () => {
    const s = useSession()
    s.setMasterToken('u1', 'token')
    expect(s.getMasterToken('u1')).toBe('token')
    s.removeMasterToken('u1')
    expect(s.getMasterToken('u1')).toBe(null)
  })
})
