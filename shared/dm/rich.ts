// Mini-DSL per la formattazione delle missive (DM). Tag bilanciati
// stile BBCode salvati nel `body` come testo, parsati e renderizzati
// lato client su un AST tipizzato. Niente HTML serializzato, niente
// v-html: il render è un componente Vue ricorsivo che mappa l'AST in
// elementi sicuri.
//
// Tag supportati:
//   [b]...[/b]              grassetto
//   [i]...[/i]              corsivo
//   [u]...[/u]              sottolineato
//   [size=1|2|3]...[/size]  3 dimensioni di testo (small/normal/large)
//   [align=left|center|right]...[/align]
//
// Tag non riconosciuti, mismatched o non chiusi vengono lasciati come
// testo letterale (graceful fallback).

export type RichNode
  = | { type: 'text', value: string }
    | { type: 'b', children: RichNode[] }
    | { type: 'i', children: RichNode[] }
    | { type: 'u', children: RichNode[] }
    | { type: 'size', value: 1 | 2 | 3, children: RichNode[] }
    | { type: 'align', value: 'left' | 'center' | 'right', children: RichNode[] }

type ContainerNode = Exclude<RichNode, { type: 'text' }>
type Frame = { node: ContainerNode, raw: string }

const TOKEN_RE = /\[(\/?)([a-z]+)(?:=([a-z0-9]+))?\]/gi

export function parseRich(input: string): RichNode[] {
  const root: RichNode[] = []
  const stack: Frame[] = []

  function currentChildren(): RichNode[] {
    return stack.length === 0 ? root : stack[stack.length - 1]!.node.children
  }
  function pushText(s: string) {
    if (!s) return
    currentChildren().push({ type: 'text', value: s })
  }
  function buildContainer(tag: string, value: string | undefined, raw: string): Frame | null {
    const t = tag.toLowerCase()
    if (t === 'b' || t === 'i' || t === 'u') {
      return { node: { type: t, children: [] }, raw }
    }
    if (t === 'size' && (value === '1' || value === '2' || value === '3')) {
      return { node: { type: 'size', value: Number(value) as 1 | 2 | 3, children: [] }, raw }
    }
    if (t === 'align' && (value === 'left' || value === 'center' || value === 'right')) {
      return { node: { type: 'align', value, children: [] }, raw }
    }
    return null
  }

  let lastIdx = 0
  let m: RegExpExecArray | null
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(input))) {
    const [full, slash, tag, value] = m
    pushText(input.slice(lastIdx, m.index))
    lastIdx = m.index + full.length
    if (slash) {
      const top = stack[stack.length - 1]
      if (top && top.node.type === tag.toLowerCase()) {
        stack.pop()
        currentChildren().push(top.node)
      } else {
        pushText(full)
      }
    } else {
      const frame = buildContainer(tag, value, full)
      if (frame) {
        stack.push(frame)
      } else {
        pushText(full)
      }
    }
  }
  pushText(input.slice(lastIdx))

  // Tag aperti senza chiusura: degradati a testo letterale + figli inline.
  while (stack.length) {
    const top = stack.pop()!
    const parent = currentChildren()
    parent.push({ type: 'text', value: top.raw })
    for (const c of top.node.children) parent.push(c)
  }

  return root
}

// Estrae il solo testo (per anteprime nelle liste/notifiche).
export function stripRich(input: string): string {
  const ast = parseRich(input)
  return flattenText(ast).replace(/\s+/g, ' ').trim()
}

function flattenText(nodes: RichNode[]): string {
  let out = ''
  for (const n of nodes) {
    if (n.type === 'text') out += n.value
    else out += flattenText(n.children)
  }
  return out
}
