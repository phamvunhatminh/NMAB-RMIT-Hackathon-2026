import { describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT, prepareTurn } from './turn'

describe('prepareTurn', () => {
  it('in protected mode sends only masked text, after the token-keeping system prompt', () => {
    const turn = prepareTurn({
      history: [],
      entries: [],
      terms: [],
      text: 'Remind Minh Phat Trading Co., Ltd. to pay VND 245,000,000',
      protect: true,
    })
    expect(turn.send[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
    expect(turn.send[1]).toEqual({ role: 'user', content: 'Remind [COMPANY_1] to pay [AMOUNT_1]' })
    expect(JSON.stringify(turn.send)).not.toContain('Minh Phat')
    expect(turn.entries.map((e) => e.token)).toEqual(['[COMPANY_1]', '[AMOUNT_1]'])
  })

  it('keeps earlier turns and reuses their tokens', () => {
    const first = prepareTurn({ history: [], entries: [], terms: [], text: 'tax code 0312345678', protect: true })
    const second = prepareTurn({
      history: [first.userMessage, { role: 'assistant', content: 'Noted [TAX_ID_1].' }],
      entries: first.entries,
      terms: [],
      text: 'Check tax code 0312345678 again',
      protect: true,
    })
    expect(second.send.map((m) => m.content)).toEqual([
      SYSTEM_PROMPT,
      'tax code [TAX_ID_1]',
      'Noted [TAX_ID_1].',
      'Check tax code [TAX_ID_1] again',
    ])
    expect(second.entries).toHaveLength(1)
  })

  it('in normal mode sends the real text and masks nothing', () => {
    const turn = prepareTurn({ history: [], entries: [], terms: [], text: 'tax code 0312345678', protect: false })
    expect(turn.send).toEqual([{ role: 'user', content: 'tax code 0312345678' }])
    expect(turn.entries).toEqual([])
  })
})
