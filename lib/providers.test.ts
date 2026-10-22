import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadProvider } from './providers'

const stream = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk))
      c.close()
    },
  })

async function collect(id: 'openrouter' | 'anthropic') {
  const provider = await loadProvider(id)
  let text = ''
  for await (const ev of provider.streamChat({ apiKey: 'k', model: 'm', messages: [{ role: 'user', content: 'hi' }] })) text += ev.text
  return text
}

afterEach(() => vi.unstubAllGlobals())

describe('providers', () => {
  it('streams OpenAI-compatible deltas, even when an event is split across chunks, and stops at [DONE]', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(stream(['data: {"choices":[{"delta":{"content":"Dear "}}]}\n\ndata: {"choices":[{"de', 'lta":{"content":"[COMPANY_1]"}}]}\n\ndata: [DONE]\n\n'])),
    )
    expect(await collect('openrouter')).toBe('Dear [COMPANY_1]')
  })

  it('streams Anthropic text deltas', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(stream(['event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n'])),
    )
    expect(await collect('anthropic')).toBe('Hello')
  })

  it("reports the provider's own error message", async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), { status: 401 }))
    await expect(collect('openrouter')).rejects.toThrow('Invalid API key')
  })
})
