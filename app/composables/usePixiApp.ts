import { onBeforeUnmount, onMounted, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Application } from 'pixi.js'

export interface UsePixiAppOptions {
  background?: number
  backgroundAlpha?: number
  resizeTo?: HTMLElement | Window
  resolution?: number
}

export interface UsePixiAppReturn {
  // shallowRef per evitare deep-reactivity sull'oggetto PIXI (sprites, textures, ecc.)
  app: ShallowRef<Application | null>
  ready: Ref<boolean>
  containerRef: Ref<HTMLElement | null>
}

export function usePixiApp(opts: UsePixiAppOptions = {}): UsePixiAppReturn {
  const containerRef = ref<HTMLElement | null>(null)
  const app = shallowRef<Application | null>(null)
  const ready = ref(false)

  onMounted(async () => {
    if (!containerRef.value) return
    // Lazy import: pixi.js entra nel bundle solo quando engine='pixi'.
    const { Application } = await import('pixi.js')
    const instance = new Application()
    await instance.init({
      background: opts.background ?? 0x1a1a1a,
      backgroundAlpha: opts.backgroundAlpha ?? 1,
      resizeTo: opts.resizeTo ?? containerRef.value!,
      resolution: opts.resolution ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1),
      autoDensity: true,
      antialias: true
    })
    // Possibile race: il componente è stato smontato prima che init risolvesse.
    if (!containerRef.value) {
      instance.destroy(true, { children: true })
      return
    }
    containerRef.value.appendChild(instance.canvas)
    app.value = instance
    ready.value = true
  })

  onBeforeUnmount(() => {
    if (app.value) {
      app.value.destroy(true, { children: true })
      app.value = null
    }
    ready.value = false
  })

  return { app, ready, containerRef }
}
