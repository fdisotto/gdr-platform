// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import { useFeedbackStore } from '~/stores/feedback'

describe('useErrorFeedback', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('codice normale → toast, non blocking', () => {
    const fb = useFeedbackStore()
    const { reportError } = useErrorFeedback()
    reportError('rate_limited')
    expect(fb.blocking).toBeNull()
    expect(fb.toasts).toHaveLength(1)
    expect(fb.toasts[0]!.level).toBe('warn')
    expect(fb.toasts[0]!.title).toMatch(/fretta/i)
  })

  it('muted è toast danger', () => {
    const fb = useFeedbackStore()
    const { reportError } = useErrorFeedback()
    reportError('muted')
    expect(fb.blocking).toBeNull()
    expect(fb.toasts[0]!.level).toBe('danger')
  })

  it('session_invalid → blocking modal', () => {
    const fb = useFeedbackStore()
    const { reportError } = useErrorFeedback()
    reportError('session_invalid', 'token_expired')
    expect(fb.toasts).toHaveLength(0)
    expect(fb.blocking).not.toBeNull()
    expect(fb.blocking!.code).toBe('session_invalid')
    expect(fb.blocking!.detail).toBe('token_expired')
  })

  it('codice sconosciuto → toast generico', () => {
    const fb = useFeedbackStore()
    const { reportError } = useErrorFeedback()
    reportError('something_weird', 'detail info')
    expect(fb.toasts).toHaveLength(1)
    expect(fb.toasts[0]!.detail).toContain('something_weird')
  })

  it('reportKicked con reason "banned" → modale banned', () => {
    const fb = useFeedbackStore()
    const { reportKicked } = useErrorFeedback()
    reportKicked('banned by master')
    expect(fb.blocking!.code).toBe('banned')
  })

  it('reportKicked senza reason → modale kicked', () => {
    const fb = useFeedbackStore()
    const { reportKicked } = useErrorFeedback()
    reportKicked(null)
    expect(fb.blocking!.code).toBe('kicked')
  })

  it('toast auto-dismiss dopo TTL', () => {
    const fb = useFeedbackStore()
    const { reportError } = useErrorFeedback()
    reportError('rate_limited')
    expect(fb.toasts).toHaveLength(1)
    vi.advanceTimersByTime(3500)
    expect(fb.toasts).toHaveLength(0)
  })

  it('private_party (v2b) → toast warn dedicato', () => {
    const fb = useFeedbackStore()
    const { reportError } = useErrorFeedback()
    reportError('private_party')
    expect(fb.toasts).toHaveLength(1)
    expect(fb.toasts[0]!.level).toBe('warn')
    expect(fb.toasts[0]!.title).toMatch(/Party privata/)
  })

  it('archived (v2b) → blocking modal', () => {
    const fb = useFeedbackStore()
    const { reportError } = useErrorFeedback()
    reportError('archived')
    expect(fb.toasts).toHaveLength(0)
    expect(fb.blocking).not.toBeNull()
    expect(fb.blocking!.code).toBe('archived')
    expect(fb.blocking!.title).toMatch(/archiviata/i)
  })

  it('party_limit (v2b) → toast warn', () => {
    const fb = useFeedbackStore()
    const { reportError } = useErrorFeedback()
    reportError('party_limit')
    expect(fb.toasts[0]!.title).toMatch(/5 party/)
  })
})
