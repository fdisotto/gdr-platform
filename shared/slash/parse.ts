export type SlashCommand =
  | { kind: 'say', body: string }
  | { kind: 'whisper', target: string, body: string }
  | { kind: 'emote', body: string }
  | { kind: 'ooc', body: string }
  | { kind: 'shout', body: string }
  | { kind: 'roll', expr: string, hidden: boolean }
  | { kind: 'dm', target: string, body: string }
  | { kind: 'npc', npcName: string, body: string }
  | { kind: 'announce', body: string }
  | { kind: 'mute', target: string, minutes: number | null }
  | { kind: 'unmute', target: string }
  | { kind: 'kick', target: string, reason: string | null }
  | { kind: 'ban', target: string, reason: string | null }
  | { kind: 'unban', target: string }
  | { kind: 'move', target: string, areaId: string }
  | { kind: 'close', areaId: string }
  | { kind: 'open', areaId: string }
  | { kind: 'weather', areaId: string | null, code: string, intensity: number | null }
  | { kind: 'weather', areaId: string | null, clear: true }
  | { kind: 'setname', areaId: string, newName: string }
  | { kind: 'status', areaId: string, status: string }

export type ParseResult =
  | { ok: true, command: SlashCommand }
  | { ok: false, error: string }

function err(error: string): ParseResult {
  return { ok: false, error }
}

function nextToken(input: string, from: number): { token: string, next: number } | null {
  let i = from
  while (i < input.length && input[i] === ' ') i++
  if (i >= input.length) return null

  if (input[i] === '"') {
    const end = input.indexOf('"', i + 1)
    if (end === -1) return null
    return { token: input.slice(i + 1, end), next: end + 1 }
  }

  let j = i
  while (j < input.length && input[j] !== ' ') j++
  return { token: input.slice(i, j), next: j }
}

function rest(input: string, from: number): string {
  return input.slice(from).trim()
}

export function parseSlash(input: string): ParseResult {
  const trimmed = input.trimStart()
  if (!trimmed.startsWith('/')) {
    return { ok: true, command: { kind: 'say', body: input.trim() } }
  }

  const spaceIdx = trimmed.indexOf(' ')
  const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase()
  const after = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1)

  switch (cmd) {
    case '/w':
    case '/whisper': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      const body = rest(after, first.next)
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'whisper', target: first.token, body } }
    }
    case '/me': {
      const body = after.trim()
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'emote', body } }
    }
    case '/ooc': {
      const body = after.trim()
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'ooc', body } }
    }
    case '/shout': {
      const body = after.trim()
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'shout', body } }
    }
    case '/roll': {
      const expr = after.trim()
      if (!expr) return err('missing_expr')
      return { ok: true, command: { kind: 'roll', expr, hidden: false } }
    }
    case '/roll!': {
      const expr = after.trim()
      if (!expr) return err('missing_expr')
      return { ok: true, command: { kind: 'roll', expr, hidden: true } }
    }
    case '/dm': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      const body = rest(after, first.next)
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'dm', target: first.token, body } }
    }
    case '/npc': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_npc')
      const body = rest(after, first.next)
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'npc', npcName: first.token, body } }
    }
    case '/announce': {
      const body = after.trim()
      if (!body) return err('missing_body')
      return { ok: true, command: { kind: 'announce', body } }
    }
    case '/mute': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      const tail = rest(after, first.next)
      const minutes = tail ? parseInt(tail, 10) : NaN
      const m = Number.isFinite(minutes) ? minutes : null
      return { ok: true, command: { kind: 'mute', target: first.token, minutes: m } }
    }
    case '/unmute': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      return { ok: true, command: { kind: 'unmute', target: first.token } }
    }
    case '/kick':
    case '/ban': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      const reason = rest(after, first.next) || null
      const kind = cmd === '/kick' ? 'kick' : 'ban'
      return { ok: true, command: { kind, target: first.token, reason } }
    }
    case '/unban': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      return { ok: true, command: { kind: 'unban', target: first.token } }
    }
    case '/move': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_target')
      const second = nextToken(after, first.next)
      if (!second) return err('missing_area')
      return { ok: true, command: { kind: 'move', target: first.token, areaId: second.token } }
    }
    case '/close':
    case '/open': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_area')
      const kind = cmd === '/close' ? 'close' : 'open'
      return { ok: true, command: { kind, areaId: first.token } }
    }
    case '/weather': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_area')
      const second = nextToken(after, first.next)
      if (!second) return err('missing_code')
      const areaId = first.token === '*' ? null : first.token
      if (second.token.toLowerCase() === 'off') {
        return { ok: true, command: { kind: 'weather', areaId, clear: true } }
      }
      const third = nextToken(after, second.next)
      const intensity = third ? parseFloat(third.token) : NaN
      const intVal = Number.isFinite(intensity) ? intensity : null
      return { ok: true, command: { kind: 'weather', areaId, code: second.token, intensity: intVal } }
    }
    case '/setname': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_area')
      const second = nextToken(after, first.next)
      if (!second) return err('missing_name')
      return { ok: true, command: { kind: 'setname', areaId: first.token, newName: second.token } }
    }
    case '/status': {
      const first = nextToken(after, 0)
      if (!first) return err('missing_area')
      const second = nextToken(after, first.next)
      if (!second) return err('missing_status')
      return { ok: true, command: { kind: 'status', areaId: first.token, status: second.token } }
    }
    default:
      return err('unknown_command')
  }
}
