/**
 * Masks sensitive data in the browser before any text leaves it. The AI provider and SafeChat's server only ever see the tokens; the entries that
 * map tokens back to real values are sealed with TideCloak, one tag per category.
 */

/** Each category is sealed under its own TideCloak tag, so access can be revoked per category. */
export type MaskCategory = 'parties' | 'finance' | 'identity'

export interface MaskEntry {
  token: string
  value: string
  category: MaskCategory
}

interface Detector {
  re: RegExp
  prefix: string
  category: MaskCategory
  /** When set, only this capture group is masked; the groups before it (context words) stay. */
  valueGroup?: number
}

const MONEY_UNIT = '(?:million|billion|thousand|VND|USD)'
const CURRENCY = '(?:VND|USD|US\\$|\\$)'
/** Capitalised words that start sentences or headers rather than names. */
const NOT_A_NAME = '(?:Remind|Dear|Hi|Hello|Please|To|From|The|And|Between|Pay|Contract|Draft|Check|Summarise|Summarize|Write|Send|Ask|Tell|Email|Call|Subject|Buyer|Seller)'
const NAME_WORD = `(?!${NOT_A_NAME}\\b)\\p{Lu}[\\p{L}&-]*`

const DETECTORS: Detector[] = [
  { re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu, prefix: 'EMAIL', category: 'identity' },
  {
    re: /([Tt]ax (?:code|ID|id|number)|TIN)(\s*:?\s*)(\d{10}(?:-\d{3})?)(?!\d)/gu,
    prefix: 'TAX_ID',
    category: 'identity',
    valueGroup: 3,
  },
  {
    re: /([Bb]ank account|[Aa]ccount(?: (?:no\.?|number))?)(\s*:?\s*)(\d{6,20})(?!\d)/gu,
    prefix: 'ACCOUNT',
    category: 'finance',
    valueGroup: 3,
  },
  {
    re: /([Cc]itizen ID|[Nn]ational ID|ID card)(\s*(?:no\.?)?\s*:?\s*)(\d{12}|\d{9})(?!\d)/gu,
    prefix: 'CITIZEN_ID',
    category: 'identity',
    valueGroup: 3,
  },
  { re: /(?<!\d)\d{12}(?!\d)/gu, prefix: 'CITIZEN_ID', category: 'identity' },
  { re: /(?<![\d+])(?:\+84|0)[35789]\d{8}(?!\d)/gu, prefix: 'PHONE', category: 'identity' },
  {
    // "VND 750,000,000", "VND 25 million"
    re: new RegExp(`${CURRENCY}\\s?\\d{1,3}(?:[.,]\\d{3})+(?:\\s?(?:million|billion))?|${CURRENCY}\\s?\\d+(?:[.,]\\d+)?\\s?(?:million|billion|thousand)`, 'gu'),
    prefix: 'AMOUNT',
    category: 'finance',
  },
  {
    // "750,000,000 VND", "25 million", "1,250,000,000"
    re: new RegExp(
      `(?<![\\d\\w])(?:\\d{1,3}(?:[.,]\\d{3})+(?:\\s?${MONEY_UNIT}(?!\\p{L}))?|\\d+(?:[.,]\\d+)?\\s?${MONEY_UNIT}(?!\\p{L}))`,
      'gu',
    ),
    prefix: 'AMOUNT',
    category: 'finance',
  },
  {
    // Company names: capitalised words ending in a legal form.
    re: new RegExp(
      `(?:${NAME_WORD}\\s+){1,5}(?:Co\\.,?\\s?Ltd\\.?|Company Limited|Joint Stock Company|JSC|Corporation|Corp\\.?|LLC|Inc\\.?)`,
      'gu',
    ),
    prefix: 'COMPANY',
    category: 'parties',
  },
  {
    re: /(Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?)(\s+)(\p{Lu}\p{Ll}*(?:\s+\p{Lu}\p{Ll}*){0,3})/gu,
    prefix: 'PERSON',
    category: 'parties',
    valueGroup: 3,
  },
]

const TOKEN_RE = /\[[A-Z_]+_\d+\]/g

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Replaces sensitive values in `text` with tokens such as `[TAX_ID_1]`.
 * A value already in `existing` keeps its token, and new tokens continue
 * each prefix's numbering, so a whole chat shares one consistent map.
 */
export function maskText(
  input: string,
  opts: { terms?: string[]; existing?: MaskEntry[] } = {},
): { masked: string; entries: MaskEntry[] } {
  // Text pasted from PDFs can arrive decomposed (NFD); the patterns expect NFC.
  const text = input.normalize('NFC')
  const existing = opts.existing ?? []
  const byValue = new Map(existing.map((e) => [e.value, e]))
  const counters = new Map<string, number>()
  for (const e of existing) {
    const m = /^\[([A-Z_]+)_(\d+)\]$/.exec(e.token)
    if (m) counters.set(m[1], Math.max(counters.get(m[1]) ?? 0, Number(m[2])))
  }
  const created: MaskEntry[] = []

  const tokenFor = (value: string, prefix: string, category: MaskCategory) => {
    const known = byValue.get(value)
    if (known) return known.token
    const n = (counters.get(prefix) ?? 0) + 1
    counters.set(prefix, n)
    const entry = { token: `[${prefix}_${n}]`, value, category }
    byValue.set(value, entry)
    created.push(entry)
    return entry.token
  }

  const terms = (opts.terms ?? []).map((t) => t.trim().normalize('NFC')).filter(Boolean)
  const detectors: Detector[] = [
    ...terms.map((t) => ({ re: new RegExp(escapeRegExp(t), 'gu'), prefix: 'TERM', category: 'parties' as const })),
    ...DETECTORS,
  ]

  let masked = text
  for (const d of detectors) {
    masked = masked.replace(d.re, (match: string, ...groups: unknown[]) => {
      if (d.valueGroup === undefined) return tokenFor(match, d.prefix, d.category)
      // Context patterns end with the value group, so everything before it stays as written.
      const value = groups[d.valueGroup - 1] as string
      return match.slice(0, match.length - value.length) + tokenFor(value, d.prefix, d.category)
    })
  }

  created.sort((a, b) => text.indexOf(a.value) - text.indexOf(b.value))
  return { masked, entries: [...existing, ...created] }
}

const URL_RE = /(?:\bhttps?:\/\/|\bmailto:|\bwww\.)[^\s<>()"']+/gi

/**
 * Puts real values back; a token with no entry (unknown, or in a locked category) stays a token.
 * Tokens inside links stay tokens: a prompt-injected reply may build a link to smuggle data out,
 * and unmasking it would hand that link the real values.
 */
export function unmaskText(text: string, entries: MaskEntry[]): string {
  const byToken = new Map(entries.map((e) => [e.token, e.value]))
  const unmask = (part: string) => part.replace(TOKEN_RE, (token) => byToken.get(token) ?? token)
  let out = ''
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    out += unmask(text.slice(last, m.index)) + m[0]
    last = m.index + m[0].length
  }
  return out + unmask(text.slice(last))
}
