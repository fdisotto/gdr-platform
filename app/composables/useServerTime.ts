import { ref } from 'vue'

export function useServerTime() {
  const offset = ref(0)
  const synced = ref(false)

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
