import { maskText, type MaskEntry } from './mask'
import type { ChatMessage } from './providers'

/** Tells the model to treat tokens as opaque names, so replies can be unmasked in the browser. */
export const SYSTEM_PROMPT =
  'You are SafeChat AI, an assistant for office work. Reply in English. ' +
  'Sensitive values in the conversation have been replaced with tokens such as [COMPANY_1], [TAX_ID_1] or [AMOUNT_1]. ' +
  'Treat each token as the real value it stands for and copy tokens exactly, brackets included. Never invent values for them.'

/**
 * Builds what goes to the AI provider for one user turn. In SafeChat mode the text
 * is masked with the chat's existing entries, so the provider only ever sees
 * tokens; in normal mode it gets the real text, for the side-by-side contrast.
 */
export function prepareTurn(opts: {
  history: ChatMessage[]
  entries: MaskEntry[]
  terms: string[]
  text: string
  protect: boolean
}): { send: ChatMessage[]; userMessage: ChatMessage; entries: MaskEntry[] } {
  if (!opts.protect) {
    const userMessage: ChatMessage = { role: 'user', content: opts.text }
    return { send: [...opts.history, userMessage], userMessage, entries: opts.entries }
  }
  const { masked, entries } = maskText(opts.text, { terms: opts.terms, existing: opts.entries })
  const userMessage: ChatMessage = { role: 'user', content: masked }
  return {
    send: [{ role: 'system', content: SYSTEM_PROMPT }, ...opts.history, userMessage],
    userMessage,
    entries,
  }
}
