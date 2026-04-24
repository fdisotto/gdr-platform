import { ref, type Ref } from 'vue'

// Singleton a livello di modulo
let offsetRef: Ref<number> | null = null
let syncedRef: Ref<boolean> | null = null
let tickRef: Ref<number> | null = null
let tickerTimer: ReturnType<typeof setInterval> | null = null

function ensureTicker() {
  if (typeof window === 'undefined') return
  if (tickerTimer) return
  tickerTimer = setInterval(() => {
    if (tickRef) tickRef.value++
  }, 1000)
}

export function useServerTime() {
  if (!offsetRef) offsetRef = ref(0)
  if (!syncedRef) syncedRef = ref(false)
  if (!tickRef) tickRef = ref(0)
  ensureTicker()

  const offset = offsetRef
  const synced = syncedRef
  const tick = tickRef

  function sync(serverTime: number) {
    offset.value = serverTime - Date.now()
    synced.value = true
  }

  function currentTime(): number {
    // Lettura reattiva di tick così Vue ricalcola ogni secondo nei computed
    void tick.value
    return Date.now() + offset.value
  }

  function format(): string {
    void tick.value
    const d = new Date(currentTime())
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  function formatDate(): string {
    void tick.value
    const d = new Date(currentTime())
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  return { offset, synced, tick, sync, currentTime, format, formatDate }
}

export function _resetServerTimeForTests() {
  offsetRef = null
  syncedRef = null
  tickRef = null
  if (tickerTimer) {
    clearInterval(tickerTimer)
    tickerTimer = null
  }
}
