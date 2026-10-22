import { describe, expect, it } from 'vitest'
import type { MaskEntry } from './mask'
import { openEntries, openJson, sealEntries, sealJson, type Decrypt, type Encrypt } from './seal'

// Stand-ins for TideCloak's doEncrypt/doDecrypt: the "ciphertext" records its tag,
// and decryption refuses any tag the user has lost the role for.
const enc: Encrypt = async (items) =>
  items.map((i) => `ct:${i.tags.join(',')}:${Buffer.from(i.data).toString('base64')}`)
const decWithout =
  (revoked: string[]): Decrypt =>
  async (items) =>
    items.map((i) => {
      if (i.tags.some((t) => revoked.includes(t))) throw new Error('User has not been given any access')
      const [, tags, b64] = i.encrypted.split(':')
      if (tags !== i.tags.join(',')) throw new Error('wrong tag')
      return Buffer.from(b64, 'base64').toString()
    })

const entries: MaskEntry[] = [
  { token: '[COMPANY_1]', value: 'Minh Phat Trading Co., Ltd.', category: 'parties' },
  { token: '[TAX_ID_1]', value: '0312345678', category: 'identity' },
  { token: '[AMOUNT_1]', value: 'VND 245,000,000', category: 'finance' },
]

describe('sealEntries / openEntries', () => {
  it('seals each category under its own tag and opens them all back', async () => {
    const maps = await sealEntries(entries, enc)
    expect(Object.keys(maps).sort()).toEqual(['finance', 'identity', 'parties'])
    expect(maps.parties).toMatch(/^ct:safechat_parties:/)
    expect(JSON.stringify(maps)).not.toContain('Minh Phat')

    const opened = await openEntries(maps, decWithout([]))
    expect(opened.locked).toEqual([])
    expect(opened.entries).toEqual(expect.arrayContaining(entries))
    expect(opened.entries).toHaveLength(3)
  })

  it('marks a revoked category locked and still opens the others', async () => {
    const maps = await sealEntries(entries, enc)
    const opened = await openEntries(maps, decWithout(['safechat_parties']))
    expect(opened.locked).toEqual(['parties'])
    expect(opened.entries.map((e) => e.token).sort()).toEqual(['[AMOUNT_1]', '[TAX_ID_1]'])
  })

  it('seals nothing when there are no entries', async () => {
    expect(await sealEntries([], enc)).toEqual({})
  })
})

describe('sealJson / openJson', () => {
  it('round-trips a value under the given tag', async () => {
    const ct = await sealJson('safechat_apikey', { openrouter: 'sk-or-test' }, enc)
    expect(ct).not.toContain('sk-or-test')
    expect(await openJson('safechat_apikey', ct, decWithout([]))).toEqual({ openrouter: 'sk-or-test' })
  })
})
