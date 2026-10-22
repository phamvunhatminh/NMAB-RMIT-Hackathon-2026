import { describe, expect, it } from 'vitest'
import { DEMO_DOCS } from './demo-docs'
import { maskText, unmaskText, type MaskEntry } from './mask'

describe('maskText, documents', () => {
  it('masks a company, its tax code, an amount and an account, keeping the context words', () => {
    const { masked, entries } = maskText(
      'Remind Minh Phat Trading Co., Ltd. (tax code 0312345678) to pay VND 750,000,000 into account 0071000123456.',
    )
    expect(masked).toBe('Remind [COMPANY_1] (tax code [TAX_ID_1]) to pay [AMOUNT_1] into account [ACCOUNT_1].')
    expect(entries).toEqual([
      { token: '[COMPANY_1]', value: 'Minh Phat Trading Co., Ltd.', category: 'parties' },
      { token: '[TAX_ID_1]', value: '0312345678', category: 'identity' },
      { token: '[AMOUNT_1]', value: 'VND 750,000,000', category: 'finance' },
      { token: '[ACCOUNT_1]', value: '0071000123456', category: 'finance' },
    ])
  })

  it('masks a joint stock company named at the start of a sentence', () => {
    expect(maskText('Hoa Binh Joint Stock Company asked for a refund').masked).toBe('[COMPANY_1] asked for a refund')
  })

  it('keeps the honorific and masks the person name after it', () => {
    expect(maskText('Dear Mr. Tran Van Hung,').masked).toBe('Dear Mr. [PERSON_1],')
  })

  it('masks a citizen ID after its context words', () => {
    expect(maskText('citizen ID 079203012345').masked).toBe('citizen ID [CITIZEN_ID_1]')
  })

  it('masks amounts written in millions', () => {
    expect(maskText('salary VND 25 million this month').masked).toBe('salary [AMOUNT_1] this month')
  })

  it('finds exactly the two companies and one person in the demo contract', () => {
    const { entries } = maskText(DEMO_DOCS[0].text)
    expect(entries.filter((e) => e.token.startsWith('[COMPANY')).map((e) => e.value)).toEqual([
      'Minh Phat Trading Co., Ltd.',
      'Hoa Binh Joint Stock Company',
    ])
    expect(entries.filter((e) => e.token.startsWith('[PERSON')).map((e) => e.value)).toEqual(['Tran Van Hung'])
  })
})

describe('maskText, contact details', () => {
  it('masks a lone phone number as a phone, not a tax ID', () => {
    expect(maskText('Call 0912345678 today').masked).toBe('Call [PHONE_1] today')
  })

  it('masks an email address', () => {
    expect(maskText('Send it to lan.nguyen@minhphat.vn please').masked).toBe('Send it to [EMAIL_1] please')
  })

  it('masks a bank account after its context words', () => {
    expect(maskText('bank account 0071000123456 at Vietcombank').masked).toBe('bank account [ACCOUNT_1] at Vietcombank')
  })

  it('masks names typed in decomposed Unicode (NFD) the same way', () => {
    expect(maskText('Dear Ms. Nguyễn Thị Lan'.normalize('NFD')).masked).toBe('Dear Ms. [PERSON_1]')
  })
})

describe('maskText, shared behaviour', () => {
  it('masks custom terms the user adds', () => {
    expect(maskText('Project Sao Mai is late', { terms: ['Sao Mai'] }).masked).toBe('Project [TERM_1] is late')
  })

  it('gives the same value the same token every time', () => {
    const { masked, entries } = maskText('tax code 0312345678 and again tax code 0312345678')
    expect(masked).toBe('tax code [TAX_ID_1] and again tax code [TAX_ID_1]')
    expect(entries).toHaveLength(1)
  })

  it('reuses existing entries and continues their numbering', () => {
    const existing: MaskEntry[] = [{ token: '[COMPANY_1]', value: 'Minh Phat Trading Co., Ltd.', category: 'parties' }]
    const { masked, entries } = maskText('Minh Phat Trading Co., Ltd. and Hoa Binh Joint Stock Company', { existing })
    expect(masked).toBe('[COMPANY_1] and [COMPANY_2]')
    expect(entries.map((e) => e.token)).toEqual(['[COMPANY_1]', '[COMPANY_2]'])
  })

  it('leaves text with nothing sensitive unchanged', () => {
    expect(maskText('Summarise this email for me').masked).toBe('Summarise this email for me')
  })
})

describe('unmaskText', () => {
  const entries: MaskEntry[] = [
    { token: '[COMPANY_1]', value: 'Minh Phat Trading Co., Ltd.', category: 'parties' },
    { token: '[AMOUNT_1]', value: 'VND 750,000,000', category: 'finance' },
  ]

  it('puts every real value back', () => {
    expect(unmaskText('Dear [COMPANY_1], you owe [AMOUNT_1].', entries)).toBe(
      'Dear Minh Phat Trading Co., Ltd., you owe VND 750,000,000.',
    )
  })

  it('leaves tokens it has no entry for as they are', () => {
    expect(unmaskText('[COMPANY_1] and [ACCOUNT_1]', entries)).toBe('Minh Phat Trading Co., Ltd. and [ACCOUNT_1]')
  })

  it('never puts real values into www. or mailto: links either', () => {
    expect(unmaskText('www.evil.example/?q=[COMPANY_1] and mailto:x@evil.example?body=[AMOUNT_1]', entries)).toBe(
      'www.evil.example/?q=[COMPANY_1] and mailto:x@evil.example?body=[AMOUNT_1]',
    )
  })

  it('never puts real values into links the AI wrote', () => {
    const reply = 'Send to [COMPANY_1] at https://evil.example/c?d=[COMPANY_1],[AMOUNT_1] please'
    expect(unmaskText(reply, entries)).toBe(
      'Send to Minh Phat Trading Co., Ltd. at https://evil.example/c?d=[COMPANY_1],[AMOUNT_1] please',
    )
  })
})
