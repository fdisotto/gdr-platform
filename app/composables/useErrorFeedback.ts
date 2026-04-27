import { useFeedbackStore, type ToastLevel, type BlockingError } from '~/stores/feedback'

// Mappa codici server → presentazione utente in italiano.
// Alcuni codici sono "bloccanti": chiudono il party con modal fullscreen.
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
  master_only: { level: 'warn', title: 'Solo il master può fare questa azione' },
  // v2a auth
  invalid_credentials: { level: 'warn', title: 'Credenziali non valide' },
  account_pending: { level: 'warn', title: 'Account in attesa di approvazione' },
  account_banned: { level: 'danger', title: 'Account sospeso' },
  username_taken: { level: 'warn', title: 'Username già in uso' },
  weak_password: { level: 'warn', title: 'Password troppo debole (minimo 8 caratteri)' },
  invalid_username: { level: 'warn', title: 'Username non valido' },
  must_reset_first: { level: 'warn', title: 'Devi cambiare password prima di continuare' },
  not_member: { level: 'warn', title: 'Non sei membro di questo party' },
  // v2b: multi-party
  private_party: { level: 'warn', title: 'Party privata, serve un invito' },
  request_required: { level: 'info', title: 'Devi richiedere l\'accesso' },
  last_master: { level: 'warn', title: 'Sei l\'ultimo master, promuovi qualcuno o archivia' },
  member_limit: { level: 'warn', title: 'Party piena (30/30)' },
  party_limit: { level: 'warn', title: 'Sei già in 5 party, esci da una prima' },
  invite_invalid: { level: 'warn', title: 'Invito non valido o scaduto' },
  // v2c admin
  last_admin: { level: 'warn', title: 'Sei l\'unico superadmin attivo' },
  setting_invalid: { level: 'warn', title: 'Valore impostazione non valido' },
  // v2d multi-map
  map_type_not_found: { level: 'warn', title: 'Tipo di mappa sconosciuto' },
  map_not_found: { level: 'warn', title: 'Mappa non trovata' },
  map_limit: { level: 'warn', title: 'Limite di mappe per party raggiunto' },
  map_not_empty: { level: 'warn', title: 'Mappa non vuota: rimuovi prima player, zombi e porte in entrata' },
  cannot_delete_spawn: { level: 'warn', title: 'Non puoi cancellare la mappa di spawn: cambia spawn prima' },
  transition_invalid: { level: 'warn', title: 'Porta non valida: aree inesistenti nelle mappe collegate' },
  not_a_transition: { level: 'warn', title: 'Da qui non c\'è una porta verso quella mappa' }
}

interface BlockingSpec {
  title: string
  body: string
  cta: string
}

const BLOCKING_MAP: Record<string, BlockingSpec> = {
  session_invalid: {
    title: 'Sessione non valida',
    body: 'La tua sessione locale non è più riconosciuta. Torna alla home e rientra nelil party.',
    cta: 'Torna alla home'
  },
  session_superseded: {
    title: 'Sessione sostituita',
    body: 'Hai aperto il party in un\'altra finestra: questa sessione è stata chiusa.',
    cta: 'Torna alla home'
  },
  session_expired: {
    title: 'Sessione scaduta',
    body: 'La tua sessione è scaduta. Fai di nuovo login per continuare.',
    cta: 'Vai al login'
  },
  kicked: {
    title: 'Sei stato espulso',
    body: 'Il master ti ha rimosso dal party.',
    cta: 'Torna alla home'
  },
  banned: {
    title: 'Sei stato bannato',
    body: 'Il master ha bandito questo nickname dal party. Non puoi rientrare con lo stesso nickname.',
    cta: 'Torna alla home'
  },
  // v2b: party archiviata (auto-archive 30g o azione master).
  archived: {
    title: 'Party archiviato',
    body: 'Questa party non è più attiva. Solo un superadmin può ripristinarla.',
    cta: 'Torna alla home'
  },
  // v2c: manutenzione attiva, navigazione bloccata
  maintenance: {
    title: 'Manutenzione',
    body: 'Il server è in manutenzione. Riprova tra qualche minuto.',
    cta: 'Riprova'
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

  // Estrae il codice errore da un throw di $fetch (ofetch).
  // Il server nostro usa createError({ statusMessage: code }), ofetch lo
  // espone in err.data.statusMessage (o fallback a message).
  function extractServerCode(err: unknown): string {
    const anyErr = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    return anyErr?.data?.statusMessage ?? anyErr?.statusMessage ?? anyErr?.message ?? 'unknown'
  }

  function reportFromError(err: unknown) {
    reportError(extractServerCode(err))
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

  return { reportError, reportFromError, extractServerCode, reportKicked }
}
