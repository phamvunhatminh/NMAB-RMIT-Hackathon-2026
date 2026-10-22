'use client'

import { TideCloakProvider, useTideCloak } from '@tidecloak/nextjs'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * SafeChat talks to TideCloak through this one interface. `live` uses the real TideCloak SDK;
 * `simulated` (the default while Tide's network is overloaded, per Tide's 22/10 guidance)
 * uses the simulated Tide network in /api/sim-tide, which enforces the same rules.
 * Set NEXT_PUBLIC_TIDE_MODE=live to switch back.
 */
export const TIDE_MODE: 'live' | 'simulated' = process.env.NEXT_PUBLIC_TIDE_MODE === 'live' ? 'live' : 'simulated'

type EncryptItems = { data: string; tags: string[] }[]
type DecryptItems = { encrypted: string; tags: string[] }[]

export interface SafeChatAuth {
  mode: 'live' | 'simulated'
  isInitializing: boolean
  authenticated: boolean
  token: string | null
  username: string
  /** The person's display name, e.g. "Lan Nguyen". */
  displayName: string
  hasRealmRole: (role: string) => boolean
  doEncrypt: (items: EncryptItems) => Promise<string[]>
  doDecrypt: (items: DecryptItems) => Promise<unknown[]>
  /** In simulated mode, the persona to sign in as. */
  login: (username?: string) => void | Promise<void>
  logout: () => void
}

const Ctx = createContext<SafeChatAuth | null>(null)

export function useAuth(): SafeChatAuth {
  const auth = useContext(Ctx)
  if (!auth) throw new Error('useAuth outside AuthProvider')
  return auth
}

const TOKEN_KEY = 'safechat-sim-token'

function claimsOf(token: string | null): { preferred_username?: string; name?: string; realm_access?: { roles?: string[] } } {
  if (!token) return {}
  try {
    return JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

function SimulatedProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [isInitializing, setInitializing] = useState(true)

  const call = useCallback(
    async <T,>(action: string, body: unknown, bearer = token): Promise<T> => {
      const res = await fetch(`/api/sim-tide/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `${action} failed`)
      return json as T
    },
    [token],
  )

  // Restore the session and refresh its roles from the network's current state.
  useEffect(() => {
    let stored: string | null = null
    try {
      stored = sessionStorage.getItem(TOKEN_KEY)
    } catch {}
    if (!stored) return setInitializing(false)
    call<{ token: string }>('refresh', {}, stored)
      .then(({ token: t }) => setToken(t))
      .catch(() => {})
      .finally(() => setInitializing(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Only sync once the stored session has been restored; before that, a null token would wipe it.
  useEffect(() => {
    if (isInitializing) return
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token)
      else sessionStorage.removeItem(TOKEN_KEY)
    } catch {}
  }, [token, isInitializing])

  const value = useMemo<SafeChatAuth>(() => {
    const claims = claimsOf(token)
    return {
      mode: 'simulated',
      isInitializing,
      authenticated: Boolean(token),
      token,
      username: claims.preferred_username ?? '',
      displayName: claims.name ?? claims.preferred_username ?? '',
      hasRealmRole: (role) => Boolean(claims.realm_access?.roles?.includes(role)),
      doEncrypt: (items) => call<string[]>('encrypt', { items }),
      doDecrypt: (items) => call<unknown[]>('decrypt', { items }),
      login: async (username) => setToken((await call<{ token: string }>('login', { username }, null)).token),
      logout: () => setToken(null),
    }
  }, [token, isInitializing, call])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function LiveBridge({ children }: { children: ReactNode }) {
  const tc = useTideCloak()
  const value = useMemo<SafeChatAuth>(
    () => ({
      mode: 'live',
      isInitializing: tc.isInitializing,
      authenticated: tc.authenticated,
      token: tc.token ?? null,
      username: tc.authenticated ? String(tc.getValueFromIdToken('preferred_username') ?? '') : '',
      displayName: tc.authenticated ? String(tc.getValueFromIdToken('name') ?? tc.getValueFromIdToken('preferred_username') ?? '') : '',
      hasRealmRole: (role) => tc.authenticated && tc.hasRealmRole(role),
      doEncrypt: (items) => tc.doEncrypt(items) as Promise<string[]>,
      doDecrypt: (items) => tc.doDecrypt(items) as Promise<unknown[]>,
      login: () => tc.login(),
      logout: () => tc.logout(),
    }),
    [tc],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function AuthProvider({ config, children }: { config: Record<string, unknown>; children: ReactNode }) {
  if (TIDE_MODE === 'simulated') return <SimulatedProvider>{children}</SimulatedProvider>
  return (
    <TideCloakProvider config={config}>
      <LiveBridge>{children}</LiveBridge>
    </TideCloakProvider>
  )
}
