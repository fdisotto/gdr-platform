import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastLevel = 'info' | 'warn' | 'danger'

export interface Toast {
  id: number
  level: ToastLevel
  title: string
  detail: string | null
  expiresAt: number
}

export interface BlockingError {
  code: string
  title: string
  body: string
  detail: string | null
  cta: string
}

const DEFAULT_TTL_MS = 5000
let nextId = 1

export const useFeedbackStore = defineStore('feedback', () => {
  const toasts = ref<Toast[]>([])
  const blocking = ref<BlockingError | null>(null)

  function pushToast(params: { level: ToastLevel, title: string, detail?: string | null, ttlMs?: number }) {
    const id = nextId++
    const ttl = params.ttlMs ?? DEFAULT_TTL_MS
    const toast: Toast = {
      id,
      level: params.level,
      title: params.title,
      detail: params.detail ?? null,
      expiresAt: Date.now() + ttl
    }
    toasts.value = [...toasts.value, toast]
    if (typeof window !== 'undefined') {
      window.setTimeout(() => dismissToast(id), ttl)
    }
  }

  function dismissToast(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  function setBlocking(err: BlockingError | null) {
    blocking.value = err
  }

  function clearBlocking() {
    blocking.value = null
  }

  function reset() {
    toasts.value = []
    blocking.value = null
  }

  return {
    toasts, blocking,
    pushToast, dismissToast,
    setBlocking, clearBlocking,
    reset
  }
})
