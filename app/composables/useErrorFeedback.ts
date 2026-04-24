import { useFeedbackStore, type ToastLevel, type BlockingError } from '~/stores/feedback'

// Mappa codici server → presentazione utente in italiano.
// Alcuni codici sono "bloccanti": chiudono la party con modal fullscreen.
// Gli altri sono toast non-bloccanti.

interface ToastSpec {
  level: ToastLevel
  title: string
  ttlMs?: number
}

const TOAST_MAP: Record<string, ToastSpec> = {
  rate_limited: { level: 'warn', title: 'Stai scrivendo troppo in fretta', ttlMs: 3000 },
  invalid_payload: { level: 'warn', title: 'Comando non valido' },
  forbidden: { level: 'warn', title: 'Operazione non consentita' },
  conflict: { level: 'warn', title: 'Conflitto, riprova' },
  bad_roll_expr: { level: 'warn', title: 'Espressione di tiro non valida (es. 2d6+3)' },
  muted: { level: 'danger', title: 'Sei silenziato: non puoi scrivere' },
  not_adjacent: { level: 'warn', title: 'Zona non raggiungibile da qui' },
  area_closed: { level: 'warn', title: 'Zona chiusa: ingresso negato' },
  not_found: { level: 'warn', title: 'Destinatario non trovato' },
  master_only: { level: 'warn', title: 'Solo il master può fare questa azione' }
}

interface BlockingSpec {
  title: string
  body: string
  cta: string
}

const BLOCKING_MAP: Record<string, BlockingSpec> = {
  session_invalid: {
    title: 'Sessione non valida',
    body: 'La tua sessione locale non è più riconosciuta. Torna alla home e rientra nella party.',
    cta: 'Torna alla home'
  },
  session_superseded: {
    title: 'Sessione sostituita',
    body: 'Hai aperto la party in un\'altra finestra: questa sessione è stata chiusa.',
    cta: 'Torna alla home'
  },
  kicked: {
    title: 'Sei stato espulso',
    body: 'Il master ti ha rimosso dalla party.',
    cta: 'Torna alla home'
  },
  banned: {
    title: 'Sei stato bannato',
    body: 'Il master ha bandito questo nickname dalla party. Non puoi rientrare con lo stesso nickname.',
    cta: 'Torna alla home'
  }
}

export function useErrorFeedback() {
  const feedback = useFeedbackStore()

  function reportError(code: string, detail: string | null = null) {
    const blocking = BLOCKING_MAP[code]
    if (blocking) {
      const blockingErr: BlockingError = {
        code,
        title: blocking.title,
        body: blocking.body,
        detail,
        cta: blocking.cta
      }
      feedback.setBlocking(blockingErr)
      return
    }
    const toast = TOAST_MAP[code]
    if (toast) {
      feedback.pushToast({
        level: toast.level,
        title: toast.title,
        detail,
        ttlMs: toast.ttlMs
      })
      return
    }
    // Codice sconosciuto: fallback prudente (toast generico, non bloccante)
    feedback.pushToast({
      level: 'warn',
      title: 'Errore',
      detail: detail ? `${code}: ${detail}` : code
    })
  }

  function reportKicked(reason: string | null) {
    // Server distingue kick vs ban col testo della reason ("banned" prefix).
    const isBan = (reason ?? '').toLowerCase().includes('ban')
    const spec = BLOCKING_MAP[isBan ? 'banned' : 'kicked']!
    feedback.setBlocking({
      code: isBan ? 'banned' : 'kicked',
      title: spec.title,
      body: spec.body,
      detail: reason,
      cta: spec.cta
    })
  }

  return { reportError, reportKicked }
}
