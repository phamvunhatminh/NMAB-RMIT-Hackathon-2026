import type { ReactNode } from 'react'
import type { ChatMessage } from '@/lib/providers'
import { textOf } from '@/lib/providers'

const TOKEN_SPLIT = /(\[[A-Z_]+_\d+\])/
const IS_TOKEN = /^\[[A-Z_]+_\d+\]$/

/**
 * Shows the exact request body SafeChat sent to the AI provider for the last turn.
 * `children` sit at the bottom of the panel (the chat puts the Tide network's checks there).
 */
export function AiSeesPanel({
  sent,
  exposed,
  provider,
  children,
}: {
  sent: ChatMessage[] | null
  exposed: boolean
  provider: string
  children?: ReactNode
}) {
  return (
    <aside className={`sees${exposed ? ' exposed' : ''}`}>
      <header>
        <h3>{exposed ? 'What the AI provider receives: real data' : 'What the AI provider receives'}</h3>
        <p>The exact request sent to {provider || 'the provider'} for the last message.</p>
      </header>
      <div className="sees-body">
        {!sent && <p style={{ color: '#93a2b3' }}>Send a message to see exactly what leaves your browser.</p>}
        {sent?.map((m, i) => (
          <div key={i} className="sees-msg">
            <div className="role">{m.role}</div>
            {textOf(m.content)
              .split(TOKEN_SPLIT)
              .map((part, j) => (IS_TOKEN.test(part) ? <span key={j} className="token">{part}</span> : part))}
          </div>
        ))}
      </div>
      <div className="sees-foot">
        {exposed
          ? 'Normal AI: names, tax codes and account numbers leave the company in plain text.'
          : 'SafeChat: real values never leave your browser. Only your Tide session can turn tokens back into names.'}
      </div>
      {children}
    </aside>
  )
}
