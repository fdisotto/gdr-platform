// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

const destroyMock = vi.fn()
const initMock = vi.fn().mockResolvedValue(undefined)

vi.mock('pixi.js', () => {
  return {
    Application: class {
      canvas = document.createElement('canvas')
      init = initMock
      destroy = destroyMock
    }
  }
})

describe('usePixiApp', () => {
  it('istanzia la PIXI.Application al mount e la distrugge a unmount', async () => {
    const { usePixiApp } = await import('~/composables/usePixiApp')

    const Comp = defineComponent({
      setup() {
        const { containerRef, app, ready } = usePixiApp({ background: 0x222222 })
        return { containerRef, app, ready }
      },
      render() {
        return h('div', { ref: 'containerRef' })
      }
    })

    const wrapper = mount(Comp, { attachTo: document.body })

    // Aspetta il microtask del lazy import + init e il flush dei ref reattivi.
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(initMock).toHaveBeenCalled()
    const initArgs = initMock.mock.calls[0]?.[0] as { background: number, autoDensity: boolean, antialias: boolean }
    expect(initArgs.background).toBe(0x222222)
    expect(initArgs.autoDensity).toBe(true)
    expect(initArgs.antialias).toBe(true)

    expect(wrapper.vm.ready).toBe(true)
    expect(wrapper.vm.app).not.toBeNull()
    // canvas deve essere stato appeso al container
    expect(wrapper.element.querySelector('canvas')).not.toBeNull()

    wrapper.unmount()
    expect(destroyMock).toHaveBeenCalledWith(true, { children: true })
    expect(wrapper.vm.app).toBeNull()
    expect(wrapper.vm.ready).toBe(false)
  })
})
