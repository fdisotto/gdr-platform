import { describe, it, expect } from 'vitest'
import { parseRich, stripRich, type RichNode } from '~~/shared/dm/rich'

function txt(value: string): RichNode {
  return { type: 'text', value }
}

describe('parseRich', () => {
  it('testo plain → singolo nodo testo', () => {
    expect(parseRich('hello')).toEqual([txt('hello')])
  })

  it('grassetto/corsivo/sottolineato', () => {
    expect(parseRich('[b]ciao[/b]')).toEqual([
      { type: 'b', children: [txt('ciao')] }
    ])
    expect(parseRich('[i]a[/i]')).toEqual([
      { type: 'i', children: [txt('a')] }
    ])
    expect(parseRich('[u]a[/u]')).toEqual([
      { type: 'u', children: [txt('a')] }
    ])
  })

  it('nidificazione di tag', () => {
    expect(parseRich('[b]gra[i]nd[/i]e[/b]')).toEqual([
      {
        type: 'b',
        children: [
          txt('gra'),
          { type: 'i', children: [txt('nd')] },
          txt('e')
        ]
      }
    ])
  })

  it('size con valore valido', () => {
    expect(parseRich('[size=2]m[/size]')).toEqual([
      { type: 'size', value: 2, children: [txt('m')] }
    ])
  })

  it('size con valore non valido lasciato come testo', () => {
    const out = parseRich('[size=99]m[/size]')
    // Tag non riconosciuto → testo letterale per i delimiter, "m" rimane.
    expect(out).toEqual([txt('[size=99]'), txt('m'), txt('[/size]')])
  })

  it('align con valore valido', () => {
    expect(parseRich('[align=center]x[/align]')).toEqual([
      { type: 'align', value: 'center', children: [txt('x')] }
    ])
  })

  it('tag aperto senza chiusura → testo letterale + figli inline', () => {
    expect(parseRich('[b]xyz')).toEqual([txt('[b]'), txt('xyz')])
  })

  it('tag chiuso orfano → testo letterale', () => {
    expect(parseRich('xyz[/b]')).toEqual([txt('xyz'), txt('[/b]')])
  })

  it('mismatch (apertura b, chiusura i) → entrambi testo', () => {
    expect(parseRich('[b]x[/i]')).toEqual([
      txt('[b]'),
      txt('x'),
      txt('[/i]')
    ])
  })

  it('testo intorno e in mezzo a tag', () => {
    expect(parseRich('hi [b]bold[/b] bye')).toEqual([
      txt('hi '),
      { type: 'b', children: [txt('bold')] },
      txt(' bye')
    ])
  })
})

describe('stripRich', () => {
  it('rimuove i tag e collassa whitespace', () => {
    expect(stripRich('[b]  ciao [/b]  [i]mondo[/i]')).toBe('ciao mondo')
  })

  it('preserva il testo letterale dei tag mismatched', () => {
    expect(stripRich('[b]testo')).toBe('[b]testo')
  })

  it('plain → invariato (trim/collapse)', () => {
    expect(stripRich('  hello   world  ')).toBe('hello world')
  })
})
