import { ref, type Ref } from 'vue'

// Singleton a livello di modulo: useServerTime() viene chiamato da più
// componenti (header, weather badge, connection composable) che devono
// condividere lo stesso ref di offset/synced.
let offsetRef: Ref<number> | null = null
let syncedRef: Ref<boolean> | null = null

export function useServerTime() {
  if (!offsetRef) offsetRef = ref(0)
  if (!syncedRef) syncedRef = ref(false)
  const offset = offsetRef
  const synced = syncedRef

  function sync(serverTime: number) {
    offset.value = serverTime - Date.now()
    synced.value = true
  }

  function currentTime(): number {
    return Date.now() + offset.value
  }

  function format(): string {
    const d = new Date(currentTime())
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  function formatDate(): string {
    const d = new Date(currentTime())
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  return { offset, synced, sync, currentTime, format, formatDate }
}

// Helper per i test: azzera il singleton.
export function _resetServerTimeForTests() {
  offsetRef = null
  syncedRef = null
}
