import { ref, watch, type Ref } from 'vue'

export interface PartySession {
  seed: string
  sessionToken: string
  role: 'user' | 'master'
  joinedAt: number
}

// Stato a livello di modulo: singleton condiviso fra tutte le chiamate a
// useSession() nei vari componenti. Senza questo il nickname settato in un
// componente non si vedeva in un altro (ogni useSession creava un ref locale).
let nicknameRef: Ref<string | null> | null = null

const NICKNAME_KEY = 'gdr.nickname'
const SESSIONS_KEY = 'gdr.sessions'
const MASTER_TOKENS_KEY = 'gdr.masterTokens'

function readNickname(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(NICKNAME_KEY)
}

function readSessions(): Record<string, PartySession> {
  if (typeof localStorage === 'undefined') return {}
  const raw = localStorage.getItem(SESSIONS_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, PartySession>
  } catch {
    return {}
  }
}

function writeSessions(data: Record<string, PartySession>) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(data))
}

function readMasterTokens(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  const raw = localStorage.getItem(MASTER_TOKENS_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

function writeMasterTokens(data: Record<string, string>) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(MASTER_TOKENS_KEY, JSON.stringify(data))
}

export function useSession() {
  if (!nicknameRef) {
    nicknameRef = ref(readNickname())
    watch(nicknameRef, (v) => {
      if (typeof localStorage === 'undefined') return
      if (v === null || v === '') localStorage.removeItem(NICKNAME_KEY)
      else localStorage.setItem(NICKNAME_KEY, v)
    })
  }
  const nickname = nicknameRef

  function setNickname(v: string) {
    nickname.value = v.trim()
  }
  function clearNickname() {
    nickname.value = null
  }

  function listSessions(): PartySession[] {
    return Object.values(readSessions())
  }
  function addSession(s: PartySession) {
    const cur = readSessions()
    cur[s.seed] = s
    writeSessions(cur)
  }
  function removeSession(seed: string) {
    const cur = readSessions()
    const { [seed]: _removed, ...rest } = cur
    writeSessions(rest)
  }
  function getSession(seed: string): PartySession | null {
    return readSessions()[seed] ?? null
  }

  function setMasterToken(seed: string, token: string) {
    const cur = readMasterTokens()
    cur[seed] = token
    writeMasterTokens(cur)
  }
  function getMasterToken(seed: string): string | null {
    return readMasterTokens()[seed] ?? null
  }
  function removeMasterToken(seed: string) {
    const cur = readMasterTokens()
    const { [seed]: _removed, ...rest } = cur
    writeMasterTokens(rest)
  }

  return {
    nickname,
    setNickname, clearNickname,
    listSessions, addSession, removeSession, getSession,
    setMasterToken, getMasterToken, removeMasterToken
  }
}

// Helper per i test: riallinea il ref singleton allo stato corrente del
// localStorage. Da chiamare in `beforeEach` dopo `localStorage.clear()`.
export function _resetSessionForTests() {
  nicknameRef = null
}
