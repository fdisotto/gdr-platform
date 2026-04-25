// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent, h } from 'vue'

import {
  useCrossPartyNotifications,
  _resetCrossPartyNotificationsForTests
} from '~/composables/useCrossPartyNotifications'
import { useFeedbackStore } from '~/stores/feedback'
import { useSettingsStore } from '~/stores/settings'

// Stub useNotificationSound per non chiamare AudioContext
vi.mock('~/composables/useNotificationSound', () => ({
  playNotificationSound: vi.fn()
}))

const Empty = defineComponent({ render: () => h('div') })

async function withRouter(path: string, fn: () => void | Promise<void>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Empty },
      { path: '/party/:seed', component: Empty }
    ]
  })
  await router.push(path)
  await router.isReady()
  // patch window.location.pathname per _foregroundSeed
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { pathname: path, protocol: 'http:', host: 'localhost' }
  })
  // Monta un componente fittizio che invoca il composable nel suo setup
  const Host = defineComponent({
    setup(_p, { expose }) {
      const api = useCrossPartyNotifications()
      expose(api)
      return () => h('div')
    }
  })
  const { mount } = await import('@vue/test-utils')
  const wrapper = mount(Host, {
    global: { plugins: [router] }
  })
  await fn.call(wrapper.vm as never)
  await router.isReady()
  return wrapper.vm as unknown as ReturnType<typeof useCrossPartyNotifications>
}

describe('useCrossPartyNotifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    _resetCrossPartyNotificationsForTests()
  })

  it('bumpUnread incrementa solo se notificationsChatAll attivo e party non in foreground', async () => {
    const api = await withRouter('/', () => { /* idle */ })
    const settings = useSettingsStore()
    settings.notificationsChatAll = true
    api.bumpUnread('A', 'Alpha')
    api.bumpUnread('A')
    api.bumpUnread('B')
    expect(api.unreadFor('A')).toBe(2)
    expect(api.unreadFor('B')).toBe(1)
  })

  it('bumpUnread no-op se notificationsChatAll spento', async () => {
    const api = await withRouter('/', () => { /* idle */ })
    const settings = useSettingsStore()
    settings.notificationsChatAll = false
    api.bumpUnread('A')
    expect(api.unreadFor('A')).toBe(0)
  })

  it('bumpDirect incrementa direct counter e pusha toast cliccabile', async () => {
    const api = await withRouter('/', () => { /* idle */ })
    const fb = useFeedbackStore()
    api.bumpDirect('A', 'Alpha', 'Mara')
    expect(api.directFor('A')).toBe(1)
    expect(fb.toasts).toHaveLength(1)
    expect(fb.toasts[0]!.title).toMatch(/Missiva da Mara/)
    expect(typeof fb.toasts[0]!.onClick).toBe('function')
  })

  it('bumpUnread no-op se la party è in foreground', async () => {
    const api = await withRouter('/party/A', () => { /* idle */ })
    const settings = useSettingsStore()
    settings.notificationsChatAll = true
    api.bumpUnread('A')
    expect(api.unreadFor('A')).toBe(0)
  })

  it('bumpDirect no-op se la party è in foreground', async () => {
    const api = await withRouter('/party/A', () => { /* idle */ })
    const fb = useFeedbackStore()
    api.bumpDirect('A', 'Alpha', 'Mara')
    expect(api.directFor('A')).toBe(0)
    expect(fb.toasts).toHaveLength(0)
  })

  it('clear(seed) azzera solo quella seed', async () => {
    const api = await withRouter('/', () => { /* idle */ })
    const settings = useSettingsStore()
    settings.notificationsChatAll = true
    api.bumpUnread('A')
    api.bumpUnread('B')
    api.bumpDirect('A')
    api.clear('A')
    expect(api.unreadFor('A')).toBe(0)
    expect(api.directFor('A')).toBe(0)
    expect(api.unreadFor('B')).toBe(1)
  })
})
