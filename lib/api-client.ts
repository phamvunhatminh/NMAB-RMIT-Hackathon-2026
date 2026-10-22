import type { UserDoc } from './types'

/** Talks to SafeChat's server with the caller's TideCloak access token. Everything sent is already ciphertext. */
async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export const fetchMe = (token: string) => call<UserDoc>('/api/me', token)

export const saveMe = (token: string, doc: Pick<UserDoc, 'sealedKeys' | 'chats'>) =>
  call<{ ok: true }>('/api/me', token, { method: 'PUT', body: JSON.stringify(doc) })

export const fetchAll = (token: string) => call<UserDoc[]>('/api/admin', token)
