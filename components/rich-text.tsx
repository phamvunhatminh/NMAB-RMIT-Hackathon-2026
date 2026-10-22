import { Fragment, type ReactNode } from 'react'
import type { MaskEntry } from '@/lib/mask'

const TOKEN = '\\[[A-Z_]+_\\d+\\]'
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Highlights, inside one line: tokens still masked (a chip, grey when its category is locked)
 * and real values that SafeChat sealed (dotted underline). `**bold**` is kept as bold.
 */
function Highlighted({ text, entries, lockedTokens }: { text: string; entries: MaskEntry[]; lockedTokens: boolean }) {
  const values = [...new Set(entries.map((e) => e.value))].sort((a, b) => b.length - a.length)
  const re = new RegExp(`(${[TOKEN, '\\*\\*[^*]+\\*\\*', ...values.map(escapeRegExp)].join('|')})`, 'gu')
  const parts: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const s = m[0]
    if (/^\[[A-Z_]+_\d+\]$/.test(s)) parts.push(<span key={m.index} className={`token${lockedTokens ? ' locked' : ''}`}>{s}</span>)
    else if (s.startsWith('**')) parts.push(<strong key={m.index}>{s.slice(2, -2)}</strong>)
    else parts.push(<span key={m.index} className="sealed-value" title="Sealed with TideCloak">{s}</span>)
    last = m.index + s.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

/** A small, safe renderer for chat replies: paragraphs, bullet lists and headings, no HTML and no live links. */
export function RichText({ text, entries = [], lockedTokens = false }: { text: string; entries?: MaskEntry[]; lockedTokens?: boolean }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul${blocks.length}`}>
          {list.map((item, i) => (
            <li key={i}><Highlighted text={item} entries={entries} lockedTokens={lockedTokens} /></li>
          ))}
        </ul>,
      )
      list = []
    }
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
    if (bullet) { list.push(bullet[1]); continue }
    flush()
    if (!line.trim()) continue
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    blocks.push(
      <p key={`p${blocks.length}`}>
        {heading ? <strong><Highlighted text={heading[1]} entries={entries} lockedTokens={lockedTokens} /></strong>
          : <Highlighted text={line} entries={entries} lockedTokens={lockedTokens} />}
      </p>,
    )
  }
  flush()
  return <Fragment>{blocks}</Fragment>
}
