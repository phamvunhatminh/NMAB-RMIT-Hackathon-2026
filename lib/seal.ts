import type { MaskCategory, MaskEntry } from './mask'

/** TideCloak's `doEncrypt`/`doDecrypt` from `useTideCloak()`, passed in so this file stays testable. */
export type Encrypt = (items: { data: string; tags: string[] }[]) => Promise<string[]>
export type Decrypt = (items: { encrypted: string; tags: string[] }[]) => Promise<unknown[]>

/** Each tag needs the realm roles `_tide_<tag>.selfencrypt` and `_tide_<tag>.selfdecrypt`. */
export const tagOf = (category: MaskCategory | 'chat' | 'apikey') => `safechat_${category}`

const asText = (v: unknown) => (typeof v === 'string' ? v : new TextDecoder().decode(v as Uint8Array))

/** Seals a chat's entries, one blob per category, so revoking one category's role locks only that category. */
export async function sealEntries(entries: MaskEntry[], enc: Encrypt): Promise<Partial<Record<MaskCategory, string>>> {
  const groups = new Map<MaskCategory, MaskEntry[]>()
  for (const e of entries) groups.set(e.category, [...(groups.get(e.category) ?? []), e])
  const categories = [...groups.keys()]
  if (!categories.length) return {}
  const sealed = await enc(categories.map((c) => ({ data: JSON.stringify(groups.get(c)), tags: [tagOf(c)] })))
  return Object.fromEntries(categories.map((c, i) => [c, sealed[i]]))
}

/**
 * Opens each category on its own: the Tide network refuses a category whose
 * selfdecrypt role the user no longer holds, and that category comes back locked.
 */
export async function openEntries(
  maps: Partial<Record<MaskCategory, string>>,
  dec: Decrypt,
): Promise<{ entries: MaskEntry[]; locked: MaskCategory[] }> {
  const entries: MaskEntry[] = []
  const locked: MaskCategory[] = []
  for (const [category, encrypted] of Object.entries(maps) as [MaskCategory, string][]) {
    try {
      const [plain] = await dec([{ encrypted, tags: [tagOf(category)] }])
      entries.push(...(JSON.parse(asText(plain)) as MaskEntry[]))
    } catch {
      locked.push(category)
    }
  }
  return { entries, locked }
}

export async function sealJson(tag: string, value: unknown, enc: Encrypt): Promise<string> {
  const [sealed] = await enc([{ data: JSON.stringify(value), tags: [tag] }])
  return sealed
}

export async function openJson<T>(tag: string, encrypted: string, dec: Decrypt): Promise<T> {
  const [plain] = await dec([{ encrypted, tags: [tag] }])
  return JSON.parse(asText(plain)) as T
}
