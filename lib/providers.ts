/**
 * Bring-your-own-key AI providers. The browser calls the provider directly with the user's
 * key, so SafeChat's server never sees the key or the (masked) prompt. Only masked text is
 * ever passed in here.
 */

export const PROVIDER_IDS = ['openrouter', 'openai', 'anthropic', 'google'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const textOf = (content: ChatMessage['content']) => content

export const PROVIDERS: Record<ProviderId, { name: string; keyPlaceholder: string }> = {
  openrouter: { name: 'OpenRouter', keyPlaceholder: 'sk-or-v1-…' },
  openai: { name: 'OpenAI', keyPlaceholder: 'sk-…' },
  anthropic: { name: 'Anthropic', keyPlaceholder: 'sk-ant-…' },
  google: { name: 'Google Gemini', keyPlaceholder: 'AIza…' },
}

export interface ChatRequest {
  apiKey: string
  model: string
  messages: ChatMessage[]
  signal?: AbortSignal
}

export type StreamEvent = { type: 'content'; text: string }

export interface ProviderClient {
  streamChat(request: ChatRequest): AsyncGenerator<StreamEvent>
}

/** OpenAI-compatible chat completions endpoints. */
const OPENAI_COMPATIBLE: Partial<Record<ProviderId, string>> = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
}

async function failure(res: Response): Promise<Error> {
  let detail = `HTTP ${res.status}`
  try {
    const body = await res.json()
    detail = body?.error?.message ?? body?.message ?? detail
  } catch {}
  return new Error(`The AI provider refused the request: ${detail}`)
}

/** Yields the `data:` payloads of a server-sent-events stream. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line.startsWith('data:')) yield line.slice(5).trim()
    }
  }
}

async function* openAICompatible(url: string, { apiKey, model, messages, signal }: ChatRequest): AsyncGenerator<StreamEvent> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  })
  if (!res.ok || !res.body) throw await failure(res)
  for await (const data of sseData(res.body)) {
    if (data === '[DONE]') return
    try {
      const text = JSON.parse(data)?.choices?.[0]?.delta?.content
      if (text) yield { type: 'content', text }
    } catch {}
  }
}

async function* anthropic({ apiKey, model, messages, signal }: ChatRequest): AsyncGenerator<StreamEvent> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      stream: true,
      ...(system ? { system } : {}),
      messages: messages.filter((m) => m.role !== 'system'),
    }),
    signal,
  })
  if (!res.ok || !res.body) throw await failure(res)
  for await (const data of sseData(res.body)) {
    try {
      const event = JSON.parse(data)
      if (event.type === 'content_block_delta' && event.delta?.text) yield { type: 'content', text: event.delta.text }
    } catch {}
  }
}

export async function loadProvider(id: ProviderId): Promise<ProviderClient> {
  const url = OPENAI_COMPATIBLE[id]
  return { streamChat: (request) => (url ? openAICompatible(url, request) : anthropic(request)) }
}
